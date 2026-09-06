"""Вход: приглашения, коды, сессии.

Порядок такой (решения 01–02.09.2026):
  первый раз — по личной одноразовой ссылке; дальше — телефон и код.
Код живёт пять минут, попыток пять — теперь считаем в базе, а не в браузере.
Сессия живёт 60 дней, в cookie уезжает значение, в базе лежит отпечаток.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import asyncpg
from fastapi import Request

from . import baza, nastroyki, sms, telegram

COOKIE = "sessiya"


def teper() -> datetime:
    return datetime.now(timezone.utc)


def otpechatok(znachenie: str) -> str:
    """Одностороннее превращение: из отпечатка исходное не достать."""
    return hmac.new(nastroyki.SOL.encode(), znachenie.encode(), hashlib.sha256).hexdigest()


def maska(telefon: str | None) -> str:
    """Пусто — заготовка из таблицы заказчика: номер человек впишет сам."""
    if not telefon:
        return ""
    d = "".join(ch for ch in telefon if ch.isdigit())
    if len(d) < 11:
        return telefon
    return f"+{d[0]} {d[1:4]} ••• •• {d[9:11]}"


def normalizovat_telefon(syroy: str) -> str | None:
    """+7 705 281 93 42, 8 705…, 77052819342 → +77052819342."""
    d = "".join(ch for ch in str(syroy) if ch.isdigit())
    if len(d) == 11 and d.startswith("8"):
        d = "7" + d[1:]
    if len(d) == 10 and d.startswith("7"):
        d = "7" + d
    if len(d) != 11 or not d.startswith("7"):
        return None
    return "+" + d


# ------------------------------------------------------------------- коды


def master_kod_dlya(telefon: str | None) -> bool:
    """Работает ли постоянный код для этого номера.

    Раньше `MASTER_KOD` пускал кого угодно на любой номер, и это была дыра.
    Теперь он именной: список номеров в `MASTER_KOD_TELEFONY`. Пустой список
    — код не работает ни для кого; `*` — для всех (только для своей машины).

    Номер сравнивается после приведения к единому виду: владелец пишет свой
    и как `87052819342`, и как `+77052819342` — это один и тот же человек.
    """
    if not nastroyki.MASTER_KOD:
        return False
    spisok = nastroyki.MASTER_KOD_TELEFONY.strip()
    if not spisok:
        return False
    if spisok == "*":
        return True
    if not telefon:
        return False
    nash = normalizovat_telefon(telefon)
    for syroy in spisok.split(","):
        if nash and normalizovat_telefon(syroy) == nash:
            return True
    return False


def kanal() -> str:
    """Чем сейчас шлём коды: 'sms' или 'telegram'.

    Настройка `KANAL_KODOV` по умолчанию 'auto': есть ключ Mobizon — шлём
    SMS, нет — работает старый путь через Telegram. Так стенд без ключа
    ничего не замечает, а бой переходит на SMS ровно тогда, когда ключ
    появляется в настройках, без правки кода и без перевыката.
    """
    vybor = nastroyki.KANAL_KODOV
    if vybor == "auto":
        return "sms" if sms.vklyucheno() else "telegram"
    return vybor


async def poslat(kod: str, telefon: str | None, metka: str = "") -> bool:
    """Отдать код человеку. True — канал взял сообщение.

    Запасного пути нарочно нет. Раньше «не вышло» означало «не дошло до
    чата владельца», и подстраховка была не нужна. Теперь SMS может не уйти
    по-настоящему — например абоненту Beeline с общей подписи, — и
    свалиться обратно в телеграм-чат владельца было бы худшим из решений:
    код чужого человека ушёл бы не тому. Не вышло — говорим честно, а
    админ выдаёт резервный код из админки.
    """
    if kanal() == "sms":
        if not telefon:
            # Заготовка из таблицы заказчика без номера: слать некуда.
            return False
        return await sms.poslat_kod(kod, telefon)
    return await telegram.poslat_kod(kod, maska(telefon) or metka or "вход")


async def vydat_kod(
    conn: asyncpg.Connection, chelovek_id: int, telefon: str | None, metka: str = ""
) -> str | None:
    """Возвращает 'too-often:<сек>' | 'no-delivery' | None (всё хорошо)."""
    if master_kod_dlya(telefon):
        # Для этого номера действует постоянный код — слать нечего и незачем
        # тратить деньги на SMS. Для всех остальных дальше идёт обычный путь.
        return None

    poslednii = await conn.fetchrow(
        "select sozdan_v from kody where chelovek_id = $1 order by sozdan_v desc limit 1",
        chelovek_id,
    )
    if poslednii:
        proshlo = (teper() - poslednii["sozdan_v"]).total_seconds()
        if proshlo < nastroyki.POVTOR_CHEREZ_SEK:
            return f"too-often:{int(nastroyki.POVTOR_CHEREZ_SEK - proshlo)}"

    kod = f"{secrets.randbelow(1_000_000):06d}"
    if not await poslat(kod, telefon, metka):
        return "no-delivery"

    # старые коды этого человека гасим: живым остаётся один
    await conn.execute(
        "update kody set ispolzovan_v = now() where chelovek_id = $1 and ispolzovan_v is null",
        chelovek_id,
    )
    await conn.execute(
        "insert into kody (chelovek_id, otpechatok, godin_do) values ($1, $2, $3)",
        chelovek_id,
        otpechatok(kod),
        teper() + timedelta(minutes=nastroyki.ZHIZN_KODA_MIN),
    )
    return None


async def proverit_kod(conn: asyncpg.Connection, chelovek_id: int, kod: str) -> dict:
    """{'ok': True} | {'ok': False, 'reason': 'wrong'|'expired'|'locked', ...}"""
    # Постоянный код — только для своих номеров. Телефон берём из базы, а не
    # из запроса: иначе постоянный код подошёл бы к чужому кабинету, стоило
    # прислать вместе с ним номер владельца.
    telefon = await conn.fetchval("select telefon from lyudi where id = $1", chelovek_id)
    if master_kod_dlya(telefon) and hmac.compare_digest(kod, nastroyki.MASTER_KOD):
        # Настоящего кода в базе при этом может и не быть — его не слали.
        return {"ok": True}

    zapis = await conn.fetchrow(
        """
        select id, otpechatok, popytok, godin_do from kody
        where chelovek_id = $1 and ispolzovan_v is null
        order by sozdan_v desc limit 1
        """,
        chelovek_id,
    )
    if zapis is None or zapis["godin_do"] < teper():
        return {"ok": False, "reason": "expired"}
    if zapis["popytok"] >= nastroyki.POPYTOK_NA_KOD:
        return {"ok": False, "reason": "locked"}

    if not hmac.compare_digest(zapis["otpechatok"], otpechatok(kod)):
        ostalos = await conn.fetchval(
            "update kody set popytok = popytok + 1 where id = $1 returning $2 - popytok",
            zapis["id"],
            nastroyki.POPYTOK_NA_KOD,
        )
        if ostalos <= 0:
            return {"ok": False, "reason": "locked"}
        return {"ok": False, "reason": "wrong", "attemptsLeft": ostalos}

    await conn.execute("update kody set ispolzovan_v = now() where id = $1", zapis["id"])
    return {"ok": True}


# ----------------------------------------------------------------- сессии


async def otkryt_sessiyu(conn: asyncpg.Connection, chelovek_id: int) -> str:
    znachenie = secrets.token_urlsafe(32)
    await conn.execute(
        "insert into sessii (chelovek_id, otpechatok, godna_do) values ($1, $2, $3)",
        chelovek_id,
        otpechatok(znachenie),
        teper() + timedelta(days=nastroyki.ZHIZN_SESSII_DNEY),
    )
    await conn.execute("update lyudi set poslednii_vhod = now() where id = $1", chelovek_id)
    return znachenie


async def kto_zashel(request: Request) -> asyncpg.Record | None:
    """Кто сейчас в этом запросе. None — никто."""
    znachenie = request.cookies.get(COOKIE)
    if not znachenie:
        return None
    async with baza.pul().acquire() as conn:
        return await conn.fetchrow(
            """
            select l.id, l.telefon, l.rol, l.imya
            from sessii s join lyudi l on l.id = s.chelovek_id
            where s.otpechatok = $1 and s.godna_do > now()
            """,
            otpechatok(znachenie),
        )


async def zakryt_sessiyu(znachenie: str) -> None:
    async with baza.pul().acquire() as conn:
        await conn.execute("delete from sessii where otpechatok = $1", otpechatok(znachenie))


def postavit_cookie(otvet, znachenie: str) -> None:
    otvet.set_cookie(
        COOKIE,
        znachenie,
        max_age=nastroyki.ZHIZN_SESSII_DNEY * 24 * 3600,
        httponly=True,  # скриптам недоступна — решение 02.09
        samesite="lax",
        secure=nastroyki.COOKIE_SECURE,
        path="/",
    )


# ------------------------------------------------------------ приглашения


async def novoe_priglashenie(conn: asyncpg.Connection, chelovek_id: int, kem: int | None) -> str:
    token = secrets.token_urlsafe(24)
    await conn.execute(
        """
        insert into priglasheniya (token, chelovek_id, godno_do, kem_vydano)
        values ($1, $2, $3, $4)
        """,
        token,
        chelovek_id,
        teper() + timedelta(days=nastroyki.ZHIZN_PRIGLASHENIYA_DNEY),
        kem,
    )
    return token


async def zhivoe_priglashenie(conn: asyncpg.Connection, token: str) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        select p.id, p.chelovek_id, l.telefon, k.nik
        from priglasheniya p
        join lyudi l on l.id = p.chelovek_id
        left join kartochki k on k.chelovek_id = l.id
        where p.token = $1 and p.ispolzovano_v is null and p.godno_do > now()
        """,
        token,
    )
