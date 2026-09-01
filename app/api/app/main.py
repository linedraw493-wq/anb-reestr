"""Реестр блогеров — сервер.

Одна служба: он же отдаёт собранные страницы, он же отвечает на /api.
Решение 01.09.2026 — так проще деплой и не надо возиться с разрешениями
между доменами.
"""

import io
import logging
import secrets
from datetime import timedelta
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
from fastapi import FastAPI, File, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from . import baza, nastroyki, vhod

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
# httpx пишет в лог полный адрес запроса, а в нём токен бота. Приглушаем.
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("reestr")

VLADELETS_TELEFON = "+77052819342"  # слово владельца 02.09.2026
VLADELETS_IMYA = "Даня админ+"


@asynccontextmanager
async def zhizn(_: FastAPI):
    await baza.otkryt()
    await baza.ustanovit_admina(VLADELETS_TELEFON, VLADELETS_IMYA)
    log.info("база готова, владелец на месте")
    yield
    await baza.zakryt()


app = FastAPI(title="Реестр блогеров", lifespan=zhizn, docs_url=None, redoc_url=None)


# ===================================================================== общее


async def _tekushchiy(request: Request) -> asyncpg.Record | None:
    return await vhod.kto_zashel(request)


def _net_prav() -> JSONResponse:
    return JSONResponse({"ok": False, "reason": "no-access"}, status_code=403)


async def _karta_slovarem(conn: asyncpg.Connection, kartochka: asyncpg.Record) -> dict[str, Any]:
    """Карточка в том виде, в каком её ждут экраны."""
    kid = kartochka["id"]

    tematiki = [
        r["nazvanie"]
        for r in await conn.fetch(
            """
            select t.nazvanie from kartochka_tematiki kt
            join tematiki t on t.id = kt.tematika_id
            where kt.kartochka_id = $1 order by t.poryadok
            """,
            kid,
        )
    ]
    ssylki = [
        r["adres"]
        for r in await conn.fetch(
            "select adres from ssylki where kartochka_id = $1 order by id", kid
        )
    ]
    skrin = await conn.fetchrow(
        """
        select s.kartinka_id, s.otchet_ii from skriny s
        where s.kartochka_id = $1 order by s.zagruzhen_v desc limit 1
        """,
        kid,
    )

    return {
        "id": str(kid),
        "nick": kartochka["nik"] or "",
        "photo": f"/api/kartinki/{kartochka['foto_id']}" if kartochka["foto_id"] else None,
        "ssylki": ssylki,
        "screenshot": f"/api/kartinki/{skrin['kartinka_id']}" if skrin else None,
        "followers": str(kartochka["podpischiki"] or ""),
        "reach": str(kartochka["ohvat"] or ""),
        "istochnik": kartochka["istochnik"],
        "proverka": skrin["otchet_ii"] if skrin else None,
        "tematiki": tematiki,
        "gorod": kartochka["gorod"] or "",
        "rayon": kartochka["rayon"] or "",
        "yazyk": kartochka["yazyk"] or "",
        "stavka": str(kartochka["stavka"] or ""),
        "dogovornaya": kartochka["dogovornaya"],
    }


KARTOCHKA_SELECT = """
    select k.*, g.nazvanie as gorod, r.nazvanie as rayon
    from kartochki k
    left join goroda g on g.id = k.gorod_id
    left join rayony r on r.id = k.rayon_id
"""


# ================================================================ справочники


@app.get("/api/spravochniki")
async def spravochniki():
    async with baza.pul().acquire() as conn:
        temy = [r["nazvanie"] for r in await conn.fetch(
            "select nazvanie from tematiki where vidna order by poryadok, nazvanie")]
        goroda: dict[str, list[str]] = {}
        for r in await conn.fetch(
            """
            select g.nazvanie as gorod, r.nazvanie as rayon
            from goroda g
            left join rayony r on r.gorod_id = g.id and r.vidno
            where g.vidno
            order by g.nazvanie, r.nazvanie
            """
        ):
            goroda.setdefault(r["gorod"], [])
            if r["rayon"]:
                goroda[r["gorod"]].append(r["rayon"])
    return {"tematiki": temy, "goroda": goroda, "yazyki": ["Казахский", "Русский", "Оба"]}


# ======================================================================= вход


@app.get("/api/invite/{token}")
async def priglashenie(token: str):
    async with baza.pul().acquire() as conn:
        zapis = await vhod.zhivoe_priglashenie(conn, token)
        if zapis is not None:
            # Заказчик должен видеть, кто ссылку открыл, а кто нет.
            await conn.execute(
                "update priglasheniya set otkryto_v = coalesce(otkryto_v, now()) where id = $1",
                zapis["id"],
            )
    if zapis is None:
        return {"status": "dead"}
    return {
        "status": "ok",
        "nick": zapis["nik"] or "",
        "phoneMasked": vhod.maska(zapis["telefon"]),
        "invitedAt": "",
    }


@app.post("/api/auth/start")
async def vhod_start(request: Request):
    telo = await request.json()
    token = telo.get("token")
    syroy = telo.get("phone")

    async with baza.pul().acquire() as conn:
        if token:
            zapis = await vhod.zhivoe_priglashenie(conn, token)
            if zapis is None:
                return {"ok": False, "reason": "dead-invite"}
            chelovek_id = zapis["chelovek_id"]
            telefon = zapis["telefon"]
            # Заготовка без номера: человек обязан вписать свой.
            if not telefon and not syroy:
                return {"ok": False, "reason": "need-phone"}
            if syroy:  # человек вписал или поправил номер в приглашении
                novyy = vhod.normalizovat_telefon(syroy)
                if novyy is None:
                    return {"ok": False, "reason": "bad-phone"}
                zanyat = await conn.fetchval(
                    "select id from lyudi where telefon = $1 and id <> $2", novyy, chelovek_id
                )
                if zanyat:
                    # Номер уже чей-то. Молча склеивать две записи нельзя —
                    # телефон это личность, склейка потеряет чужую карточку.
                    return {"ok": False, "reason": "phone-taken"}
                await conn.execute(
                    "update lyudi set telefon = $1 where id = $2", novyy, chelovek_id
                )
                telefon = novyy
        else:
            telefon = vhod.normalizovat_telefon(syroy or "")
            if telefon is None:
                return {"ok": False, "reason": "bad-phone"}
            chelovek_id = await conn.fetchval(
                "select id from lyudi where telefon = $1", telefon
            )
            # Слово владельца: номера нет в базе — так и пишем.
            if chelovek_id is None:
                return {"ok": False, "reason": "unknown-phone"}

        metka = await conn.fetchval(
            "select nik from kartochki where chelovek_id = $1", chelovek_id
        )
        beda = await vhod.vydat_kod(conn, chelovek_id, telefon, metka or "")

    if beda and beda.startswith("too-often:"):
        return {"ok": False, "reason": "too-often", "retryAfter": int(beda.split(":")[1])}
    if beda == "no-delivery":
        return {"ok": False, "reason": "bad-phone"}

    return {
        "ok": True,
        "resendAfter": nastroyki.POVTOR_CHEREZ_SEK,
        "phoneMasked": vhod.maska(telefon),
    }


@app.post("/api/auth/check")
async def vhod_check(request: Request):
    telo = await request.json()
    kod = "".join(ch for ch in str(telo.get("code", "")) if ch.isdigit())
    token = telo.get("token")
    syroy = telo.get("phone")

    async with baza.pul().acquire() as conn:
        if token:
            zapis = await vhod.zhivoe_priglashenie(conn, token)
            if zapis is None:
                return {"ok": False, "reason": "expired"}
            chelovek_id = zapis["chelovek_id"]
            priglashenie_id = zapis["id"]
        else:
            telefon = vhod.normalizovat_telefon(syroy or "")
            chelovek_id = (
                await conn.fetchval("select id from lyudi where telefon = $1", telefon)
                if telefon
                else None
            )
            priglashenie_id = None
            if chelovek_id is None:
                return {"ok": False, "reason": "expired"}

        itog = await vhod.proverit_kod(conn, chelovek_id, kod)
        if not itog["ok"]:
            return itog

        if priglashenie_id:  # ссылка одноразовая — гасим
            await conn.execute(
                "update priglasheniya set ispolzovano_v = now() where id = $1", priglashenie_id
            )
        await conn.execute(
            """
            insert into kartochki (chelovek_id) values ($1)
            on conflict (chelovek_id) do nothing
            """,
            chelovek_id,
        )
        znachenie = await vhod.otkryt_sessiyu(conn, chelovek_id)

    otvet = JSONResponse({"ok": True, "next": "card"})
    vhod.postavit_cookie(otvet, znachenie)
    return otvet


@app.post("/api/auth/exit")
async def vhod_exit(request: Request):
    znachenie = request.cookies.get(vhod.COOKIE)
    if znachenie:
        await vhod.zakryt_sessiyu(znachenie)
    otvet = JSONResponse({"ok": True})
    otvet.delete_cookie(vhod.COOKIE, path="/")
    return otvet


@app.get("/api/me")
async def kto_ya(request: Request):
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return {"vnutri": False}
    return {
        "vnutri": True,
        "rol": chelovek["rol"],
        "imya": chelovek["imya"],
        "telefon": vhod.maska(chelovek["telefon"]),
    }


# =================================================================== картинки


def _uzhat(bayty: bytes) -> tuple[bytes, str]:
    """Скрин с телефона — это мегабайты. В базу кладём ужатое."""
    kartinka = Image.open(io.BytesIO(bayty))
    if kartinka.mode not in ("RGB", "L"):
        kartinka = kartinka.convert("RGB")
    kartinka.thumbnail(
        (nastroyki.KARTINKA_MAX_STORONA, nastroyki.KARTINKA_MAX_STORONA * 3),
        Image.LANCZOS,
    )
    vyhod = io.BytesIO()
    kartinka.save(vyhod, format="JPEG", quality=nastroyki.KARTINKA_KACHESTVO, optimize=True)
    return vyhod.getvalue(), "image/jpeg"


async def _polozhit_kartinku(conn: asyncpg.Connection, bayty: bytes, vid: str) -> int:
    szhato, tip = _uzhat(bayty)
    return await conn.fetchval(
        "insert into kartinki (vid, tip, bayty, razmer) values ($1,$2,$3,$4) returning id",
        vid,
        tip,
        szhato,
        len(szhato),
    )


@app.get("/api/kartinki/{kartinka_id}")
async def otdat_kartinku(kartinka_id: int):
    async with baza.pul().acquire() as conn:
        zapis = await conn.fetchrow(
            "select tip, bayty from kartinki where id = $1", kartinka_id
        )
    if zapis is None:
        return JSONResponse({"ok": False}, status_code=404)
    return Response(
        content=zapis["bayty"],
        media_type=zapis["tip"],
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


# =================================================================== карточка


@app.get("/api/card")
async def moya_kartochka(request: Request):
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return _net_prav()

    async with baza.pul().acquire() as conn:
        kartochka = await conn.fetchrow(
            KARTOCHKA_SELECT + " where k.chelovek_id = $1", chelovek["id"]
        )
        if kartochka is None:
            await conn.execute(
                "insert into kartochki (chelovek_id) values ($1)", chelovek["id"]
            )
            kartochka = await conn.fetchrow(
                KARTOCHKA_SELECT + " where k.chelovek_id = $1", chelovek["id"]
            )
        karta = await _karta_slovarem(conn, kartochka)
        otkrytaya_pravka = await conn.fetchval(
            "select id from pravki_cifr where kartochka_id = $1 and status = 'moderation'",
            kartochka["id"],
        )

    return {
        "karta": karta,
        "status": kartochka["status"],
        "pravkaNaProverke": bool(otkrytaya_pravka),
        # Модератор пишет причину — блогер должен её увидеть, иначе он не
        # понимает, что поправить, и отправляет то же самое ещё раз.
        "prichinaOtkaza": kartochka["prichina_otkaza"],
    }


@app.post("/api/card/photo")
async def zagruzit_foto(request: Request, file: UploadFile = File(...)):
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return _net_prav()
    bayty = await file.read()
    if len(bayty) > nastroyki.KARTINKA_MAX_BAYT:
        return {"ok": False, "reason": "too-big"}
    async with baza.pul().acquire() as conn:
        kid = await conn.fetchval(
            "select id from kartochki where chelovek_id = $1", chelovek["id"]
        )
        kartinka_id = await _polozhit_kartinku(conn, bayty, "foto")
        await conn.execute("update kartochki set foto_id = $1 where id = $2", kartinka_id, kid)
    return {"ok": True, "url": f"/api/kartinki/{kartinka_id}"}


@app.post("/api/card/screenshot")
async def zagruzit_skrin(request: Request, file: UploadFile = File(...)):
    """Кладём скрин. ИИ-чтение отложено словом владельца 02.09 — отчёт пуст."""
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return _net_prav()
    bayty = await file.read()
    if len(bayty) > nastroyki.KARTINKA_MAX_BAYT:
        return {"ok": False}

    async with baza.pul().acquire() as conn:
        kid = await conn.fetchval(
            "select id from kartochki where chelovek_id = $1", chelovek["id"]
        )
        kartinka_id = await _polozhit_kartinku(conn, bayty, "skrin")
        await conn.execute(
            "insert into skriny (kartochka_id, kartinka_id) values ($1, $2)", kid, kartinka_id
        )
    # ok:false — «сохранили, но цифры введите сами». Так и задумано, пока нет ИИ.
    return {"ok": False, "url": f"/api/kartinki/{kartinka_id}"}


def _chislo(znachenie: Any) -> int | None:
    cifry = "".join(ch for ch in str(znachenie or "") if ch.isdigit())
    return int(cifry) if cifry else None


@app.post("/api/card")
async def sohranit_kartochku(request: Request):
    """Сохранение карточки.

    Решение 02.09: поля разрезаны на два сорта. Ник, фото, ссылки, тематика,
    язык и ставка правятся сразу. Цифры и скрин у опубликованной карточки
    уходят отдельной правкой на проверку — в каталоге до одобрения висят старые.
    """
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return _net_prav()
    telo = await request.json()

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            kartochka = await conn.fetchrow(
                "select id, status from kartochki where chelovek_id = $1", chelovek["id"]
            )
            kid = kartochka["id"]
            opublikovana = kartochka["status"] == "published"

            gorod_id = await conn.fetchval(
                "select id from goroda where nazvanie = $1", telo.get("gorod") or ""
            )
            rayon_id = (
                await conn.fetchval(
                    "select id from rayony where gorod_id = $1 and nazvanie = $2",
                    gorod_id,
                    telo.get("rayon") or "",
                )
                if gorod_id
                else None
            )

            # --- то, что правится сразу
            await conn.execute(
                """
                update kartochki set
                  nik = $2, gorod_id = $3, rayon_id = $4, yazyk = $5,
                  stavka = $6, dogovornaya = $7, obnovlena_v = now()
                where id = $1
                """,
                kid,
                (telo.get("nick") or "").strip(),
                gorod_id,
                rayon_id,
                telo.get("yazyk") or None,
                _chislo(telo.get("stavka")),
                bool(telo.get("dogovornaya")),
            )

            await conn.execute("delete from ssylki where kartochka_id = $1", kid)
            for adres in (telo.get("ssylki") or [])[:12]:
                ploshchadka = str(adres).split("/")[2] if "//" in str(adres) else "?"
                await conn.execute(
                    """
                    insert into ssylki (kartochka_id, adres, ploshchadka) values ($1,$2,$3)
                    on conflict (kartochka_id, adres) do nothing
                    """,
                    kid,
                    str(adres),
                    ploshchadka,
                )

            await conn.execute("delete from kartochka_tematiki where kartochka_id = $1", kid)
            for nazvanie in (telo.get("tematiki") or [])[: nastroyki.MAX_TEMATIK]:
                tid = await conn.fetchval(
                    "select id from tematiki where nazvanie = $1", nazvanie
                )
                if tid:
                    await conn.execute(
                        "insert into kartochka_tematiki (kartochka_id, tematika_id) values ($1,$2)",
                        kid,
                        tid,
                    )

            # --- цифры
            podpischiki = _chislo(telo.get("followers"))
            ohvat = _chislo(telo.get("reach"))
            istochnik = telo.get("istochnik") or "words"

            if opublikovana:
                stalo_inache = await conn.fetchval(
                    "select (podpischiki is distinct from $2) or (ohvat is distinct from $3) "
                    "from kartochki where id = $1",
                    kid,
                    podpischiki,
                    ohvat,
                )
                if stalo_inache:
                    skrin_id = await conn.fetchval(
                        "select id from skriny where kartochka_id = $1 "
                        "order by zagruzhen_v desc limit 1",
                        kid,
                    )
                    await conn.execute(
                        "delete from pravki_cifr where kartochka_id = $1 and status = 'moderation'",
                        kid,
                    )
                    await conn.execute(
                        """
                        insert into pravki_cifr
                          (kartochka_id, podpischiki, ohvat, skrin_id, istochnik)
                        values ($1,$2,$3,$4,$5)
                        """,
                        kid,
                        podpischiki,
                        ohvat,
                        skrin_id,
                        istochnik,
                    )
                    return {"ok": True, "status": "published", "cifryNaProverke": True}
                return {"ok": True, "status": "published", "cifryNaProverke": False}

            await conn.execute(
                """
                update kartochki set
                  podpischiki = $2, ohvat = $3, istochnik = $4,
                  status = 'moderation', podana_v = now(), prichina_otkaza = null
                where id = $1
                """,
                kid,
                podpischiki,
                ohvat,
                istochnik,
            )

    return {"ok": True, "status": "moderation", "cifryNaProverke": False}


# ================================================================== модератор


async def _modertor(request: Request) -> asyncpg.Record | None:
    chelovek = await _tekushchiy(request)
    if chelovek is None or chelovek["rol"] not in ("moderator", "admin"):
        return None
    return chelovek


@app.get("/api/moder/zayavki")
async def zayavki(request: Request):
    if await _modertor(request) is None:
        return _net_prav()

    async with baza.pul().acquire() as conn:
        stroki = await conn.fetch(KARTOCHKA_SELECT + " order by k.podana_v desc nulls last, k.id desc")
        itog = []
        for kartochka in stroki:
            karta = await _karta_slovarem(conn, kartochka)
            pravka = await conn.fetchrow(
                """
                select podpischiki, ohvat, istochnik, podana_v from pravki_cifr
                where kartochka_id = $1 and status = 'moderation'
                """,
                kartochka["id"],
            )
            itog.append(
                {
                    "karta": karta,
                    "status": kartochka["status"],
                    "podana": _kogda(kartochka["podana_v"] or kartochka["sozdana_v"]),
                    "prichina": kartochka["prichina_otkaza"],
                    "pravkaCifr": (
                        {
                            "podpischiki": str(pravka["podpischiki"] or ""),
                            "ohvat": str(pravka["ohvat"] or ""),
                            "istochnik": pravka["istochnik"],
                        }
                        if pravka
                        else None
                    ),
                }
            )
    return itog


def _kogda(kogda) -> str:
    return kogda.strftime("%d.%m.%Y %H:%M") if kogda else ""


@app.post("/api/moder/approve")
async def odobrit(request: Request):
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    kid = int((await request.json()).get("id"))

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            # если ждала правка цифр — вливаем её в карточку
            pravka = await conn.fetchrow(
                "select * from pravki_cifr where kartochka_id = $1 and status = 'moderation'",
                kid,
            )
            if pravka:
                await conn.execute(
                    """
                    update kartochki set podpischiki = $2, ohvat = $3, istochnik = $4
                    where id = $1
                    """,
                    kid,
                    pravka["podpischiki"],
                    pravka["ohvat"],
                    pravka["istochnik"],
                )
                await conn.execute(
                    "update pravki_cifr set status='approved', reshena_v=now() where id=$1",
                    pravka["id"],
                )
            await conn.execute(
                """
                update kartochki set status='published', opublikovana_v=now(),
                  prichina_otkaza=null where id=$1
                """,
                kid,
            )
            await conn.execute(
                "insert into zhurnal_moderatsii (kartochka_id, kto_id, chto) values ($1,$2,'odobril')",
                kid,
                kto["id"],
            )
    return {"ok": True}


@app.post("/api/moder/reject")
async def otklonit(request: Request):
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    kid, prichina = int(telo.get("id")), (telo.get("prichina") or "").strip()

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "update kartochki set status='rejected', prichina_otkaza=$2 where id=$1",
                kid,
                prichina,
            )
            await conn.execute(
                """
                update pravki_cifr set status='rejected', prichina_otkaza=$2, reshena_v=now()
                where kartochka_id=$1 and status='moderation'
                """,
                kid,
                prichina,
            )
            await conn.execute(
                """
                insert into zhurnal_moderatsii (kartochka_id, kto_id, chto, prichina)
                values ($1,$2,'otklonil',$3)
                """,
                kid,
                kto["id"],
                prichina,
            )
    return {"ok": True}


@app.post("/api/moder/remove")
async def udalit(request: Request):
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    kid = int((await request.json()).get("id"))
    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                insert into zhurnal_moderatsii (kartochka_id, kto_id, chto)
                values (null, $1, 'udalil')
                """,
                kto["id"],
            )
            chelovek_id = await conn.fetchval(
                "select chelovek_id from kartochki where id = $1", kid
            )
            await conn.execute("delete from lyudi where id = $1", chelovek_id)
    return {"ok": True}


@app.post("/api/moder/update")
async def popravit(request: Request):
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    kid = int(telo.get("id"))

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            gorod_id = await conn.fetchval(
                "select id from goroda where nazvanie = $1", telo.get("gorod") or ""
            )
            rayon_id = (
                await conn.fetchval(
                    "select id from rayony where gorod_id=$1 and nazvanie=$2",
                    gorod_id,
                    telo.get("rayon") or "",
                )
                if gorod_id
                else None
            )
            await conn.execute(
                """
                update kartochki set nik=$2, podpischiki=$3, ohvat=$4, gorod_id=$5,
                  rayon_id=$6, yazyk=$7, stavka=$8, dogovornaya=$9, obnovlena_v=now()
                where id=$1
                """,
                kid,
                (telo.get("nick") or "").strip(),
                _chislo(telo.get("followers")),
                _chislo(telo.get("reach")),
                gorod_id,
                rayon_id,
                telo.get("yazyk") or None,
                _chislo(telo.get("stavka")),
                bool(telo.get("dogovornaya")),
            )
            await conn.execute("delete from kartochka_tematiki where kartochka_id=$1", kid)
            for nazvanie in (telo.get("tematiki") or [])[: nastroyki.MAX_TEMATIK]:
                tid = await conn.fetchval("select id from tematiki where nazvanie=$1", nazvanie)
                if tid:
                    await conn.execute(
                        "insert into kartochka_tematiki (kartochka_id, tematika_id) values ($1,$2)",
                        kid,
                        tid,
                    )
            await conn.execute("delete from ssylki where kartochka_id=$1", kid)
            for adres in (telo.get("ssylki") or [])[:12]:
                ploshchadka = str(adres).split("/")[2] if "//" in str(adres) else "?"
                await conn.execute(
                    "insert into ssylki (kartochka_id, adres, ploshchadka) values ($1,$2,$3) "
                    "on conflict do nothing",
                    kid,
                    str(adres),
                    ploshchadka,
                )
            await conn.execute(
                "insert into zhurnal_moderatsii (kartochka_id, kto_id, chto) values ($1,$2,'popravil')",
                kid,
                kto["id"],
            )
    return {"ok": True}


@app.post("/api/moder/create")
async def zavesti(request: Request):
    """Завести карточку руками — для тех, кто сам не дошёл."""
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    telefon = vhod.normalizovat_telefon(telo.get("telefon") or "")
    if telefon is None:
        return {"ok": False, "reason": "bad-phone"}

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            chelovek_id = await conn.fetchval(
                """
                insert into lyudi (telefon, imya) values ($1, $2)
                on conflict (telefon) do update set imya = coalesce(excluded.imya, lyudi.imya)
                returning id
                """,
                telefon,
                telo.get("imya"),
            )
            await conn.execute(
                """
                insert into kartochki (chelovek_id, nik) values ($1, $2)
                on conflict (chelovek_id) do nothing
                """,
                chelovek_id,
                telo.get("nick") or "",
            )
            token = await vhod.novoe_priglashenie(conn, chelovek_id, kto["id"])
            await conn.execute(
                "insert into zhurnal_moderatsii (kto_id, chto) values ($1,'zavel')", kto["id"]
            )
            kartochka = await conn.fetchrow(
                KARTOCHKA_SELECT + " where k.chelovek_id = $1", chelovek_id
            )
            karta = await _karta_slovarem(conn, kartochka)

    return {
        "ok": True,
        "karta": karta,
        "status": kartochka["status"],
        "podana": "заведена вручную",
        "priglashenie": f"/i/{token}",
    }


# ==================================================================== каталог


# ========================================================= приглашения и коды


@app.get("/api/moder/priglasheniya")
async def priglasheniya_spisok(request: Request, poisk: str | None = None):
    """Список ссылок с состоянием. Спека, день 2-3 и день 5: «выпуск инвайтов»."""
    if await _modertor(request) is None:
        return _net_prav()

    usloviya = ["l.udalen_v is null"]
    znach: list[Any] = []
    if poisk:
        znach.append("%" + poisk.strip() + "%")
        usloviya.append("(k.nik ilike $1 or l.telefon ilike $1)")

    async with baza.pul().acquire() as conn:
        stroki = await conn.fetch(
            "select l.id as chelovek_id, l.telefon, k.nik, k.status,"
            " p.token, p.godno_do, p.otkryto_v, p.ispolzovano_v"
            " from lyudi l"
            " left join kartochki k on k.chelovek_id = l.id"
            " left join lateral ("
            "   select * from priglasheniya pp where pp.chelovek_id = l.id"
            "   order by pp.sozdano_v desc limit 1) p on true"
            " where l.rol = 'blogger' and " + " and ".join(usloviya)
            + " order by k.nik nulls last limit 500",
            *znach,
        )

    def sostoyanie(r) -> str:
        if r["status"] in ("published", "moderation", "rejected"):
            return "zaregistrirovalsya"
        if r["token"] is None:
            return "net-ssylki"
        if r["ispolzovano_v"]:
            return "ispolzovana"
        if r["godno_do"] and r["godno_do"] < vhod.teper():
            return "prosrochena"
        if r["otkryto_v"]:
            return "otkryl"
        return "ne-otkryval"

    return [
        {
            "chelovekId": r["chelovek_id"],
            "nik": r["nik"] or "",
            "telefon": vhod.maska(r["telefon"]),
            "estTelefon": bool(r["telefon"]),
            "ssylka": ("/i/" + r["token"]) if r["token"] else None,
            "sostoyanie": sostoyanie(r),
            "godnoDo": r["godno_do"].strftime("%d.%m.%Y") if r["godno_do"] else None,
        }
        for r in stroki
    ]


@app.post("/api/moder/priglashenie")
async def vypustit_priglashenie(request: Request):
    """Выпустить новую ссылку. Старые живые гасим — иначе их станет две."""
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    chelovek_id = int((await request.json()).get("chelovekId"))

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "update priglasheniya set ispolzovano_v = now()"
                " where chelovek_id = $1 and ispolzovano_v is null",
                chelovek_id,
            )
            token = await vhod.novoe_priglashenie(conn, chelovek_id, kto["id"])
            await conn.execute(
                "insert into zhurnal_moderatsii (kto_id, chto, prichina)"
                " values ($1,'zavel','выпущено приглашение')",
                kto["id"],
            )
    return {"ok": True, "ssylka": "/i/" + token}


@app.post("/api/moder/kod")
async def vydat_rezervnyy_kod(request: Request):
    """Резервный код — спека, день 5.

    Код НЕ уходит в Telegram: администратор читает его с экрана и передаёт
    человеку голосом. Нужен, когда доставка не сработала. Живой код у
    человека при этом гаснет, чтобы их не стало два.
    """
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    chelovek_id = int((await request.json()).get("chelovekId"))

    kod = "%06d" % secrets.randbelow(1_000_000)
    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            est = await conn.fetchval("select id from lyudi where id = $1", chelovek_id)
            if est is None:
                return {"ok": False, "reason": "no-person"}
            await conn.execute(
                "update kody set ispolzovan_v = now()"
                " where chelovek_id = $1 and ispolzovan_v is null",
                chelovek_id,
            )
            await conn.execute(
                "insert into kody (chelovek_id, otpechatok, godin_do) values ($1,$2,$3)",
                chelovek_id,
                vhod.otpechatok(kod),
                vhod.teper() + timedelta(minutes=nastroyki.ZHIZN_KODA_MIN),
            )
            await conn.execute(
                "insert into zhurnal_moderatsii (kto_id, chto, prichina)"
                " values ($1,'popravil','выдан резервный код')",
                kto["id"],
            )
    return {"ok": True, "kod": kod, "minut": nastroyki.ZHIZN_KODA_MIN}


@app.post("/api/moder/skryt")
async def skryt_kartochku(request: Request):
    """Скрыть карточку — спека, день 5: «скрыть/добавить».

    Раньше было только «удалить навсегда»: одно нажатие сносило человека
    вместе с приглашением. Скрытие обратимо, данные целы.
    """
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    kid = int(telo.get("id"))
    pryachem = bool(telo.get("skryt", True))
    novyy = "draft" if pryachem else "published"

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "update kartochki set status = $2,"
                " opublikovana_v = case when $2 = 'published' then now()"
                " else opublikovana_v end where id = $1",
                kid,
                novyy,
            )
            await conn.execute(
                "insert into zhurnal_moderatsii (kartochka_id, kto_id, chto, prichina)"
                " values ($1,$2,'popravil',$3)",
                kid,
                kto["id"],
                "скрыта из каталога" if pryachem else "возвращена в каталог",
            )
    return {"ok": True}


@app.get("/api/moder/svodka")
async def svodka(request: Request):
    """Дашборд: идёт наполнение или встало. Воронка показывает, где теряем."""
    if await _modertor(request) is None:
        return _net_prav()

    async with baza.pul().acquire() as conn:
        r = await conn.fetchrow(
            """
            select
              (select count(*) from kartochki where status='published')        as v_kataloge,
              (select count(*) from kartochki where status='moderation')       as zhdut,
              (select count(*) from kartochki where status='moderation'
                 and podana_v < now() - interval '1 day')                      as zhdut_dolgo,
              (select count(*) from kartochki where status='rejected')         as otkloneno,
              (select count(*) from priglasheniya)                             as vsego_ssylok,
              (select count(*) from priglasheniya where otkryto_v is not null) as otkryli,
              (select count(*) from lyudi where rol='blogger'
                 and poslednii_vhod is not null)                               as voshli,
              (select count(*) from kartochki k join lyudi l on l.id=k.chelovek_id
                 where l.rol='blogger' and k.podpischiki is not null)          as zapolnili,
              (select count(*) from kartochki where status='published'
                 and opublikovana_v > now() - interval '7 days')               as za_nedelyu,
              (select coalesce(sum(prosmotry),0) from kartochki)               as prosmotry
            """
        )
    d = dict(r)
    vsego = d["vsego_ssylok"] or 1

    def dolya(n: int) -> int:
        return round(n * 100 / vsego)

    d["voronka"] = [
        {"chto": "Разослано ссылок", "skolko": d["vsego_ssylok"], "dolya": 100},
        {"chto": "Открыли", "skolko": d["otkryli"], "dolya": dolya(d["otkryli"])},
        {"chto": "Подтвердили номер", "skolko": d["voshli"], "dolya": dolya(d["voshli"])},
        {"chto": "Заполнили карточку", "skolko": d["zapolnili"], "dolya": dolya(d["zapolnili"])},
        {"chto": "В каталоге", "skolko": d["v_kataloge"], "dolya": dolya(d["v_kataloge"])},
    ]
    return d


# =============================================================== списки-справочники


@app.get("/api/moder/spiski")
async def spiski(request: Request):
    """Тематики, города и районы с числом карточек — админ правит без нас."""
    if await _modertor(request) is None:
        return _net_prav()
    async with baza.pul().acquire() as conn:
        tematiki = await conn.fetch(
            "select t.id, t.nazvanie, t.vidna,"
            " (select count(*) from kartochka_tematiki kt where kt.tematika_id = t.id) as skolko"
            " from tematiki t order by t.poryadok, t.nazvanie"
        )
        goroda = await conn.fetch(
            "select g.id, g.nazvanie, g.vidno,"
            " (select count(*) from kartochki k where k.gorod_id = g.id) as skolko"
            " from goroda g order by g.nazvanie"
        )
        rayony = await conn.fetch(
            "select r.id, r.nazvanie, r.vidno, r.gorod_id, g.nazvanie as gorod,"
            " (select count(*) from kartochki k where k.rayon_id = r.id) as skolko"
            " from rayony r join goroda g on g.id = r.gorod_id order by g.nazvanie, r.nazvanie"
        )
    return {
        "tematiki": [dict(r) for r in tematiki],
        "goroda": [dict(r) for r in goroda],
        "rayony": [dict(r) for r in rayony],
    }


_TABLICY = {
    "tematika": ("tematiki", "vidna"),
    "gorod": ("goroda", "vidno"),
    "rayon": ("rayony", "vidno"),
}


@app.post("/api/moder/spisok")
async def spisok_pravka(request: Request):
    """Одна точка на четыре дела: добавить, переименовать, скрыть, слить.

    Удаления нет намеренно: удалишь тематику — поедут все карточки, где она
    стояла. Вместо этого «скрыть»: из выбора пропадает, у старых остаётся.
    """
    kto = await _modertor(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    tip = telo.get("tip")
    chto = telo.get("chto")
    if tip not in _TABLICY:
        return {"ok": False, "reason": "bad-type"}
    tablica, pole_vidno = _TABLICY[tip]

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            if chto == "dobavit":
                nazvanie = (telo.get("nazvanie") or "").strip()
                if not nazvanie:
                    return {"ok": False, "reason": "empty"}
                if tip == "rayon":
                    await conn.execute(
                        "insert into rayony (gorod_id, nazvanie) values ($1,$2)"
                        " on conflict do nothing",
                        int(telo["gorod_id"]),
                        nazvanie,
                    )
                else:
                    await conn.execute(
                        f"insert into {tablica} (nazvanie) values ($1) on conflict do nothing",
                        nazvanie,
                    )

            elif chto == "pereimenovat":
                nazvanie = (telo.get("nazvanie") or "").strip()
                if not nazvanie:
                    return {"ok": False, "reason": "empty"}
                # переименование безопасно: номер тот же, связи целы
                await conn.execute(
                    f"update {tablica} set nazvanie = $2 where id = $1",
                    int(telo["id"]),
                    nazvanie,
                )

            elif chto == "skryt":
                await conn.execute(
                    f"update {tablica} set {pole_vidno} = $2 where id = $1",
                    int(telo["id"]),
                    bool(telo.get("vidno", False)),
                )

            elif chto == "slit":
                # Перенести всех из одного в другой и убрать источник из выбора.
                iz_id, v_id = int(telo["iz_id"]), int(telo["v_id"])
                if iz_id == v_id:
                    return {"ok": False, "reason": "same"}

                if tip == "tematika":
                    # у карточки может уже стоять цель — тогда просто снимаем источник
                    await conn.execute(
                        "delete from kartochka_tematiki a where a.tematika_id = $1"
                        " and exists (select 1 from kartochka_tematiki b"
                        "   where b.kartochka_id = a.kartochka_id and b.tematika_id = $2)",
                        iz_id,
                        v_id,
                    )
                    await conn.execute(
                        "update kartochka_tematiki set tematika_id = $2 where tematika_id = $1",
                        iz_id,
                        v_id,
                    )
                elif tip == "gorod":
                    # район принадлежит городу — переносим и его, иначе повиснет
                    await conn.execute(
                        "update rayony set gorod_id = $2 where gorod_id = $1", iz_id, v_id
                    )
                    await conn.execute(
                        "update kartochki set gorod_id = $2 where gorod_id = $1", iz_id, v_id
                    )
                else:
                    await conn.execute(
                        "update kartochki set rayon_id = $2 where rayon_id = $1", iz_id, v_id
                    )

                await conn.execute(
                    f"update {tablica} set {pole_vidno} = false where id = $1", iz_id
                )
            else:
                return {"ok": False, "reason": "bad-action"}

            await conn.execute(
                "insert into zhurnal_moderatsii (kto_id, chto, prichina) values ($1,'popravil',$2)",
                kto["id"],
                f"списки: {chto} · {tip}",
            )
    return {"ok": True}


# ==================================================================== каталог


@app.get("/api/glavnaya")
async def glavnaya():
    """Цифры и подборки для витрины. Публично, вход не нужен."""
    async with baza.pul().acquire() as conn:
        gde = "k.status = 'published' and l.udalen_v is null"
        osnova = " from kartochki k join lyudi l on l.id = k.chelovek_id where " + gde

        vsego = await conn.fetchval("select count(*)" + osnova)
        gorodov = await conn.fetchval(
            "select count(distinct k.gorod_id)" + osnova + " and k.gorod_id is not null"
        )
        ohvat = await conn.fetchval("select coalesce(sum(k.ohvat), 0)" + osnova)

        temy = await conn.fetch(
            "select t.nazvanie, count(*) as skolko"
            " from kartochka_tematiki kt"
            " join tematiki t on t.id = kt.tematika_id"
            " join kartochki k on k.id = kt.kartochka_id"
            " join lyudi l on l.id = k.chelovek_id"
            " where " + gde + " and t.vidna"
            " group by t.nazvanie order by 2 desc, 1 limit 8"
        )
        goroda = await conn.fetch(
            "select g.nazvanie, count(*) as skolko"
            " from kartochki k join goroda g on g.id = k.gorod_id"
            " join lyudi l on l.id = k.chelovek_id"
            " where " + gde + " group by g.nazvanie order by 2 desc, 1 limit 6"
        )
        luchshie = await conn.fetch(
            KARTOCHKA_SELECT + " join lyudi l on l.id = k.chelovek_id where " + gde
            + " order by k.ohvat desc nulls last limit 3"
        )
        vitrina = [await _karta_slovarem(conn, s) for s in luchshie]

    return {
        "vsego": vsego,
        "gorodov": gorodov,
        "ohvat": int(ohvat or 0),
        "tematiki": [{"nazvanie": r["nazvanie"], "skolko": r["skolko"]} for r in temy],
        "goroda": [{"nazvanie": r["nazvanie"], "skolko": r["skolko"]} for r in goroda],
        "vitrina": vitrina,
    }


@app.get("/api/katalog")
async def katalog(
    tematika: str | None = None,
    gorod: str | None = None,
    rayon: str | None = None,
    yazyk: str | None = None,
    ot: int | None = None,
    do: int | None = None,
    ohvat_ot: int | None = None,
    stavka_do: int | None = None,
    poisk: str | None = None,
    poryadok: str = "ohvat",
    stranica: int = 1,
    na_stranice: int = 24,
):
    """Публичный каталог: каталог видим всем — решение владельца 02.09.2026."""
    usloviya = ["k.status = 'published'", "l.udalen_v is null"]
    znacheniya: list[Any] = []

    def dobavit(uslovie: str, znachenie: Any) -> None:
        znacheniya.append(znachenie)
        usloviya.append(uslovie.replace("?", f"${len(znacheniya)}"))

    if gorod:
        dobavit("g.nazvanie = ?", gorod)
    if rayon:
        dobavit("r.nazvanie = ?", rayon)
    if yazyk:
        dobavit("k.yazyk = ?", yazyk)
    if ot:
        dobavit("k.podpischiki >= ?", ot)
    if do:
        dobavit("k.podpischiki <= ?", do)
    if ohvat_ot:
        dobavit("k.ohvat >= ?", ohvat_ot)
    if stavka_do:
        # «договорная» не отсеиваем: цена не названа, значит может подойти
        dobavit("(k.stavka <= ? or k.dogovornaya)", stavka_do)
    if poisk:
        dobavit("k.nik ilike ?", f"%{poisk.strip()}%")
    if tematika:
        dobavit(
            "exists (select 1 from kartochka_tematiki kt join tematiki t on t.id = kt.tematika_id"
            " where kt.kartochka_id = k.id and t.nazvanie = ?)",
            tematika,
        )

    gde = " and ".join(usloviya)
    osnova = KARTOCHKA_SELECT + " join lyudi l on l.id = k.chelovek_id where " + gde

    sortirovki = {
        "ohvat": "k.ohvat desc nulls last",
        "podpischiki": "k.podpischiki desc nulls last",
        "deshevle": "k.stavka asc nulls last",
        "novye": "k.opublikovana_v desc nulls last",
    }
    sortirovka = sortirovki.get(poryadok, sortirovki["ohvat"])

    na_stranice = max(1, min(na_stranice, 60))
    smeshchenie = max(0, (max(1, stranica) - 1) * na_stranice)

    async with baza.pul().acquire() as conn:
        vsego = await conn.fetchval(
            "select count(*) from kartochki k"
            " left join goroda g on g.id = k.gorod_id"
            " left join rayony r on r.id = k.rayon_id"
            " join lyudi l on l.id = k.chelovek_id where " + gde,
            *znacheniya,
        )
        stroki = await conn.fetch(
            f"{osnova} order by {sortirovka}, k.id desc limit {na_stranice} offset {smeshchenie}",
            *znacheniya,
        )
        karty = [await _karta_slovarem(conn, s) for s in stroki]

        # Точки для карты считаем по тем же условиям, но без страниц:
        # человек должен видеть, где живёт вся его выборка, а не её кусок.
        tochki = await conn.fetch(
            "select g.nazvanie as gorod, g.shirota, g.dolgota, count(*) as skolko"
            " from kartochki k"
            " left join goroda g on g.id = k.gorod_id"
            " left join rayony r on r.id = k.rayon_id"
            " join lyudi l on l.id = k.chelovek_id"
            " where " + gde + " and g.shirota is not null"
            " group by g.nazvanie, g.shirota, g.dolgota order by 4 desc",
            *znacheniya,
        )

    return {
        "vsego": vsego,
        "stranica": max(1, stranica),
        "stranic": max(1, -(-vsego // na_stranice)),
        "karty": karty,
        "tochki": [
            {
                "gorod": t["gorod"],
                "shirota": float(t["shirota"]),
                "dolgota": float(t["dolgota"]),
                "skolko": t["skolko"],
            }
            for t in tochki
        ],
    }


@app.get("/api/katalog/{kartochka_id}")
async def odna_kartochka(kartochka_id: int):
    """Страница одного блогера. Телефон наружу не отдаём никогда."""
    async with baza.pul().acquire() as conn:
        kartochka = await conn.fetchrow(
            KARTOCHKA_SELECT
            + " join lyudi l on l.id = k.chelovek_id"
            + " where k.id = $1 and k.status = 'published' and l.udalen_v is null",
            kartochka_id,
        )
        if kartochka is None:
            return JSONResponse({"ok": False, "reason": "not-found"}, status_code=404)
        await conn.execute(
            "update kartochki set prosmotry = prosmotry + 1 where id = $1", kartochka_id
        )
        karta = await _karta_slovarem(conn, kartochka)
    return {"ok": True, "karta": karta, "prosmotry": (kartochka["prosmotry"] or 0) + 1}


# ============================================================ отдача страниц


@app.get("/{put:path}")
async def stranicy(put: str):
    """Одна служба: всё, что не /api, отдаём как собранный сайт."""
    if put.startswith("api/"):
        return JSONResponse({"ok": False, "reason": "not-found"}, status_code=404)

    fayl = nastroyki.STATIKA / put
    if put and fayl.is_file():
        return FileResponse(fayl)

    index = nastroyki.STATIKA / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse({"ok": False, "reason": "no-static"}, status_code=404)
