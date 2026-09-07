"""Приёмка спеки недели 1 — машиной, пункт за пунктом.

Спека (`speka-nedelya-1.pdf`) требует конкретного: «блогер с телефона
открывает инвайт-ссылку → вводит номер и подтверждает кодом → заполняет
карточку → загружает скриншот — и его охваты видны в карточке в каталоге.
Отдельно: каталог показывает карточки, поиск и фильтры работают,
администратор правит карточки без разработчика».

Сам сквозной сценарий проходится в `test_polnyy_krug.py`. Здесь — те
обещания спеки, что легко сломать незаметно: «номер — идентификатор, один
человек — одна запись», «телефон наружу не отдаётся», «согласие при
регистрации», «пометка достоверности», «скрыть/добавить», «числа с
пометкой источника и датой».

Заведено 07.09.2026 по просьбе владельца сверить соответствие спеке.
"""

from .conftest import otkryt_sessiyu, otpechatok, zavesti_cheloveka, zavesti_kartochku


async def _polozhit_kod(conn, chelovek_id: int, kod: str) -> None:
    await conn.execute(
        "insert into kody (chelovek_id, otpechatok, godin_do)"
        " values ($1, $2, now() + interval '15 min')",
        chelovek_id,
        otpechatok(kod),
    )


async def _voyti(klient, conn, telefon: str, monkeypatch) -> int:
    """Вход как у человека: номер → код. Код кладём в базу, как сервер."""

    async def poslat(kod: str, komu: str | None, metka: str = "") -> bool:
        return True

    monkeypatch.setattr("app.vhod.poslat", poslat)
    await klient.post("/api/auth/start", json={"phone": telefon})
    chelovek_id = await conn.fetchval("select id from lyudi where telefon = $1", telefon)
    await _polozhit_kod(conn, chelovek_id, "424242")
    otvet = await klient.post("/api/auth/check", json={"phone": telefon, "code": "424242"})
    assert otvet.json()["ok"] is True
    return chelovek_id


# ------------------------------------- «номер — идентификатор, одна запись»


async def test_odin_chelovek_odna_zapis(klient, baza_conn, monkeypatch):
    telefon = "+77016000001"
    await zavesti_cheloveka(baza_conn, telefon)

    await _voyti(klient, baza_conn, telefon, monkeypatch)
    klient.cookies.clear()
    await _voyti(klient, baza_conn, telefon, monkeypatch)

    skolko = await baza_conn.fetchval(
        "select count(*) from lyudi where telefon = $1", telefon
    )
    assert skolko == 1
    kartochek = await baza_conn.fetchval(
        "select count(*) from kartochki k join lyudi l on l.id = k.chelovek_id"
        " where l.telefon = $1",
        telefon,
    )
    assert kartochek == 1
    klient.cookies.clear()


async def test_soglasie_zapisyvaetsya_pri_vhode(klient, baza_conn, monkeypatch):
    """Спека, ПД: «минимум этапа — согласие при регистрации».

    Галочка на экране ничего не стоит, если её негде предъявить: пишем
    отметку в базу с версией текста.
    """
    telefon = "+77016000002"
    await zavesti_cheloveka(baza_conn, telefon)
    chelovek_id = await _voyti(klient, baza_conn, telefon, monkeypatch)

    soglasie = await baza_conn.fetchrow(
        "select versiya from soglasiya where chelovek_id = $1", chelovek_id
    )
    assert soglasie is not None and soglasie["versiya"]
    klient.cookies.clear()


# ------------------------------------------- «телефон наружу не отдаётся»


async def test_telefon_ne_uezzhaet_ni_v_odnom_publichnom_otvete(klient, baza_conn):
    telefon = "+77016000003"
    kto = await zavesti_cheloveka(baza_conn, telefon)
    kid = await zavesti_kartochku(baza_conn, kto, "@bez_telefona", 4200)
    cifry = telefon.replace("+", "")

    for adres in ("/api/katalog", f"/api/katalog/{kid}", "/api/spravochniki"):
        otvet = await klient.get(adres)
        assert cifry not in otvet.text, adres

    # и в приглашении номер только под маской
    token = "proverka-maski-0001"
    await baza_conn.execute(
        "insert into priglasheniya (token, chelovek_id, godno_do)"
        " values ($1, $2, now() + interval '30 days')",
        token,
        kto,
    )
    priglashenie = (await klient.get(f"/api/invite/{token}")).json()
    assert cifry not in str(priglashenie)
    assert "•" in priglashenie["phoneMasked"]


# -------------------------------------------------- «кабинет блогера» (день 3–4)


async def test_blogger_pravit_svoyu_kartochku(klient, baza_conn, monkeypatch):
    """Спека: «блогер редактирует тематика, район, ставка, ссылки»."""
    telefon = "+77016000004"
    await zavesti_cheloveka(baza_conn, telefon)
    await _voyti(klient, baza_conn, telefon, monkeypatch)

    tematika = await baza_conn.fetchval("select nazvanie from tematiki where vidna limit 1")
    gorod = await baza_conn.fetchval(
        "select g.nazvanie from goroda g join rayony r on r.gorod_id = g.id limit 1"
    )
    rayon = await baza_conn.fetchval(
        "select r.nazvanie from rayony r join goroda g on g.id = r.gorod_id"
        " where g.nazvanie = $1 limit 1",
        gorod,
    )

    sohranil = await klient.post(
        "/api/card",
        json={
            "nick": "@sam_sebe_redaktor",
            "followers": "7300",
            "reach": "2100",
            "istochnik": "words",
            "ssylki": ["https://instagram.com/sam_sebe_redaktor"],
            "tematiki": [tematika],
            "gorod": gorod,
            "rayon": rayon,
            "yazyk": "Русский",
            "stavka": "40000",
        },
    )
    assert sohranil.json()["ok"] is True

    moya = (await klient.get("/api/card")).json()["karta"]
    assert moya["nick"] == "@sam_sebe_redaktor"
    assert moya["tematiki"] == [tematika]
    assert moya["gorod"] == gorod and moya["rayon"] == rayon
    assert moya["stavka"] == "40000"
    assert moya["ssylki"] == ["https://instagram.com/sam_sebe_redaktor"]
    # спека, день 4: «с пометкой источника и датой» — дата встала сама
    assert moya["cifryOt"] is not None
    klient.cookies.clear()


# ------------------------------------------------------- «админка» (день 5)


async def test_moderator_stavit_pometku_dostovernosti(klient, baza_conn):
    """Спека, день 5: «пометка достоверности» руками, а не только сама."""
    admin = await zavesti_cheloveka(baza_conn, "+77016000005", rol="admin")
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, admin))
    kto = await zavesti_cheloveka(baza_conn, "+77016000006")
    kid = await zavesti_kartochku(baza_conn, kto, "@pometka", 5000, ohvat=1200)

    await klient.post(
        "/api/moder/update",
        json={
            "id": str(kid),
            "nick": "@pometka",
            "followers": "5000",
            "reach": "1200",
            "istochnik": "screen",
            "tematiki": [],
            "gorod": "",
            "rayon": "",
            "yazyk": "Русский",
            "stavka": "",
        },
    )
    stalo = await baza_conn.fetchval("select istochnik from kartochki where id = $1", kid)
    assert stalo == "screen"
    klient.cookies.clear()


async def test_skryt_i_vernut_kartochku(klient, baza_conn):
    """Спека, день 5: «скрыть/добавить». Скрытие обратимо, данные целы."""
    admin = await zavesti_cheloveka(baza_conn, "+77016000007", rol="admin")
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, admin))
    kto = await zavesti_cheloveka(baza_conn, "+77016000008")
    kid = await zavesti_kartochku(baza_conn, kto, "@to_est_to_net", 6000)

    async def v_kataloge() -> bool:
        otvet = await klient.get("/api/katalog", params={"poisk": "to_est_to_net"})
        return "@to_est_to_net" in [k["nick"] for k in otvet.json()["karty"]]

    assert await v_kataloge() is True
    await klient.post("/api/moder/skryt", json={"id": str(kid), "skryt": True})
    assert await v_kataloge() is False
    await klient.post("/api/moder/skryt", json={"id": str(kid), "skryt": False})
    assert await v_kataloge() is True

    # данные целы — карточка та же, а не заведённая заново
    zhiva = await baza_conn.fetchval(
        "select podpischiki from kartochki where id = $1", kid
    )
    assert zhiva == 6000
    klient.cookies.clear()


async def test_admin_pravit_spiski_bez_razrabotchika(klient, baza_conn):
    """Спека, приёмка: «администратор правит карточки без разработчика».

    Тематики и города он тоже правит сам — иначе список приходится менять
    нам, а это ровно то, чего спека просит избежать.
    """
    admin = await zavesti_cheloveka(baza_conn, "+77016000009", rol="admin")
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, admin))

    dobavil = await klient.post(
        "/api/moder/spisok", json={"tip": "tematika", "chto": "dobavit", "nazvanie": "Проверочная"}
    )
    assert dobavil.json()["ok"] is True
    spravochniki = (await klient.get("/api/spravochniki")).json()
    assert "Проверочная" in spravochniki["tematiki"]

    tid = await baza_conn.fetchval("select id from tematiki where nazvanie = 'Проверочная'")
    await klient.post(
        "/api/moder/spisok", json={"tip": "tematika", "chto": "skryt", "id": tid, "vidno": False}
    )
    posle = (await klient.get("/api/spravochniki")).json()
    assert "Проверочная" not in posle["tematiki"]
    klient.cookies.clear()
