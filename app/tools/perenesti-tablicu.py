"""Перенести таблицу заказчика в базу: заготовки блогеров и приглашения.

Слово владельца 02.09.2026: «мы вносим их в базу, заполнять будут сами».
Поэтому из CRM берём только то, что точно про человека — ник и телефон,
если он там нашёлся. Цифры, встречи и переписка остаются сырой строкой в
crm_syrye: разбор можно прогнать заново, ничего не потеряв.

    py app/tools/perenesti-tablicu.py data/crm.csv          — показать, что будет
    py app/tools/perenesti-tablicu.py data/crm.csv --pishem — записать в базу

Прогон повторяемый: второй раз тех же людей не заводит.

ЛИЧНЫЕ ДАННЫЕ. Файл с таблицей лежит в data/ и в git не едет никогда.
Скрипт не печатает ни телефонов, ни ников целиком.
"""

import argparse
import asyncio
import csv
import io
import json
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg

for _p in (sys.stdout, sys.stderr):
    try:
        _p.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

KOREN = Path(__file__).resolve().parents[2]
BAZA = "postgresql://reestr:reestr@localhost:55432/reestr"

TELEFON = re.compile(r"(?:\+?7|8)[\s\-()]*7\d{2}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}")
NOMER_V_NACHALE = re.compile(r"^\s*\d+\s*[\.\)]\s*(.+)$")
ZHIZN_PRIGLASHENIYA_DNEY = 30


def pochistit_nik(syroy: str) -> str:
    """«1.Sara_nurzhankyzy» → «@Sara_nurzhankyzy»."""
    imya = syroy.strip()
    sovpalo = NOMER_V_NACHALE.match(imya)
    if sovpalo:
        imya = sovpalo.group(1).strip()
    imya = imya.strip().strip("@").strip()
    imya = re.sub(r"\s+", " ", imya)
    return f"@{imya}" if imya else ""


def nayti_telefon(stroka: dict) -> str | None:
    for znachenie in stroka.values():
        if not znachenie:
            continue
        sovpalo = TELEFON.search(str(znachenie))
        if not sovpalo:
            continue
        cifry = "".join(ch for ch in sovpalo.group(0) if ch.isdigit())
        if len(cifry) == 11 and cifry.startswith("8"):
            cifry = "7" + cifry[1:]
        if len(cifry) == 11 and cifry.startswith("7"):
            return "+" + cifry
    return None


async def main() -> None:
    razbor = argparse.ArgumentParser()
    razbor.add_argument("fayl", help="csv, выгруженный из таблицы заказчика")
    razbor.add_argument("--pishem", action="store_true", help="записать в базу")
    dovody = razbor.parse_args()

    put = Path(dovody.fayl)
    if not put.is_absolute():
        put = KOREN / put
    stroki = list(csv.DictReader(io.open(put, encoding="utf-8")))

    gotovim: list[tuple[str, str | None, dict]] = []
    bez_nika = 0
    vidennye_niki: set[str] = set()
    dubli = 0

    for stroka in stroki:
        syroy_nik = (stroka.get("Блогер") or "").strip()
        nik = pochistit_nik(syroy_nik)
        if not nik:
            bez_nika += 1
            continue
        if nik.casefold() in vidennye_niki:
            dubli += 1
            continue
        vidennye_niki.add(nik.casefold())
        gotovim.append((nik, nayti_telefon(stroka), stroka))

    s_telefonom = sum(1 for _, t, _ in gotovim if t)
    print(f"строк в таблице:     {len(stroki)}")
    print(f"без ника, пропущены: {bez_nika}")
    print(f"повторы ника:        {dubli}")
    print(f"заведём:             {len(gotovim)}")
    print(f"  из них с номером:  {s_telefonom}")
    print(f"  без номера:        {len(gotovim) - s_telefonom} — впишут сами при входе")

    if not dovody.pishem:
        print("\nЭто примерка. Чтобы записать — добавь --pishem")
        return

    conn = await asyncpg.connect(BAZA)
    try:
        novyh = bylo = 0
        kto_po_niku: dict[str, int] = {}
        srok = datetime.now(timezone.utc) + timedelta(days=ZHIZN_PRIGLASHENIYA_DNEY)

        for nik, telefon, syraya in gotovim:
            async with conn.transaction():
                chelovek_id = None
                if telefon:
                    chelovek_id = await conn.fetchval(
                        "select id from lyudi where telefon = $1", telefon
                    )
                if chelovek_id is None:
                    chelovek_id = await conn.fetchval(
                        "select chelovek_id from kartochki where lower(nik) = lower($1)", nik
                    )

                if chelovek_id is None:
                    chelovek_id = await conn.fetchval(
                        "insert into lyudi (telefon, otkuda) values ($1, 'таблица заказчика') "
                        "returning id",
                        telefon,
                    )
                    novyh += 1
                else:
                    bylo += 1
                    if telefon:
                        await conn.execute(
                            "update lyudi set telefon = coalesce(telefon, $2) where id = $1",
                            chelovek_id,
                            telefon,
                        )

                await conn.execute(
                    "insert into kartochki (chelovek_id, nik) values ($1, $2) "
                    "on conflict (chelovek_id) do update set nik = excluded.nik",
                    chelovek_id,
                    nik,
                )

                # приглашение выдаём только если живого ещё нет
                zhivoe = await conn.fetchval(
                    "select id from priglasheniya where chelovek_id = $1 "
                    "and ispolzovano_v is null and godno_do > now()",
                    chelovek_id,
                )
                if zhivoe is None:
                    await conn.execute(
                        "insert into priglasheniya (token, chelovek_id, godno_do) "
                        "values ($1, $2, $3)",
                        secrets.token_urlsafe(24),
                        chelovek_id,
                        srok,
                    )

                kto_po_niku[nik.casefold()] = chelovek_id

        # Сырыми сохраняем ВСЕ строки, включая повторы: CRM это журнал
        # переписки, на человека там по несколько записей, и терять их нельзя.
        await conn.execute("delete from crm_syrye")
        for stroka in stroki:
            nik = pochistit_nik((stroka.get("Блогер") or "").strip())
            await conn.execute(
                "insert into crm_syrye (stroka, chelovek_id, zamechanie) "
                "values ($1::jsonb, $2, $3)",
                json.dumps({(k or "").strip(): v for k, v in stroka.items()},
                           ensure_ascii=False),
                kto_po_niku.get(nik.casefold()),
                None if nik else "нет ника — человека из строки не сделать",
            )

        vsego = await conn.fetchval("select count(*) from lyudi where rol = 'blogger'")
        priglasheniy = await conn.fetchval(
            "select count(*) from priglasheniya where ispolzovano_v is null"
        )
        print(f"\nзаведено новых:      {novyh}")
        print(f"уже были:            {bylo}")
        print(f"блогеров в базе:     {vsego}")
        print(f"живых приглашений:   {priglasheniy}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
