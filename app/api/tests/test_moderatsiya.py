"""Админка: кого пускаем, что показываем, что делают «одобрить» и «отклонить»."""

from .conftest import otkryt_sessiyu, zavesti_cheloveka, zavesti_kartochku


async def _moderator(klient, conn, telefon: str):
    kto = await zavesti_cheloveka(conn, telefon, rol="admin", imya="Модератор проверки")
    sessiya = await otkryt_sessiyu(conn, kto)
    klient.cookies.set("sessiya", sessiya)
    return kto


async def test_gostya_v_adminku_ne_puskayem(klient):
    klient.cookies.clear()
    for adres in (
        "/api/moder/zayavki?status=published&stranica=1",
        "/api/moder/prichiny",
        "/api/moder/svodka",
        "/api/moder/spiski",
    ):
        otvet = await klient.get(adres)
        assert otvet.status_code == 403, adres


async def test_blogger_v_adminku_ne_puskayem(klient, baza_conn):
    kto = await zavesti_cheloveka(baza_conn, "+77020000001")
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, kto))
    otvet = await klient.get("/api/moder/zayavki?status=published&stranica=1")
    assert otvet.status_code == 403
    klient.cookies.clear()


async def test_gotovye_prichiny_otkaza_prihodyat(klient, baza_conn):
    await _moderator(klient, baza_conn, "+77020000002")
    otvet = await klient.get("/api/moder/prichiny")
    assert otvet.status_code == 200
    teksty = [p["tekst"] for p in otvet.json()["prichiny"]]
    # Список правится в базе, поэтому проверяем не весь, а что он живой
    # и что в нём лежит формулировка из миграции 006.
    assert len(teksty) >= 5
    assert "Скрин нечитаемый — загрузите чёткий" in teksty
    klient.cookies.clear()


async def test_otklonit_pishet_prichinu_v_kartochku(klient, baza_conn):
    await _moderator(klient, baza_conn, "+77020000003")
    kto = await zavesti_cheloveka(baza_conn, "+77020000004")
    kid = await zavesti_kartochku(baza_conn, kto, "@na_otkaz", 5000, status="moderation")

    otvet = await klient.post(
        "/api/moder/reject", json={"id": str(kid), "prichina": "Ссылка ведёт не на ваш профиль"}
    )
    assert otvet.json()["ok"] is True

    stroka = await baza_conn.fetchrow(
        "select status, prichina_otkaza from kartochki where id = $1", kid
    )
    assert stroka["status"] == "rejected"
    assert stroka["prichina_otkaza"] == "Ссылка ведёт не на ваш профиль"

    # отклонённая карточка из каталога уходит
    niki = [k["nick"] for k in (await klient.get("/api/katalog")).json()["karty"]]
    assert "@na_otkaz" not in niki
    klient.cookies.clear()


async def test_odobrit_stavit_kartochku_v_katalog(klient, baza_conn):
    await _moderator(klient, baza_conn, "+77020000005")
    kto = await zavesti_cheloveka(baza_conn, "+77020000006")
    kid = await zavesti_kartochku(baza_conn, kto, "@na_odobrenie", 8000, status="moderation")

    otvet = await klient.post("/api/moder/approve", json={"id": str(kid)})
    assert otvet.json()["ok"] is True

    status = await baza_conn.fetchval("select status from kartochki where id = $1", kid)
    assert status == "published"
    niki = [k["nick"] for k in (await klient.get("/api/katalog")).json()["karty"]]
    assert "@na_odobrenie" in niki
    klient.cookies.clear()


async def test_zayavki_idut_stranicami_i_so_schetami(klient, baza_conn):
    await _moderator(klient, baza_conn, "+77020000007")
    otvet = await klient.get("/api/moder/zayavki?status=published&stranica=1")
    dannye = otvet.json()
    assert "zayavki" in dannye and "scheta" in dannye and "stranic" in dannye
    klient.cookies.clear()
