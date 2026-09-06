"""Полный круг, слово владельца 06.09.2026.

Он описал его так: «Я как админ зашёл через admin/admin, добавил свой номер
или любой другой. Потом в другом браузере с этого номера через СМС вошёл, там
зарегался и загрузил скриншот».

Это и есть приёмка спеки — «один сценарий, один телефон». Здесь она пройдена
машиной, чтобы не разваливалась молча при следующей правке. Руками её всё
равно проходят на живом сайте: машина не увидит, что кнопка мелкая, а SMS
не пришла.

Коды и пароли тут не «набираются» в человеческом смысле: это проверка, она
кладёт код в базу тем же способом, каким его кладёт сервер, и обращается к
своему же приложению.
"""

import io

from PIL import Image

from app import chtenie, nastroyki

from .conftest import otpechatok


def _kartinka() -> bytes:
    """Маленький jpeg — сервер принимает только настоящие картинки."""
    holst = Image.new("RGB", (400, 700), "white")
    buf = io.BytesIO()
    holst.save(buf, "JPEG")
    return buf.getvalue()


async def _polozhit_kod(conn, chelovek_id: int, kod: str) -> None:
    await conn.execute(
        "insert into kody (chelovek_id, otpechatok, godin_do)"
        " values ($1, $2, now() + interval '15 min')",
        chelovek_id,
        otpechatok(kod),
    )


async def test_polnyy_krug_ot_admina_do_katalog(klient, baza_conn, monkeypatch):
    telefon = "+77019876543"
    nik = "@novaya.blogerka"

    # --- 1. Админ входит по логину и паролю -------------------------------
    monkeypatch.setattr(nastroyki, "ADMIN_LOGIN", "admin")
    monkeypatch.setattr(nastroyki, "ADMIN_PAROL", "admin")
    vhod_admina = await klient.post(
        "/api/auth/parol", json={"login": "admin", "parol": "admin"}
    )
    assert vhod_admina.json()["ok"] is True

    ya = (await klient.get("/api/me")).json()
    assert ya["vnutri"] is True and ya["rol"] == "admin"

    # --- 2. Заводит человека по номеру и получает ссылку-приглашение ------
    zavel = await klient.post("/api/moder/create", json={"telefon": telefon, "nick": nik})
    dannye = zavel.json()
    assert dannye["ok"] is True
    ssylka = dannye["priglashenie"]
    assert ssylka.startswith("/i/")
    token = ssylka.removeprefix("/i/")

    # неверный пароль в админку не пускает
    ne_pustili = await klient.post(
        "/api/auth/parol", json={"login": "admin", "parol": "ne-admin"}
    )
    assert ne_pustili.json()["ok"] is False

    klient.cookies.clear()  # «другой браузер»

    # --- 3. Блогер открывает ссылку и входит по коду из SMS ---------------
    priglashenie = (await klient.get(f"/api/invite/{token}")).json()
    assert priglashenie["status"] != "dead"

    poslannye: list = []

    async def poslat(kod: str, komu: str | None, metka: str = "") -> bool:
        poslannye.append(komu)
        return True

    monkeypatch.setattr("app.vhod.poslat", poslat)

    nachalo = await klient.post("/api/auth/start", json={"token": token})
    assert nachalo.json()["ok"] is True
    assert poslannye == [telefon]  # код ушёл именно на его номер

    chelovek_id = await baza_conn.fetchval(
        "select id from lyudi where telefon = $1", telefon
    )
    await _polozhit_kod(baza_conn, chelovek_id, "246810")
    voshel = await klient.post(
        "/api/auth/check", json={"token": token, "code": "246810"}
    )
    assert voshel.json()["ok"] is True

    # --- 4. Заполняет карточку --------------------------------------------
    sohranil = await klient.post(
        "/api/card",
        json={
            "nick": nik,
            "followers": "12500",
            "reach": "4300",
            "istochnik": "words",
            "ssylki": ["https://instagram.com/novaya.blogerka"],
            "tematiki": ["Красота"],
            "gorod": "Алматы",
            "yazyk": "Оба",
            "stavka": "50000",
        },
    )
    assert sohranil.json()["ok"] is True

    # --- 5. Грузит скрин статистики ---------------------------------------
    # Модель здесь не дёргается: проверяем свой путь, а не её зрение.
    monkeypatch.setattr(chtenie, "vklyucheno", lambda: False)
    skrin = await klient.post(
        "/api/card/screenshot",
        files={"file": ("statistika.jpg", _kartinka(), "image/jpeg")},
    )
    # ok=false при выключенном чтении — это «скрин сохранён, цифры впишите
    # сами», а не отказ. Адрес картинки в ответе есть всегда.
    assert "url" in skrin.json()
    lezhit = await baza_conn.fetchval(
        "select count(*) from skriny s join kartochki k on k.id = s.kartochka_id"
        " where k.chelovek_id = $1",
        chelovek_id,
    )
    assert lezhit == 1

    # --- 6. Карточка видна в каталоге, телефона в ней нет ------------------
    katalog = (await klient.get("/api/katalog", params={"poisk": "novaya.blogerka"})).text
    assert nik in katalog
    assert telefon.replace("+", "") not in katalog

    # --- 7. Ссылка одноразовая --------------------------------------------
    povtor = (await klient.get(f"/api/invite/{token}")).json()
    assert povtor["status"] == "dead"

    klient.cookies.clear()
