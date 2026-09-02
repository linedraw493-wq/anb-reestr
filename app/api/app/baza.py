"""Связь с базой и накат миграций.

Миграции — простые файлы .sql, накатываются по порядку имени и запоминаются
в таблице `migratsii`. Ничего умнее для проекта такого размера не нужно.
"""

import logging
from pathlib import Path

import asyncpg

from . import nastroyki

log = logging.getLogger("reestr.baza")

MIGRATSII = nastroyki.KOREN / "migrations"

_pul: asyncpg.Pool | None = None


async def otkryt() -> asyncpg.Pool:
    global _pul
    if _pul is None:
        # search_path задаём явно: у Neon он по умолчанию не включает public,
        # и все наши запросы без схемы падали бы с «relation does not exist».
        _pul = await asyncpg.create_pool(
            nastroyki.BAZA,
            min_size=1,
            max_size=8,
            server_settings={"search_path": "public"},
        )
        await nakatit(_pul)
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


async def nakatit(pool: asyncpg.Pool) -> None:
    """Накатить все .sql, которых ещё не было. Каждый — в своей транзакции."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            create table if not exists migratsii (
              imya       text primary key,
              nakachena  timestamptz not null default now()
            )
            """
        )
        bylo = {r["imya"] for r in await conn.fetch("select imya from migratsii")}

    fayly = sorted(p for p in MIGRATSII.glob("*.sql"))
    for fayl in fayly:
        if fayl.name in bylo:
            continue
        log.info("накатываю миграцию %s", fayl.name)
        sql = fayl.read_text(encoding="utf-8")
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("insert into migratsii (imya) values ($1)", fayl.name)
        log.info("миграция %s легла", fayl.name)


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
