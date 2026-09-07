"""Реестр блогеров — сервер.

Одна служба: он же отдаёт собранные страницы, он же отвечает на /api.
Решение 01.09.2026 — так проще деплой и не надо возиться с разрешениями
между доменами.
"""

import io
import json
import logging
import secrets
import time
from datetime import timedelta
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import asyncpg
from fastapi import FastAPI, File, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from . import baza, chtenie, nastroyki, sms, vhod

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
# httpx пишет в лог полный адрес запроса, а в нём токен бота. Приглушаем.
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("reestr")

async def _postavit_adminov() -> None:
    """Владелец и клиент(ы) Ассоциации — с полными правами админки.

    Оба берутся из настроек: VLADELETS_TELEFON и ADMIN_TELEFONY. В коде
    номеров нет — репозиторий открытый, а это личные данные. Повторный
    вызов ничего не ломает: это upsert по телефону.
    """
    vladelec = vhod.normalizovat_telefon(nastroyki.VLADELETS_TELEFON)
    if vladelec:
        await baza.ustanovit_admina(vladelec, nastroyki.VLADELETS_IMYA)
    else:
        log.warning("VLADELETS_TELEFON не задан — владелец админом не заведён")
    for syroy in nastroyki.ADMIN_TELEFONY.split(","):
        nomer = vhod.normalizovat_telefon(syroy)
        if nomer:
            await baza.ustanovit_admina(nomer, "Админ Ассоциации")


@asynccontextmanager
async def zhizn(_: FastAPI):
    await baza.otkryt()
    await _postavit_adminov()
    if nastroyki.SOL == nastroyki.SOL_PO_UMOLCHANIYU:
        # Соль подписывает коды и сессии. На бою она обязана быть своя и
        # тайная — иначе подпись знает любой, кто видел этот файл.
        log.warning("OTP_SECRET не задан — стоит запасная соль. Для боя задайте свою.")
    if nastroyki.MASTER_KOD and nastroyki.MASTER_KOD_TELEFONY.strip() == "*":
        # Так можно только на своей машине: код подойдёт к любому кабинету.
        log.warning("постоянный код включён ДЛЯ ВСЕХ номеров — это только для стенда")
    elif nastroyki.MASTER_KOD and nastroyki.MASTER_KOD_TELEFONY.strip():
        skolko = len([n for n in nastroyki.MASTER_KOD_TELEFONY.split(",") if n.strip()])
        log.info("постоянный код входа действует для %d номер(ов)", skolko)
    kanal_kodov = vhod.kanal()
    if kanal_kodov == "zvonok":
        log.info("коды диктует робот звонком через AutoCall — доходит до всех операторов")
    elif kanal_kodov == "sms":
        log.info(
            "коды идут настоящей SMS через Mobizon, подпись %s",
            nastroyki.MOBIZON_PODPIS or "общая (без Beeline)",
        )
    else:
        # Пока так — сайт нельзя отдавать блогерам: чужой код придёт не тому.
        log.warning("коды идут в один телеграм-чат владельца — это затычка, не бой")
    if chtenie.vklyucheno():
        log.info("чтение скрина включено, модель %s", nastroyki.MODEL_CHTENIYA)
    else:
        log.info("чтение скрина выключено — нет ANTHROPIC_API_KEY, цифры вводит человек")
    log.info("база готова, владелец на месте")
    yield
    await baza.zakryt()


app = FastAPI(title="Реестр блогеров", lifespan=zhizn, docs_url=None, redoc_url=None)


@app.middleware("http")
async def _baza_gotova(request: Request, dalshe):
    """Убедиться, что база открыта, до того как отвечать.

    На своей машине это делает подъём сервера. На бою (Vercel) сервер живёт
    короткими вспышками, и события подъёма может не быть вовсе — тогда без
    этой проверки первый же запрос падал бы с «база ещё не открыта».
    Повторный вызов ничего не стоит: открытая база отдаётся как есть.
    """
    global _vladelec_na_meste
    await baza.otkryt()
    if not _vladelec_na_meste:
        await _postavit_adminov()
        _vladelec_na_meste = True
    return await dalshe(request)


_vladelec_na_meste = False


# ===================================================================== общее


async def _tekushchiy(request: Request) -> asyncpg.Record | None:
    return await vhod.kto_zashel(request)


def _net_prav() -> JSONResponse:
    return JSONResponse({"ok": False, "reason": "no-access"}, status_code=403)


def _nomer(znachenie: Any) -> int | None:
    """Число из тела запроса. Мусор — None, а не падение с 500."""
    try:
        return int(str(znachenie).strip())
    except (TypeError, ValueError):
        return None


# Сколько раз с адреса стучались во вход. Память процесса: перезапуск
# обнуляет, и это терпимо — счётчик от перебора, а не от взлома.
_stuk: dict[str, list[float]] = {}


def _adres(request: Request) -> str:
    """Настоящий адрес того, кто стучится.

    Баг, найденный 07.09.2026: брали `request.client.host`, а на бою сервер
    стоит за проксей Vercel — там у всех посетителей он один и тот же. То
    есть десять попыток входа в минуту делились на весь сайт: одиннадцатый
    человек получал «слишком часто», ничего не сделав. Настоящий адрес
    прокси кладёт в `x-forwarded-for`, первым в списке.
    """
    cepochka = request.headers.get("x-forwarded-for", "")
    pervyy = cepochka.split(",")[0].strip()
    if pervyy:
        return pervyy
    return request.client.host if request.client else "?"


def _slishkom_chasto(request: Request) -> bool:
    adres = _adres(request)
    teper = time.monotonic()
    bylo = [t for t in _stuk.get(adres, []) if teper - t < 60]
    bylo.append(teper)
    _stuk[adres] = bylo
    if len(_stuk) > 5000:  # чтобы словарь не рос без края
        for kto in [k for k, v in _stuk.items() if not v or teper - v[-1] > 300]:
            _stuk.pop(kto, None)
    return len(bylo) > nastroyki.POPYTOK_S_ADRESA_V_MINUTU


async def _karty_slovarem(
    conn: asyncpg.Connection, kartochki: list[asyncpg.Record]
) -> list[dict[str, Any]]:
    """Пачка карточек для экранов.

    Скорость, 02.09.2026: раньше на каждую карточку уходило три отдельных
    запроса — страница каталога в 24 карточки стоила больше семидесяти, а
    очередь модератора на 306 карточек почти тысячу. Отсюда и «лагает».
    Теперь три запроса на всю пачку, сколько бы карточек в ней ни было.
    """
    if not kartochki:
        return []
    nomera = [k["id"] for k in kartochki]

    tematiki: dict[int, list[str]] = {}
    for r in await conn.fetch(
        """
        select kt.kartochka_id, t.nazvanie from kartochka_tematiki kt
        join tematiki t on t.id = kt.tematika_id
        where kt.kartochka_id = any($1::bigint[]) order by t.poryadok
        """,
        nomera,
    ):
        tematiki.setdefault(r["kartochka_id"], []).append(r["nazvanie"])

    ssylki: dict[int, list[str]] = {}
    for r in await conn.fetch(
        "select kartochka_id, adres from ssylki"
        " where kartochka_id = any($1::bigint[]) order by id",
        nomera,
    ):
        ssylki.setdefault(r["kartochka_id"], []).append(r["adres"])

    skriny = {
        r["kartochka_id"]: r
        for r in await conn.fetch(
            "select distinct on (kartochka_id) kartochka_id, kartinka_id, otchet_ii"
            " from skriny where kartochka_id = any($1::bigint[])"
            " order by kartochka_id, zagruzhen_v desc",
            nomera,
        )
    }

    return [
        _sobrat_kartu(
            k, tematiki.get(k["id"], []), ssylki.get(k["id"], []), skriny.get(k["id"])
        )
        for k in kartochki
    ]


async def _karta_slovarem(conn: asyncpg.Connection, kartochka: asyncpg.Record) -> dict[str, Any]:
    """Одна карточка. Та же сборка, что и для пачки."""
    return (await _karty_slovarem(conn, [kartochka]))[0]


def _proverka_slovarem(
    otchet: dict[str, Any] | None, podpischiki: Any, ohvat: Any
) -> dict[str, Any] | None:
    """Отчёт чтения в том виде, в каком его ждёт экран модератора.

    `sovpalo` не хранится, а считается здесь: человек правит цифры и после
    чтения, и записанное однажды «сошлось» на другой день врало бы.
    """
    if not otchet:
        return None
    zamechaniya = list(otchet.get("zamechaniya") or [])
    if otchet.get("period"):
        zamechaniya = [f"Охват на скрине за {otchet['period']}"] + zamechaniya
    soshlos = chtenie.sovpalo(otchet, podpischiki, ohvat)
    if not soshlos and not (podpischiki or ohvat):
        # Не «разошлись», а сверять было не с чем: в карточке цифр ещё нет.
        zamechaniya = ["В карточке цифр ещё нет — сверить не с чем"] + zamechaniya
    return {
        "followers": str(otchet["podpischiki"]) if otchet.get("podpischiki") else None,
        "reach": str(otchet["ohvat"]) if otchet.get("ohvat") else None,
        "pokazy": str(otchet["pokazy"]) if otchet.get("pokazy") else None,
        "tochnost": otchet.get("tochnost") or 0.0,
        "sovpalo": soshlos,
        "zamechaniya": zamechaniya,
    }


def _otchet_skrina(skrin: asyncpg.Record | None) -> dict[str, Any] | None:
    """Достаём отчёт из базы. asyncpg отдаёт jsonb строкой — разбираем."""
    if skrin is None or not skrin["otchet_ii"]:
        return None
    syroy = skrin["otchet_ii"]
    if isinstance(syroy, str):
        try:
            syroy = json.loads(syroy)
        except json.JSONDecodeError:
            return None
    return syroy if isinstance(syroy, dict) else None


async def _spornyy_skrin(
    conn: asyncpg.Connection, kid: int, podpischiki: Any, ohvat: Any
) -> str | None:
    """Есть ли причина показать карточку модератору, даже если модерация выключена.

    Спека, день 4: «нечитаемый или сомнительный скрин уходит администратору
    на ручную сверку». Раньше этого не было: при выключенной модерации
    карточка ехала в каталог, что бы модель ни сказала.

    Возвращает причину словами или None. Скрина нет — не наше дело, цифры
    со слов и помечены как со слов. Чтение выключено вовсе — тоже: судить
    о «нечитаемом» тогда некому, и старый порядок не ломаем.
    """
    if not chtenie.vklyucheno():
        return None
    skrin = await conn.fetchrow(
        "select otchet_ii from skriny where kartochka_id = $1"
        " order by zagruzhen_v desc limit 1",
        kid,
    )
    if skrin is None:
        return None
    otchet = _otchet_skrina(skrin)
    if otchet is None:
        return "скрин не прочитался"
    if otchet.get("podpischiki") is None and otchet.get("ohvat") is None:
        return "с картинки не прочитались цифры"
    if (otchet.get("tochnost") or 0) < nastroyki.POROG_TOCHNOSTI:
        return "скрин прочитался неуверенно"
    if not chtenie.sovpalo(otchet, podpischiki, ohvat):
        return "цифры в карточке расходятся со скрином"
    return None


def _sobrat_kartu(
    kartochka: asyncpg.Record,
    tematiki: list[str],
    ssylki: list[str],
    skrin: asyncpg.Record | None,
) -> dict[str, Any]:
    """Карточка в том виде, в каком её ждут экраны."""
    return {
        "id": str(kartochka["id"]),
        "nick": kartochka["nik"] or "",
        # Имя и рассказ о себе — 07.09.2026. Пусто у всех, кто заполнял
        # карточку раньше: задним числом не выдумываем.
        "fio": kartochka["fio"] or "",
        "bio": kartochka["bio"] or "",
        "photo": f"/api/kartinki/{kartochka['foto_id']}" if kartochka["foto_id"] else None,
        "ssylki": ssylki,
        "screenshot": f"/api/kartinki/{skrin['kartinka_id']}" if skrin else None,
        "followers": str(kartochka["podpischiki"] or ""),
        "reach": str(kartochka["ohvat"] or ""),
        "istochnik": kartochka["istochnik"],
        # Спека, день 4: пометка источника **и дата**. По ней рекламодатель
        # понимает, вчерашние это цифры или трёхмесячные.
        "cifryOt": (
            kartochka["cifry_ot"].date().isoformat() if kartochka["cifry_ot"] else None
        ),
        "proverka": _proverka_slovarem(
            _otchet_skrina(skrin), kartochka["podpischiki"], kartochka["ohvat"]
        ),
        "tematiki": tematiki,
        "gorod": kartochka["gorod"] or "",
        "yazyk": kartochka["yazyk"] or "",
        "stavka": str(kartochka["stavka"] or ""),
        "dogovornaya": kartochka["dogovornaya"],
    }


KARTOCHKA_SELECT = """
    select k.*, g.nazvanie as gorod
    from kartochki k
    left join goroda g on g.id = k.gorod_id
"""


# ================================================================ справочники


@app.get("/api/spravochniki")
async def spravochniki():
    """Списки для отбора: тематики, города с районами, языки.

    Городов теперь семьдесят, и плоским списком их выбирать неудобно —
    поэтому рядом едет разбивка по областям. Сам список городов остаётся
    прежним: экраны, которым область не нужна, не переделываются.
    """
    async with baza.pul().acquire() as conn:
        temy = [r["nazvanie"] for r in await conn.fetch(
            "select nazvanie from tematiki where vidna order by poryadok, nazvanie")]
        goroda: dict[str, list[str]] = {}
        oblasti: dict[str, list[str]] = {}
        # Районы убраны 07.09.2026 словом владельца («убери район где
        # адрес»). Список городов остался плоским, а `goroda` — словарём с
        # пустыми списками: так экраны, читающие ключи, не переделываются.
        for r in await conn.fetch(
            """
            select g.nazvanie as gorod, g.oblast
            from goroda g
            where g.vidno
            -- три главных города вперёд, дальше области по алфавиту
            order by (g.oblast is distinct from 'город республиканского значения'),
                     g.oblast nulls last, g.nazvanie
            """
        ):
            goroda[r["gorod"]] = []
            oblasti.setdefault(r["oblast"] or "Прочее", []).append(r["gorod"])
    return {
        "tematiki": temy,
        "goroda": goroda,
        "oblasti": [{"oblast": o, "goroda": g} for o, g in oblasti.items()],
        "yazyki": ["Казахский", "Русский", "Оба"],
    }


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
    if _slishkom_chasto(request):
        return {"ok": False, "reason": "too-often", "retryAfter": 60}
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
            # `udalen_v` — человек попросил себя удалить. Такому вход
            # закрыт: иначе кнопка «удалить себя», когда она появится,
            # окажется наполовину пустой обещанием.
            chelovek_id = await conn.fetchval(
                "select id from lyudi where telefon = $1 and udalen_v is null", telefon
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
        # Раньше отвечали «bad-phone», и человек читал «неверный номер» —
        # хотя номер верный, а не ушла SMS. С настоящим оператором это
        # встречается по-настоящему (например абонент Beeline, пока у нас
        # общая подпись), и врать про его номер нельзя: он будет чинить не
        # то. Отвечаем как есть, экран зовёт за резервным кодом.
        return {"ok": False, "reason": "no-delivery"}

    return {
        "ok": True,
        "resendAfter": nastroyki.POVTOR_CHEREZ_SEK,
        "phoneMasked": vhod.maska(telefon),
        # Экран кода должен сказать правду: ждать SMS, звонка или чата.
        "kanal": vhod.kanal(),
    }


@app.post("/api/auth/check")
async def vhod_check(request: Request):
    if _slishkom_chasto(request):
        return {"ok": False, "reason": "too-often", "retryAfter": 60}
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
                await conn.fetchval(
                    "select id from lyudi where telefon = $1 and udalen_v is null", telefon
                )
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
        # Согласие на обработку телефона. Галочка на входе стояла с самого
        # начала, но никуда не писалась — а предъявить его надо уметь.
        await conn.execute(
            "insert into soglasiya (chelovek_id, versiya) values ($1, $2)",
            chelovek_id,
            nastroyki.VERSIYA_SOGLASIYA,
        )
        # Куда вести после входа. Человек, который уже заполнил карточку,
        # не должен каждый раз попадать на «создайте карточку» — ему в
        # каталог. Слово владельца 02.09.2026.
        # Заготовка из таблицы заказчика — это ещё не заполненная карточка:
        # там один ник. Признак «человек её подал» — статус, а не ник.
        zapolnena = await conn.fetchval(
            "select status <> 'draft' from kartochki where chelovek_id = $1",
            chelovek_id,
        )
        rol = await conn.fetchval("select rol from lyudi where id = $1", chelovek_id)
        znachenie = await vhod.otkryt_sessiyu(conn, chelovek_id)

    kuda = "katalog" if (zapolnena or rol == "admin") else "card"
    otvet = JSONResponse({"ok": True, "next": kuda})
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
    """Кто вошёл — и заодно место, где вход продлевается.

    Этот адрес спрашивает шапка на каждой странице, поэтому продление
    живёт здесь: пока человек ходит по сайту, срок его входа отодвигается
    сам, и код у него больше не спросят. Слово владельца 07.09.2026 —
    «сделай хэширование, чтобы запоминал вход в аккаунт».
    """
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return JSONResponse({"vnutri": False})
    async with baza.pul().acquire() as conn:
        status = await conn.fetchval(
            "select status from kartochki where chelovek_id = $1", chelovek["id"]
        )
    otvet = JSONResponse(
        {
            "vnutri": True,
            "rol": chelovek["rol"],
            "imya": chelovek["imya"],
            "telefon": vhod.maska(chelovek["telefon"]),
            # Шапке нужно знать, звать «моя карточка» или «заполнить карточку».
            "kartochkaZapolnena": status is not None and status != "draft",
        }
    )
    await vhod.prodlit_esli_nado(request, otvet, chelovek)
    return otvet


# =================================================================== картинки


def _uzhat(bayty: bytes) -> tuple[bytes, str] | None:
    """Скрин с телефона — это мегабайты. В базу кладём ужатое.

    Возвращает None, если это вообще не картинка или картинка-ловушка
    (маленький файл, разворачивающийся в гигабайты). Раньше такой файл
    ронял запрос с ошибкой 500.
    """
    try:
        kartinka = Image.open(io.BytesIO(bayty))
        kartinka.verify()  # битый файл ловим до распаковки
        kartinka = Image.open(io.BytesIO(bayty))
    except Exception:
        return None
    shirina, vysota = kartinka.size
    if shirina * vysota > nastroyki.KARTINKA_MAX_TOCHEK:
        return None
    if kartinka.mode not in ("RGB", "L"):
        kartinka = kartinka.convert("RGB")
    kartinka.thumbnail(
        (nastroyki.KARTINKA_MAX_STORONA, nastroyki.KARTINKA_MAX_STORONA * 3),
        Image.LANCZOS,
    )
    vyhod = io.BytesIO()
    kartinka.save(vyhod, format="JPEG", quality=nastroyki.KARTINKA_KACHESTVO, optimize=True)
    return vyhod.getvalue(), "image/jpeg"


async def _zapisat_kartinku(
    conn: asyncpg.Connection, szhato: bytes, tip: str, vid: str
) -> int:
    return await conn.fetchval(
        "insert into kartinki (vid, tip, bayty, razmer) values ($1,$2,$3,$4) returning id",
        vid,
        tip,
        szhato,
        len(szhato),
    )


async def _polozhit_kartinku(conn: asyncpg.Connection, bayty: bytes, vid: str) -> int | None:
    uzhato = _uzhat(bayty)
    if uzhato is None:
        return None
    szhato, tip = uzhato
    return await _zapisat_kartinku(conn, szhato, tip, vid)


@app.get("/api/kartinki/{kartinka_id}")
async def otdat_kartinku(request: Request, kartinka_id: int):
    """Картинка по номеру.

    Дыра, закрытая 02.09.2026: раньше отдавали любую картинку любому — а
    номера идут подряд, и перебором доставались чужие скрины статистики.
    Теперь наружу видно только фото карточки, стоящей в каталоге. Скрин
    статистики — личное: его видят сам блогер и модератор, больше никто.
    """
    async with baza.pul().acquire() as conn:
        zapis = await conn.fetchrow(
            "select tip, bayty, vid from kartinki where id = $1", kartinka_id
        )
        if zapis is None:
            return JSONResponse({"ok": False}, status_code=404)

        publichnaya = zapis["vid"] == "foto" and bool(
            await conn.fetchval(
                "select 1 from kartochki k join lyudi l on l.id = k.chelovek_id"
                " where k.foto_id = $1 and k.status = 'published' and l.udalen_v is null",
                kartinka_id,
            )
        )
        if not publichnaya:
            chelovek = await _tekushchiy(request)
            if chelovek is None:
                return _net_prav()
            if chelovek["rol"] != "admin":
                svoya = await conn.fetchval(
                    "select 1 from kartochki k"
                    " left join skriny s on s.kartochka_id = k.id"
                    " where k.chelovek_id = $1 and ($2 in (k.foto_id, s.kartinka_id))",
                    chelovek["id"],
                    kartinka_id,
                )
                if not svoya:
                    return _net_prav()
    # Личную картинку нельзя класть в общий кэш: её подхватит чужой браузер
    # или посредник. Публичное фото кэшируем надолго — оно не меняется.
    kesh = (
        "public, max-age=31536000, immutable"
        if publichnaya
        else "private, no-store"
    )
    return Response(
        content=zapis["bayty"],
        media_type=zapis["tip"],
        headers={"Cache-Control": kesh},
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
        if kartinka_id is None:
            return {"ok": False, "reason": "not-image"}
        await conn.execute("update kartochki set foto_id = $1 where id = $2", kartinka_id, kid)
    return {"ok": True, "url": f"/api/kartinki/{kartinka_id}"}


@app.post("/api/card/screenshot")
async def zagruzit_skrin(request: Request, file: UploadFile = File(...)):
    """Кладём скрин и пробуем прочитать с него цифры моделью.

    Порядок важен. Сначала читаем — это секунды ожидания, — и только потом
    берём соединение с базой: их всего горсть, держать одно всё время
    запроса к модели нельзя.

    Ответ `ok: false` значит «скрин сохранён, цифры впишите сами». Так
    отвечаем всегда, когда чтение выключено или не вышло: загрузку скрина
    неудачное чтение не ломает никогда.
    """
    chelovek = await _tekushchiy(request)
    if chelovek is None:
        return _net_prav()
    bayty = await file.read()
    if len(bayty) > nastroyki.KARTINKA_MAX_BAYT:
        return {"ok": False}
    uzhato = _uzhat(bayty)
    if uzhato is None:
        return {"ok": False, "reason": "not-image"}
    szhato, tip = uzhato

    otchet = await chtenie.prochitat(szhato, tip)

    async with baza.pul().acquire() as conn:
        kartochka = await conn.fetchrow(
            "select id, podpischiki, ohvat from kartochki where chelovek_id = $1",
            chelovek["id"],
        )
        if kartochka is None:
            # Карточки нет — например, зашли админским логином без телефона.
            # Класть скрин некуда, но и падать незачем.
            return {"ok": False, "reason": "no-card"}
        kartinka_id = await _zapisat_kartinku(conn, szhato, tip, "skrin")
        await conn.execute(
            "insert into skriny (kartochka_id, kartinka_id, otchet_ii) values ($1, $2, $3)",
            kartochka["id"],
            kartinka_id,
            json.dumps(otchet, ensure_ascii=False) if otchet else None,
        )

    adres = f"/api/kartinki/{kartinka_id}"
    if otchet is None or (otchet["podpischiki"] is None and otchet["ohvat"] is None):
        # Прочитать не вышло — не беда: человек впишет руками, карточка
        # честно останется «со слов».
        return {"ok": False, "url": adres}

    return {
        "ok": True,
        "url": adres,
        "followers": str(otchet["podpischiki"] or ""),
        "reach": str(otchet["ohvat"] or ""),
        "proverka": _proverka_slovarem(
            otchet, kartochka["podpischiki"], kartochka["ohvat"]
        ),
    }


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

            # --- то, что правится сразу
            await conn.execute(
                """
                update kartochki set
                  nik = $2, gorod_id = $3, rayon_id = null, yazyk = $4,
                  stavka = $5, dogovornaya = $6, fio = $7, bio = $8,
                  obnovlena_v = now()
                where id = $1
                """,
                kid,
                (telo.get("nick") or "").strip(),
                gorod_id,
                telo.get("yazyk") or None,
                _chislo(telo.get("stavka")),
                bool(telo.get("dogovornaya")),
                (telo.get("fio") or "").strip()[:120] or None,
                (telo.get("bio") or "").strip()[:400] or None,
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
                sporno = (
                    await _spornyy_skrin(conn, kid, podpischiki, ohvat)
                    if stalo_inache
                    else None
                )
                if stalo_inache and not nastroyki.MODERATSIYA and sporno is None:
                    # без проверки новые цифры встают сразу
                    await conn.execute(
                        "update kartochki set podpischiki=$2, ohvat=$3, istochnik=$4,"
                        " cifry_ot=now() where id=$1",
                        kid,
                        podpischiki,
                        ohvat,
                        istochnik,
                    )
                    return {"ok": True, "status": "published", "cifryNaProverke": False}

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

            # Модерация выключена — карточка идёт в каталог сразу (спека).
            # Но спорный скрин уходит модератору всегда: это тоже спека,
            # день 4, «нечитаемый или сомнительный скрин — на ручную сверку».
            sporno = await _spornyy_skrin(conn, kid, podpischiki, ohvat)
            novyy = "moderation" if (nastroyki.MODERATSIYA or sporno) else "published"
            if sporno:
                log.info("карточка %s на проверку: %s", kid, sporno)
            await conn.execute(
                """
                update kartochki set
                  podpischiki = $2, ohvat = $3, istochnik = $4, cifry_ot = now(),
                  status = $5, podana_v = now(), prichina_otkaza = null,
                  opublikovana_v = case when $5 = 'published' then now()
                                        else opublikovana_v end
                where id = $1
                """,
                kid,
                podpischiki,
                ohvat,
                istochnik,
                novyy,
            )

    return {"ok": True, "status": novyy, "cifryNaProverke": False}


# ================================================================== модератор


async def _admin(request: Request) -> asyncpg.Record | None:
    """Единственная дверь в админку.

    Ролей в реестре две: блогер и админ. Модератора убрали 07.09.2026
    словом владельца — «убери модератора, пускай чисто будет админ, с
    функционалом и модера который планировали, и админ с его фишками».
    Отдельная узкая роль сначала появилась, а через день оказалась лишней:
    людей в Ассоциации мало, и делить их на два сорта не за чем.
    """
    chelovek = await _tekushchiy(request)
    if chelovek is None or chelovek["rol"] != "admin":
        return None
    return chelovek


@app.get("/api/moder/zayavki")
async def zayavki(
    request: Request,
    status: str | None = None,
    poisk: str | None = None,
    stranica: int = 1,
    na_stranice: int = 50,
):
    """Очередь модератора — страницами и с отбором по вкладке.

    Скорость, 02.09.2026: раньше экран тянул все 306 карточек разом и на
    каждую ходил в базу отдельно — почти тысяча запросов на один заход.
    Теперь страница нужной вкладки и одна пачка запросов на неё.
    """
    if await _admin(request) is None:
        return _net_prav()

    na_stranice = max(1, min(na_stranice, 200))
    smeshchenie = max(0, (max(1, stranica) - 1) * na_stranice)

    usloviya, znacheniya = ["true"], []
    if status in ("draft", "moderation", "published", "rejected"):
        znacheniya.append(status)
        usloviya.append(f"k.status = ${len(znacheniya)}")
    if poisk:
        znacheniya.append("%" + poisk.strip() + "%")
        usloviya.append(f"k.nik ilike ${len(znacheniya)}")
    gde = " and ".join(usloviya)

    async with baza.pul().acquire() as conn:
        scheta = {
            r["status"]: r["skolko"]
            for r in await conn.fetch(
                "select status, count(*) as skolko from kartochki group by status"
            )
        }
        vsego = await conn.fetchval(
            f"select count(*) from kartochki k where {gde}", *znacheniya
        )
        stroki = await conn.fetch(
            KARTOCHKA_SELECT
            + f" where {gde}"
            + " order by k.podana_v desc nulls last, k.id desc"
            + f" limit {na_stranice} offset {smeshchenie}",
            *znacheniya,
        )
        karty = await _karty_slovarem(conn, stroki)
        pravki = {
            r["kartochka_id"]: r
            for r in await conn.fetch(
                "select kartochka_id, podpischiki, ohvat, istochnik from pravki_cifr"
                " where status = 'moderation' and kartochka_id = any($1::bigint[])",
                [k["id"] for k in stroki],
            )
        }

    itog = []
    for kartochka, karta in zip(stroki, karty):
        pravka = pravki.get(kartochka["id"])
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
    return {
        "vsego": vsego,
        "stranica": max(1, stranica),
        "stranic": max(1, -(-vsego // na_stranice)),
        "scheta": scheta,
        "zayavki": itog,
    }


def _kogda(kogda) -> str:
    return kogda.strftime("%d.%m.%Y %H:%M") if kogda else ""


@app.post("/api/moder/approve")
async def odobrit(request: Request):
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    kid = _nomer((await request.json()).get("id"))
    if kid is None:
        return {"ok": False, "reason": "bad-id"}

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
                    update kartochki set podpischiki = $2, ohvat = $3, istochnik = $4,
                                         cifry_ot = now()
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
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    kid, prichina = _nomer(telo.get("id")), (telo.get("prichina") or "").strip()
    if kid is None:
        return {"ok": False, "reason": "bad-id"}

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


@app.get("/api/moder/prichiny")
async def prichiny_otkaza(request: Request):
    """Готовые причины отказа — чтобы модератор не набирал одно и то же.

    Лежат таблицей с 02.09.2026, но к экрану до 06.09 подключены не были:
    модератор писал причину руками, и блогеры получали шесть разных
    формулировок одного и того же. Своя причина текстом остаётся — список
    только подставляет текст в поле.
    """
    if await _admin(request) is None:
        return _net_prav()
    async with baza.pul().acquire() as conn:
        stroki = await conn.fetch(
            "select id, tekst from prichiny_otkaza where vidna order by poryadok, tekst"
        )
    return {"prichiny": [dict(r) for r in stroki]}


@app.post("/api/moder/remove")
async def udalit(request: Request):
    """Снести человека вместе с карточкой. Необратимо — потому только админу.

    Модератору хватает «скрыть»: карточка уходит из каталога, данные целы.
    """
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    kid = _nomer((await request.json()).get("id"))
    if kid is None:
        return {"ok": False, "reason": "bad-id"}
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
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    kid = _nomer(telo.get("id"))
    if kid is None:
        return {"ok": False, "reason": "bad-id"}

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            gorod_id = await conn.fetchval(
                "select id from goroda where nazvanie = $1", telo.get("gorod") or ""
            )
            # Пометка достоверности — спека, день 5: модератор сверил цифры
            # со скрином и ставит «со скрина» либо возвращает на «со слов».
            istochnik = telo.get("istochnik")
            if istochnik not in ("screen", "words"):
                istochnik = None

            await conn.execute(
                """
                update kartochki set nik=$2, podpischiki=$3, ohvat=$4, gorod_id=$5,
                  rayon_id=null, yazyk=$6, stavka=$7, dogovornaya=$8,
                  istochnik=coalesce($9, istochnik), obnovlena_v=now(),
                  fio=$10, bio=$11,
                  -- дату двигаем, только если цифры и правда поменялись:
                  -- правка города не делает подписчиков свежее
                  cifry_ot = case
                    when podpischiki is distinct from $3 or ohvat is distinct from $4
                    then now() else cifry_ot end
                where id=$1
                """,
                kid,
                (telo.get("nick") or "").strip(),
                _chislo(telo.get("followers")),
                _chislo(telo.get("reach")),
                gorod_id,
                telo.get("yazyk") or None,
                _chislo(telo.get("stavka")),
                bool(telo.get("dogovornaya")),
                istochnik,
                (telo.get("fio") or "").strip()[:120] or None,
                (telo.get("bio") or "").strip()[:400] or None,
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
    kto = await _admin(request)
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
    if await _admin(request) is None:
        return _net_prav()

    usloviya = ["l.udalen_v is null"]
    znach: list[Any] = []
    if poisk:
        znach.append("%" + poisk.strip() + "%")
        usloviya.append("(k.nik ilike $1 or l.telefon ilike $1)")

    async with baza.pul().acquire() as conn:
        stroki = await conn.fetch(
            "select l.id as chelovek_id, l.telefon, l.poslednii_vhod, k.nik, k.status,"
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
        # Признак «дошёл» — вход человека, а не состояние карточки: заготовки
        # из таблицы заказчика тоже стоят в каталоге, но их владельцы сюда
        # ещё ни разу не заходили. Поправлено 02.09.2026.
        if r["poslednii_vhod"] is not None:
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
            # Подсказка админу: этому человеку SMS не дойдёт, ему сразу
            # резервный код. Слово владельца 06.09.2026 — «пока без билайна».
            "beeline": sms.pohozhe_beeline(r["telefon"]),
            "ssylka": ("/i/" + r["token"]) if r["token"] else None,
            "sostoyanie": sostoyanie(r),
            "godnoDo": r["godno_do"].strftime("%d.%m.%Y") if r["godno_do"] else None,
        }
        for r in stroki
    ]


@app.post("/api/moder/priglashenie")
async def vypustit_priglashenie(request: Request):
    """Выпустить новую ссылку. Старые живые гасим — иначе их станет две."""
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    chelovek_id = _nomer((await request.json()).get("chelovekId"))
    if chelovek_id is None:
        return {"ok": False, "reason": "bad-id"}

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


@app.post("/api/moder/novaya-ssylka")
async def novaya_ssylka(request: Request):
    """Пригласительная ссылка новому блогеру — **по номеру телефона**.

    Слово владельца 07.09.2026: «приглашение ссылку генерировать по номеру
    телефона, не по нику». Раньше заводилась болванка без номера, и человек
    вписывал его сам, открыв ссылку: ник у болванки был, а привязки к
    человеку — никакой, и одну ссылку мог открыть кто угодно. Теперь номер
    известен заранее: код уйдёт SMS ровно на него, а ник необязателен —
    блогер напишет его в карточке сам.
    """
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    telefon = vhod.normalizovat_telefon(telo.get("telefon") or "")
    nik = (telo.get("nick") or "").strip()
    if telefon is None:
        return {"ok": False, "reason": "bad-phone"}

    async with baza.pul().acquire() as conn:
        async with conn.transaction():
            # Номер — это личность: если он уже чей-то, вторую запись под
            # него заводить нельзя. Ссылка такому человеку выдаётся из
            # списка приглашений, кнопкой «новая ссылка» в его строке.
            est = await conn.fetchrow(
                "select l.id, k.nik from lyudi l"
                " left join kartochki k on k.chelovek_id = l.id"
                " where l.telefon = $1",
                telefon,
            )
            if est is not None:
                return {
                    "ok": False,
                    "reason": "phone-taken",
                    "nik": est["nik"] or "",
                }
            chelovek_id = await conn.fetchval(
                "insert into lyudi (telefon, rol, imya) values ($1, 'blogger', null)"
                " returning id",
                telefon,
            )
            await conn.execute(
                "insert into kartochki (chelovek_id, nik) values ($1, $2)", chelovek_id, nik
            )
            token = await vhod.novoe_priglashenie(conn, chelovek_id, kto["id"])
            await conn.execute(
                "insert into zhurnal_moderatsii (kto_id, chto, prichina)"
                " values ($1,'zavel','ссылка для нового блогера')",
                kto["id"],
            )
    return {
        "ok": True,
        "ssylka": "/i/" + token,
        "telefonMaska": vhod.maska(telefon),
        "chelovekId": chelovek_id,
    }


@app.post("/api/moder/kod")
async def vydat_rezervnyy_kod(request: Request):
    """Резервный код — спека, день 5.

    Код НЕ уходит в Telegram: администратор читает его с экрана и передаёт
    человеку голосом. Нужен, когда доставка не сработала. Живой код у
    человека при этом гаснет, чтобы их не стало два.
    """
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    chelovek_id = _nomer((await request.json()).get("chelovekId"))
    if chelovek_id is None:
        return {"ok": False, "reason": "bad-id"}

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
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    kid = _nomer(telo.get("id"))
    if kid is None:
        return {"ok": False, "reason": "bad-id"}
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
    if await _admin(request) is None:
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
              -- «заполнил» — это когда человек сам подал карточку. Цифры,
              -- перенесённые из таблицы заказчика, сюда не считаются.
              (select count(*) from kartochki k join lyudi l on l.id=k.chelovek_id
                 where l.rol='blogger' and k.podana_v is not null)             as zapolnili,
              (select count(*) from kartochki where status='published'
                 and opublikovana_v > now() - interval '7 days')               as za_nedelyu,
              (select coalesce(sum(prosmotry),0) from kartochki)               as prosmotry
            """
        )
    d = dict(r)
    vsego = d["vsego_ssylok"] or 1

    def dolya(n: int) -> int:
        return round(n * 100 / vsego)

    # Чем шлём коды и сколько денег осталось у оператора. Деньги кончаются
    # молча и выглядят точно как поломка — пусть админ видит цифру заранее,
    # а не разбирается посреди регистрации блогеров.
    d["kanalKodov"] = vhod.kanal()
    d["smsOstatok"] = await sms.ostatok()
    # Сколько человек в базе не получат код, пока нет своей подписи.
    # Не догадка на глаз, а цифра: по ней и решают, пора ли за подписью.
    async with baza.pul().acquire() as conn:
        telefony = await conn.fetch(
            "select telefon from lyudi where rol = 'blogger' and udalen_v is null"
            " and telefon is not null"
        )
    d["beelineSkolko"] = sum(1 for t in telefony if sms.pohozhe_beeline(t["telefon"]))

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
    if await _admin(request) is None:
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
    return {
        "tematiki": [dict(r) for r in tematiki],
        "goroda": [dict(r) for r in goroda],
    }


# Границы названия. Те же цифры стоят на экране; здесь они настоящие —
# экран можно обойти, сервер нет. Слово владельца 07.09.2026: «сделай
# валидацию на количество символов в категориях (городах)».
MIN_NAZVANIE = 2
MAX_NAZVANIE = 40


def _nazvanie_spiska(syroe: Any) -> str | None:
    """Годное название списка или None.

    Не годится: пусто, короче двух знаков, длиннее сорока, без единой буквы
    (одни цифры и точки — это не тематика). Двойные пробелы внутри
    схлопываем: «Еда  и   рестораны» и «Еда и рестораны» должны быть одной
    строкой, а не двумя похожими.
    """
    nazvanie = " ".join(str(syroe or "").split())
    if not (MIN_NAZVANIE <= len(nazvanie) <= MAX_NAZVANIE):
        return None
    if not any(ch.isalpha() for ch in nazvanie):
        return None
    return nazvanie


_TABLICY = {
    "tematika": ("tematiki", "vidna"),
    "gorod": ("goroda", "vidno"),
}


@app.post("/api/moder/spisok")
async def spisok_pravka(request: Request):
    """Одна точка на три дела: добавить, переименовать, скрыть.

    Удаления нет намеренно: удалишь тематику — поедут все карточки, где она
    стояла. Вместо этого «скрыть»: из выбора пропадает, у старых остаётся.

    Слияние убрано 07.09.2026 словом владельца («убери слить в городе»):
    оно было нужно, чтобы прибирать наплодившиеся районы, а районов больше
    нет. Длина названия проверяется здесь же: экран обойти можно, сервер —
    нет.
    """
    kto = await _admin(request)
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
                nazvanie = _nazvanie_spiska(telo.get("nazvanie"))
                if nazvanie is None:
                    return {"ok": False, "reason": "bad-name"}
                # Уникальность в базе различает большие и малые буквы, а для
                # человека «Алматы» и «алматы» — один город. Проверяем сами.
                zanyato = await conn.fetchval(
                    f"select nazvanie from {tablica} where lower(nazvanie) = lower($1)",
                    nazvanie,
                )
                if zanyato:
                    return {"ok": False, "reason": "zanyato", "est": zanyato}
                await conn.execute(f"insert into {tablica} (nazvanie) values ($1)", nazvanie)

            elif chto == "pereimenovat":
                nazvanie = _nazvanie_spiska(telo.get("nazvanie"))
                if nazvanie is None:
                    return {"ok": False, "reason": "bad-name"}
                zanyato = await conn.fetchval(
                    f"select nazvanie from {tablica}"
                    " where lower(nazvanie) = lower($1) and id <> $2",
                    nazvanie,
                    int(telo["id"]),
                )
                if zanyato:
                    return {"ok": False, "reason": "zanyato", "est": zanyato}
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

            else:
                return {"ok": False, "reason": "bad-action"}

            await conn.execute(
                "insert into zhurnal_moderatsii (kto_id, chto, prichina) values ($1,'popravil',$2)",
                kto["id"],
                f"списки: {chto} · {tip}",
            )
    return {"ok": True}


# ==================================================================== каталог


# =============================================== кто есть кто: назначить модератора


# Что писать в журнал: из какой роли в какую.
_OTMETKA = {
    ("blogger", "admin"): "naznachil-admina",
    ("admin", "blogger"): "snyal-admina",
}


def _admin_iz_nastroek(telefon: str | None) -> bool:
    """Этот номер сделан админом настройками сервера, а не нажатием в панели.

    Такому админку снять нажатием нельзя: сервер заводит его заново при
    каждом старте, и «снял» продержалось бы до первого запроса. Честнее
    сказать это сразу, чем показать кнопку, которая молча отменится.
    """
    if not telefon:
        return False
    nash = vhod.normalizovat_telefon(telefon)
    if nash is None:
        return False
    spisok = [nastroyki.VLADELETS_TELEFON, *nastroyki.ADMIN_TELEFONY.split(",")]
    return any(vhod.normalizovat_telefon(n or "") == nash for n in spisok)


@app.get("/api/moder/lyudi")
async def lyudi_spisok(request: Request, poisk: str | None = None):
    """Кто в админке и кого туда можно позвать. Только админу.

    Наверху экрана — те, кто уже админ; ниже — поиск по нику, имени и
    телефону среди остальных, чтобы не листать три сотни человек.
    """
    if await _admin(request) is None:
        return _net_prav()

    async with baza.pul().acquire() as conn:
        adminy = await conn.fetch(
            "select l.id, l.telefon, l.imya, l.rol, k.nik"
            " from lyudi l left join kartochki k on k.chelovek_id = l.id"
            " where l.rol = 'admin' and l.udalen_v is null"
            " order by l.id"
        )
        nayden = []
        if poisk and poisk.strip():
            nayden = await conn.fetch(
                "select l.id, l.telefon, l.imya, l.rol, k.nik"
                " from lyudi l left join kartochki k on k.chelovek_id = l.id"
                " where l.rol = 'blogger' and l.udalen_v is null"
                " and (k.nik ilike $1 or l.telefon ilike $1 or l.imya ilike $1)"
                " order by k.nik nulls last, l.id limit 30",
                "%" + poisk.strip() + "%",
            )

    ya = await _tekushchiy(request)

    def vid(r: asyncpg.Record) -> dict:
        return {
            "chelovekId": r["id"],
            "telefon": r["telefon"],
            "nik": r["nik"],
            "imya": r["imya"],
            "rol": r["rol"],
            # Эти двое решают, какие кнопки показывать. Считает их сервер:
            # экран не должен знать про настройки сервера ничего.
            "izNastroek": _admin_iz_nastroek(r["telefon"]),
            "etoYa": ya is not None and r["id"] == ya["id"],
        }

    # Ключ `moderatory` остался прежним, чтобы не ломать экран одним махом:
    # в нём теперь админы. Переименуем, когда будет повод трогать оба конца.
    return {"moderatory": [vid(r) for r in adminy], "nayden": [vid(r) for r in nayden]}


@app.post("/api/moder/rol")
async def naznachit_rol(request: Request):
    """Сделать человека админом или снять админа.

    Слово владельца 07.09.2026: «сделай возможность назначать админа в
    панели админки». До этого админ заводился только настройками сервера,
    и клиент не мог добавить себе второго человека без нас. Тем же днём
    роль модератора убрана: ролей две — блогер и админ.

    Три запрета, и все три — чтобы админка не осталась без хозяина:
    себе роль не меняют · последнего админа не снимают · админа, заведённого
    настройками, нажатием не снять (сервер вернёт его при первом же старте).
    """
    kto = await _admin(request)
    if kto is None:
        return _net_prav()
    telo = await request.json()
    chelovek_id = _nomer(telo.get("chelovekId"))
    rol = str(telo.get("rol", ""))
    if chelovek_id is None:
        return {"ok": False, "reason": "bad-id"}
    if rol not in ("admin", "blogger"):
        return {"ok": False, "reason": "bad-role"}
    if chelovek_id == kto["id"]:
        return {"ok": False, "reason": "sam-sebe"}

    async with baza.pul().acquire() as conn:
        chelovek = await conn.fetchrow(
            "select rol, telefon from lyudi where id = $1", chelovek_id
        )
        if chelovek is None:
            return {"ok": False, "reason": "no-person"}
        byla = chelovek["rol"]
        if byla == rol:
            return {"ok": True, "rol": rol}
        if byla == "admin":
            if _admin_iz_nastroek(chelovek["telefon"]):
                return {"ok": False, "reason": "admin-iz-nastroek"}
            ostanetsya = await conn.fetchval(
                "select count(*) from lyudi where rol = 'admin' and udalen_v is null"
            )
            if ostanetsya <= 1:
                return {"ok": False, "reason": "poslednii-admin"}
        async with conn.transaction():
            await conn.execute("update lyudi set rol = $2 where id = $1", chelovek_id, rol)
            await conn.execute(
                "insert into zhurnal_moderatsii (kartochka_id, kto_id, chto)"
                " values (null, $1, $2)",
                kto["id"],
                _OTMETKA[(byla, rol)],
            )
    return {"ok": True, "rol": rol}


@app.get("/api/katalog")
async def katalog(
    tematika: str | None = None,
    gorod: str | None = None,
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
            " join lyudi l on l.id = k.chelovek_id where " + gde,
            *znacheniya,
        )
        stroki = await conn.fetch(
            f"{osnova} order by {sortirovka}, k.id desc limit {na_stranice} offset {smeshchenie}",
            *znacheniya,
        )
        karty = await _karty_slovarem(conn, stroki)

        # Точки для карты считаем по тем же условиям, но без страниц:
        # человек должен видеть, где живёт вся его выборка, а не её кусок.
        tochki = await conn.fetch(
            "select g.nazvanie as gorod, g.shirota, g.dolgota, count(*) as skolko"
            " from kartochki k"
            " left join goroda g on g.id = k.gorod_id"
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


def _vnutri_statiki(put: str) -> Path | None:
    """Путь внутри папки собранных страниц — или None, если это не он.

    Проверяем именно развёрнутый путь: `..`, ссылка на другую папку и
    windows-хитрости (`C:\\`, обратный слэш) отсекаются здесь.
    """
    if not put or "\\" in put or ":" in put:
        return None
    koren = nastroyki.STATIKA.resolve()
    try:
        fayl = (koren / put).resolve()
    except OSError:
        return None
    if koren not in fayl.parents:
        return None
    return fayl if fayl.is_file() else None


@app.get("/{put:path}")
async def stranicy(put: str):
    """Одна служба: всё, что не /api, отдаём как собранный сайт.

    Дыра, закрытая 02.09.2026: адрес вида `/../../.env` уводил на любой файл
    диска — сервер отдавал наружу настройки с токеном бота. Теперь путь
    разворачивается до настоящего и проверяется: он обязан лежать внутри
    папки собранных страниц, иначе не отдаём ничего.
    """
    if put.startswith("api/"):
        return JSONResponse({"ok": False, "reason": "not-found"}, status_code=404)

    fayl = _vnutri_statiki(put)
    if fayl is not None:
        return FileResponse(fayl)

    index = nastroyki.STATIKA / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse({"ok": False, "reason": "no-static"}, status_code=404)
