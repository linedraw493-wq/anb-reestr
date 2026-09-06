"""Общая обвязка для проверок.

Проверки ходят в **настоящую базу**, не в подделку: половина того, что тут
проверяется, — это как раз запросы, права и миграции, а на подделке они
проверяются вхолостую. База отдельная, `reestr_test`: свою рабочую она не
трогает и пересобирается с нуля перед каждым прогоном.

Запуск (из `app/api`):

    ./.venv/Scripts/python.exe -m pytest

Порт базы берётся из ANB_DB_PORT, как и у стенда, по умолчанию 55432.
"""

import os
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

PORT = os.environ.get("ANB_DB_PORT", "55432")
KOREN_BAZY = f"postgresql://reestr:reestr@localhost:{PORT}/postgres"
BAZA_PROVERKI = f"postgresql://reestr:reestr@localhost:{PORT}/reestr_test"

# Настройки читаются при первом импорте `nastroyki`, поэтому окружение
# задаётся здесь — до того, как что-либо из приложения будет ввезено.
os.environ["DATABASE_URL"] = BAZA_PROVERKI
os.environ["OTP_SECRET"] = "sol-dlya-proverok"
os.environ["MASTER_KOD"] = ""  # проверки идут боевым путём, без демо-кода
os.environ["ADMIN_LOGIN"] = ""
os.environ["ADMIN_PAROL"] = ""
os.environ["ADMIN_TELEFONY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""  # чтение скрина выключено, если не сказано иначе
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["COOKIE_SECURE"] = "0"
os.environ.setdefault("MODERATSIYA", "0")


def _sol() -> str:
    return os.environ["OTP_SECRET"]


def otpechatok(znachenie: str) -> str:
    """Тот же отпечаток, что считает сервер: без него сессию не подделать."""
    return hmac.new(_sol().encode(), znachenie.encode(), hashlib.sha256).hexdigest()


async def _peresobrat_bazu() -> None:
    conn = await asyncpg.connect(KOREN_BAZY)
    try:
        await conn.execute(
            "select pg_terminate_backend(pid) from pg_stat_activity"
            " where datname = 'reestr_test' and pid <> pg_backend_pid()"
        )
        await conn.execute("drop database if exists reestr_test")
        await conn.execute("create database reestr_test")
    finally:
        await conn.close()


@pytest.fixture(scope="session")
async def klient():
    """Поднятый сервер и клиент к нему. База пересобирается один раз на прогон."""
    import httpx

    await _peresobrat_bazu()

    from app.main import app  # импорт после того, как окружение задано

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://proverka"
        ) as c:
            yield c


@pytest.fixture
async def baza_conn():
    conn = await asyncpg.connect(BAZA_PROVERKI)
    try:
        yield conn
    finally:
        await conn.close()


# ------------------------------------------------------------------ помощники


async def zavesti_cheloveka(
    conn: asyncpg.Connection, telefon: str | None, rol: str = "blogger", imya: str = "Проверка"
) -> int:
    return await conn.fetchval(
        "insert into lyudi (telefon, rol, imya) values ($1, $2, $3) returning id",
        telefon,
        rol,
        imya,
    )


async def otkryt_sessiyu(conn: asyncpg.Connection, chelovek_id: int) -> str:
    """Сессия заводится записью в базу — так же, как её заводит сам сервер.

    Пароли и коды в проверках не набираются: нам нужно проверить, что делает
    вошедший человек, а не ещё раз пройти вход. Сам вход проверяется отдельно,
    в `test_vhod.py`.
    """
    znachenie = f"proverka-{chelovek_id}-{datetime.now().timestamp()}"
    await conn.execute(
        "insert into sessii (chelovek_id, otpechatok, godna_do) values ($1, $2, $3)",
        chelovek_id,
        otpechatok(znachenie),
        datetime.now(timezone.utc) + timedelta(days=1),
    )
    return znachenie


async def zavesti_kartochku(
    conn: asyncpg.Connection,
    chelovek_id: int,
    nik: str,
    podpischiki: int = 1000,
    status: str = "published",
    ohvat: int | None = None,
) -> int:
    return await conn.fetchval(
        """
        insert into kartochki (chelovek_id, nik, podpischiki, ohvat, status, podana_v)
        values ($1, $2, $3, $4, $5, now())
        returning id
        """,
        chelovek_id,
        nik,
        podpischiki,
        ohvat,
        status,
    )
