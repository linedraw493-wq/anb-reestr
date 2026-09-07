"""Связь с базой и накат миграций.

Миграции — простые файлы .sql, накатываются по порядку имени и запоминаются
в таблице `migratsii`. Ничего умнее для проекта такого размера не нужно.
"""

import asyncio
import logging
from pathlib import Path

import asyncpg

from . import nastroyki

log = logging.getLogger("reestr.baza")

MIGRATSII = nastroyki.KOREN / "migrations"

_pul: asyncpg.Pool | None = None
# Открываем базу под замком: на бою сервер поднимается не один раз, а на
# каждый первый запрос в новом окне, и два запроса могут прийти разом.
_zamok = asyncio.Lock()


async def otkryt() -> asyncpg.Pool:
    """Открыть базу. Повторный вызов ничего не делает — отдаёт уже открытую."""
    global _pul
    if _pul is not None:
        return _pul
    async with _zamok:
        if _pul is not None:
            return _pul
        # search_path задаём явно: у Neon он по умолчанию не включает public,
        # и все наши запросы без схемы падали бы с «relation does not exist».
        #
        # statement_cache_size=0 — обязательно для Neon и вообще для любого
        # посредника между нами и базой: он раздаёт одно соединение разным
        # запросам, а заготовленный запрос живёт в соединении. Без этого
        # сервер падает с «prepared statement already exists».
        pul = await asyncpg.create_pool(
            nastroyki.BAZA,
            min_size=1,
            max_size=nastroyki.SOEDINENIY,
            server_settings={"search_path": "public"},
            statement_cache_size=0,
        )
        await nakatit(pul)
        _pul = pul
    return _pul


async def zakryt() -> None:
    global _pul
    if _pul is not None:
        await _pul.close()
        _pul = None


def pul() -> asyncpg.Pool:
    if _pul is None:
        raise RuntimeError("База ещё не открыта")
    return _pul


# Номер замка на всю базу. Любое число, лишь бы своё и постоянное.
ZAMOK_MIGRATSIY = 728_301


async def nakatit(pool: asyncpg.Pool) -> None:
    """Накатить все .sql, которых ещё не было. Каждый — в своей транзакции.

    На бою сервер живёт в нескольких копиях сразу, и они просыпаются вместе.
    Поэтому накатка идёт под замком самой базы: вторая копия ждёт, а не
    пытается положить ту же миграцию второй раз.
    """
    async with pool.acquire() as conn:
        await conn.execute("select pg_advisory_lock($1)", ZAMOK_MIGRATSIY)
        try:
            await conn.execute(
                """
                create table if not exists migratsii (
                  imya       text primary key,
                  nakachena  timestamptz not null default now()
                )
                """
            )
            bylo = {r["imya"] for r in await conn.fetch("select imya from migratsii")}

            for fayl in sorted(p for p in MIGRATSII.glob("*.sql")):
                if fayl.name in bylo:
                    continue
                log.info("накатываю миграцию %s", fayl.name)
                sql = fayl.read_text(encoding="utf-8")
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        "insert into migratsii (imya) values ($1)", fayl.name
                    )
                log.info("миграция %s легла", fayl.name)
        finally:
            await conn.execute("select pg_advisory_unlock($1)", ZAMOK_MIGRATSIY)


async def ustanovit_admina(telefon: str, imya: str) -> None:
    """Завести владельца с полными правами. Повторный вызов ничего не ломает."""
    async with pul().acquire() as conn:
        await conn.execute(
            """
            insert into lyudi (telefon, rol, imya) values ($1, 'admin', $2)
            on conflict (telefon) do update set rol = 'admin', imya = excluded.imya
            """,
            telefon,
            imya,
        )

