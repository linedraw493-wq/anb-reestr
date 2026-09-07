"""Завести в базу тех из таблицы заказчика, у кого есть номер телефона.

Слово владельца 07.09.2026: сначала «почисти базу в 0», следом — таблица
Ассоциации и «добавь в базу тех, кто с номерами». Без номера человека
пригласить всё равно нечем: код ему слать некуда.

    py app/tools/zavesti-s-nomerami.py data/tablica.csv            — примерка
    py app/tools/zavesti-s-nomerami.py data/tablica.csv --pishem   — записать
    py app/tools/zavesti-s-nomerami.py data/tablica.csv --pishem --boy

Что заводится: человек с номером, его карточка-заготовка (ник и подписчики
из таблицы) и живое приглашение на 30 дней. Карточка остаётся **черновиком**
— в каталог она попадёт, когда блогер войдёт и подтвердит её сам. Так
каталог не врёт: в нём только те, кто себя подтвердил.

Прогон повторяемый: второй раз тех же людей не заводит, живое приглашение
не переписывает.

ЛИЧНЫЕ ДАННЫЕ. Файл с таблицей лежит в data/ и в git не едет никогда.
Скрипт не печатает ни телефонов, ни ников целиком.
"""

import argparse
import asyncio
import csv
import io
import os
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
STEND = os.environ.get("DATABASE_URL", "postgresql://reestr:reestr@localhost:55432/reestr")

TELEFON = re.compile(r"(?:\+?7|8)[\s\-()]*7\d{2}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}")
NOMER_V_NACHALE = re.compile(r"^\s*\d+\s*[.)]\s*(.+)$")
CHISLO = re.compile(r"(\d+)(?:[.,](\d+))?")
ZHIZN_PRIGLASHENIYA_DNEY = 30
MENSHE, BOLSHE = 100, 50_000_000


def pochistit_nik(syroy: str) -> str:
    """«1.Sara_nurzhankyzy» → «@Sara_nurzhankyzy»."""
    imya = (syroy or "").strip()
    sovpalo = NOMER_V_NACHALE.match(imya)
    if sovpalo:
        imya = sovpalo.group(1).strip()
    imya = imya.strip().strip("@").strip()
    imya = re.sub(r"\s+", " ", imya)
    return f"@{imya}" if imya else ""


def nayti_telefon(stroka: dict) -> str | None:
    """Номер из любой колонки строки. Нет казахстанского номера — None."""
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


def razobrat_podpischikov(syroy: str) -> int | None:
    """«6.314 тыс» → 6314 · «27.5 тыс» → 27500 · «913 тыс» → 913000."""
    tekst = (syroy or "").strip().lower().replace(" ", "")
    if not tekst:
        return None
    tysyachi = "ыс" in tekst or tekst.endswith("k") or tekst.endswith("к")
    sovpalo = CHISLO.search(tekst)
    if not sovpalo:
        return None
    celaya, drobnaya = sovpalo.group(1), sovpalo.group(2)
    if drobnaya and len(drobnaya) == 3:
        znachenie = int(celaya + drobnaya)
    elif drobnaya:
        znachenie = int(float(f"{celaya}.{drobnaya}") * (1000 if tysyachi else 1))
    else:
        chislo = int(celaya)
        znachenie = chislo * 1000 if (tysyachi and chislo < 1000) else chislo
    return znachenie if MENSHE <= znachenie <= BOLSHE else None


def adres_boya() -> str:
    """Адрес боевой базы берём из app/.env — в код он не едет."""
    for stroka in io.open(KOREN / "app" / ".env", encoding="utf-8"):
        sovpalo = re.match(r"^NEON_DATABASE_URL=(.*)$", stroka.strip())
        if sovpalo:
            return sovpalo.group(1)
    raise SystemExit("в app/.env нет NEON_DATABASE_URL")


async def main() -> None:
    razbor = argparse.ArgumentParser()
    razbor.add_argument("fayl", help="csv, выгруженный из таблицы заказчика")
    razbor.add_argument("--pishem", action="store_true", help="записать в базу")
    razbor.add_argument("--boy", action="store_true", help="в боевую базу, а не на стенд")
    dovody = razbor.parse_args()

    put = Path(dovody.fayl)
    if not put.is_absolute():
        put = KOREN / put
    stroki = list(csv.DictReader(io.open(put, encoding="utf-8")))

    gotovim: list[tuple[str, str, int | None]] = []
    bez_nomera = bez_nika = dubli = 0
    vidennye: set[str] = set()

    for stroka in stroki:
        nik = pochistit_nik(stroka.get("Блогер") or "")
        telefon = nayti_telefon(stroka)
        if not telefon:
            bez_nomera += 1
            continue
        if not nik:
            bez_nika += 1
            continue
        if telefon in vidennye:
            dubli += 1
            continue
        vidennye.add(telefon)
        podpischiki = None
        for kolonka, znachenie in stroka.items():
            if "одписчик" in (kolonka or ""):
                podpischiki = razobrat_podpischikov(znachenie or "")
                break
        gotovim.append((nik, telefon, podpischiki))

    print(f"строк в таблице:      {len(stroki)}")
    print(f"без номера, мимо:     {bez_nomera}")
    print(f"без ника, мимо:       {bez_nika}")
    print(f"повтор номера, мимо:  {dubli}")
    print(f"заведём:              {len(gotovim)}")
    print(f"  с подписчиками:     {sum(1 for _, _, p in gotovim if p)}")

    if not dovody.pishem:
        print("\nЭто примерка. Чтобы записать — добавь --pishem")
        return

    adres = adres_boya() if dovody.boy else STEND
    print(f"\nпишем в: {'БОЙ' if dovody.boy else 'стенд'}")
    conn = await asyncpg.connect(adres)
    try:
        novyh = bylo = 0
        srok = datetime.now(timezone.utc) + timedelta(days=ZHIZN_PRIGLASHENIYA_DNEY)
        for nik, telefon, podpischiki in gotovim:
            async with conn.transaction():
                chelovek_id = await conn.fetchval(
                    "select id from lyudi where telefon = $1", telefon
                )
                if chelovek_id is None:
                    chelovek_id = await conn.fetchval(
                        "insert into lyudi (telefon, otkuda) values ($1, 'таблица заказчика')"
                        " returning id",
                        telefon,
                    )
                    novyh += 1
                else:
                    bylo += 1

                await conn.execute(
                    "insert into kartochki (chelovek_id, nik, podpischiki) values ($1,$2,$3)"
                    " on conflict (chelovek_id) do update set"
                    "   nik = excluded.nik,"
                    "   podpischiki = coalesce(kartochki.podpischiki, excluded.podpischiki)",
                    chelovek_id,
                    nik,
                    podpischiki,
                )

                zhivoe = await conn.fetchval(
                    "select id from priglasheniya where chelovek_id = $1"
                    " and ispolzovano_v is null and godno_do > now()",
                    chelovek_id,
                )
                if zhivoe is None:
                    await conn.execute(
                        "insert into priglasheniya (token, chelovek_id, godno_do)"
                        " values ($1,$2,$3)",
                        secrets.token_urlsafe(24),
                        chelovek_id,
                        srok,
                    )

        print(f"уже были:             {bylo}")
        blogerov = await conn.fetchval("select count(*) from lyudi where rol = 'blogger'")
        priglasheniy = await conn.fetchval(
            "select count(*) from priglasheniya where ispolzovano_v is null"
        )
        v_kataloge = await conn.fetchval(
            "select count(*) from kartochki where status = 'published'"
        )
        print(f"заведено новых:       {novyh}")
        print(f"блогеров в базе:      {blogerov}")
        print(f"живых приглашений:    {priglasheniy}")
        print(f"в каталоге:           {v_kataloge}"
              "  — заготовки остаются черновиками, пока человек не войдёт")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
