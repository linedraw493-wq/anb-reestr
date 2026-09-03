"""Наполнить каталог заготовками из таблицы заказчика.

Спека, приёмка недели 1: «каталог показывает 277 карточек». Сейчас все 306
заготовок лежат черновиками и в каталоге не видны — заказчик открывает сайт
и видит пусто. Скрипт берёт из сырых строк CRM подписчиков и ставит
заготовки в каталог.

    py app/tools/napolnit-katalog.py            — показать, что будет
    py app/tools/napolnit-katalog.py --pishem   — записать в базу
    py app/tools/napolnit-katalog.py --ubrat    — вернуть заготовки в черновики

Что попадает в каталог: ник и подписчики со слов таблицы. Города, тематики,
ставки там нет — их впишет сам блогер, когда войдёт по приглашению. Карточка,
которую блогер подал сам, скриптом не трогается.

ПОДПИСЧИКИ В ТАБЛИЦЕ ЗАПИСАНЫ ПО-РАЗНОМУ: «6.314 тыс», «27.5 тыс»,
«7169 тыс», «913 тыс». Точка с тремя знаками — разделитель тысяч (6.314 =
6314), точка с одним-двумя — доли тысячи (27.5 = 27 500). Спорные записи
спека относит к неделе 2 («ручная чистка 70 спорных записей») — здесь
делается лучшая догадка, и она честно помечена «со слов».

ЛИЧНЫЕ ДАННЫЕ. Ников и телефонов целиком скрипт не печатает.
"""

import argparse
import asyncio
import os
import re
import sys

import asyncpg

for _p in (sys.stdout, sys.stderr):
    try:
        _p.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# По умолчанию — стенд на этой машине. Чтобы попасть в боевую базу, задайте
# DATABASE_URL: так же, как это делает сам сервер.
BAZA = os.environ.get("DATABASE_URL", "postgresql://reestr:reestr@localhost:55432/reestr")

CHISLO = re.compile(r"(\d+)(?:[.,](\d+))?")
MENSHE = 100            # меньше сотни подписчиков — это опечатка, не блогер
BOLSHE = 50_000_000     # больше пятидесяти миллионов в Казахстане не бывает


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
        # точка стоит разделителем тысяч: 6.314 — это 6314
        znachenie = int(celaya + drobnaya)
    elif drobnaya:
        # доли тысячи: 27.5 тыс — это 27 500
        znachenie = int(float(f"{celaya}.{drobnaya}") * (1000 if tysyachi else 1))
    else:
        chislo = int(celaya)
        # «913 тыс» — тысячи; «7169 тыс» — уже само число, приписка лишняя
        znachenie = chislo * 1000 if (tysyachi and chislo < 1000) else chislo

    return znachenie if MENSHE <= znachenie <= BOLSHE else None


async def main() -> None:
    razbor = argparse.ArgumentParser()
    razbor.add_argument("--pishem", action="store_true", help="записать в базу")
    razbor.add_argument("--ubrat", action="store_true", help="вернуть в черновики")
    dovod = razbor.parse_args()

    conn = await asyncpg.connect(BAZA)
    try:
        if dovod.ubrat:
            skolko = await conn.fetchval(
                "select count(*) from kartochki where status = 'published'"
                " and podana_v is null"
            )
            print(f"вернуть в черновики: {skolko}")
            if dovod.pishem:
                await conn.execute(
                    "update kartochki set status = 'draft', opublikovana_v = null"
                    " where status = 'published' and podana_v is null"
                )
                print("убрано")
            else:
                print("это показ. добавьте --pishem")
            return

        # Строк в CRM больше, чем людей: один блогер встречается несколько раз.
        # Берём по человеку первую строку, где цифры вообще разобрались.
        stroki = await conn.fetch(
            "select s.id, s.stroka->>'Подписчики' as podp, k.id as kartochka_id,"
            " k.status, k.nik"
            " from crm_syrye s join kartochki k on k.chelovek_id = s.chelovek_id"
            " where s.chelovek_id is not null order by s.id"
        )

        propushcheno = 0
        pravki: dict[int, int | None] = {}
        for r in stroki:
            if r["status"] != "draft" or not (r["nik"] or "").strip():
                # карточку подали сами или в ней нет ника — не трогаем
                propushcheno += 1
                continue
            skolko = razobrat_podpischikov(r["podp"] or "")
            if pravki.get(r["kartochka_id"]) is None:
                pravki[r["kartochka_id"]] = skolko

        s_ciframi = sum(1 for v in pravki.values() if v is not None)
        bez_cifr = len(pravki) - s_ciframi

        print(f"заготовок в каталог: {len(pravki)}")
        print(f"  из них с подписчиками со слов таблицы: {s_ciframi}")
        print(f"  без цифр (покажем без них): {bez_cifr}")
        print(f"пропущено (подана сама или без ника): {propushcheno}")

        if not dovod.pishem:
            print("\nэто показ. чтобы записать — добавьте --pishem")
            return

        async with conn.transaction():
            for kartochka_id, skolko in pravki.items():
                await conn.execute(
                    "update kartochki set podpischiki = coalesce($2, podpischiki),"
                    " istochnik = 'words', status = 'published',"
                    " opublikovana_v = coalesce(opublikovana_v, now())"
                    " where id = $1",
                    kartochka_id,
                    skolko,
                )
        print("записано. каталог наполнен")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
