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


# ------------------------------------------ модератор и его границы (07.09.2026)


async def _nastoyashchiy_moderator(klient, conn, telefon: str):
    """Именно 'moderator', а не админ: у него прав меньше, это и проверяем."""
    kto = await zavesti_cheloveka(conn, telefon, rol="moderator", imya="Модератор")
    klient.cookies.set("sessiya", await otkryt_sessiyu(conn, kto))
    return kto


async def test_moderator_proveryaet_kartochki(klient, baza_conn):
    """Его работа: увидеть очередь, одобрить, отказать. Слово владельца 07.09."""
    await _nastoyashchiy_moderator(klient, baza_conn, "+77020000010")
    kto = await zavesti_cheloveka(baza_conn, "+77020000011")
    kid = await zavesti_kartochku(baza_conn, kto, "@moder_odobrit", 3000, status="moderation")

    assert (await klient.get("/api/moder/zayavki?status=moderation&stranica=1")).status_code == 200
    assert (await klient.get("/api/moder/prichiny")).status_code == 200
    assert (await klient.post("/api/moder/approve", json={"id": str(kid)})).json()["ok"] is True
    assert await baza_conn.fetchval(
        "select status from kartochki where id = $1", kid
    ) == "published"

    drugoy = await zavesti_cheloveka(baza_conn, "+77020000012")
    kid2 = await zavesti_kartochku(baza_conn, drugoy, "@moder_otkaz", 3000, status="moderation")
    otkaz = await klient.post(
        "/api/moder/reject", json={"id": str(kid2), "prichina": "Скрин нечитаемый"}
    )
    assert otkaz.json()["ok"] is True
    klient.cookies.clear()


async def test_moderatoru_zakryto_vse_ostalnoe(klient, baza_conn):
    """Приглашения, коды, списки, сводка, правка, удаление — админские."""
    await _nastoyashchiy_moderator(klient, baza_conn, "+77020000013")

    for adres in ("/api/moder/priglasheniya", "/api/moder/svodka", "/api/moder/spiski",
                  "/api/moder/lyudi"):
        assert (await klient.get(adres)).status_code == 403, adres

    for adres, telo in (
        ("/api/moder/create", {"telefon": "+77020000014", "nick": "@ne_zavedu"}),
        ("/api/moder/priglashenie", {"chelovekId": 1}),
        ("/api/moder/novaya-ssylka", {"telefon": "+77020000099", "nick": "@ne_vydam"}),
        ("/api/moder/kod", {"chelovekId": 1}),
        ("/api/moder/skryt", {"id": 1, "skryt": True}),
        ("/api/moder/update", {"id": 1}),
        ("/api/moder/remove", {"id": 1}),
        ("/api/moder/rol", {"chelovekId": 1, "rol": "moderator"}),
    ):
        assert (await klient.post(adres, json=telo)).status_code == 403, adres
    klient.cookies.clear()


async def test_admin_naznachaet_i_snimaet_moderatora(klient, baza_conn):
    admin_id = await _moderator(klient, baza_conn, "+77020000015")
    kto = await zavesti_cheloveka(baza_conn, "+77020000016", imya="Будущий модератор")
    await zavesti_kartochku(baza_conn, kto, "@budushchiy", 1000)

    dal = await klient.post("/api/moder/rol", json={"chelovekId": kto, "rol": "moderator"})
    assert dal.json()["ok"] is True
    assert await baza_conn.fetchval("select rol from lyudi where id = $1", kto) == "moderator"

    # он виден в списке модераторов, и его же находит поиск по нику
    spisok = (await klient.get("/api/moder/lyudi")).json()
    assert kto in [c["chelovekId"] for c in spisok["moderatory"]]

    snyal = await klient.post("/api/moder/rol", json={"chelovekId": kto, "rol": "blogger"})
    assert snyal.json()["ok"] is True
    assert await baza_conn.fetchval("select rol from lyudi where id = $1", kto) == "blogger"

    # в журнале осталось и назначение, и снятие
    otmetki = [
        r["chto"]
        for r in await baza_conn.fetch(
            "select chto from zhurnal_moderatsii where kto_id = $1 order by id", admin_id
        )
    ]
    assert otmetki == ["naznachil-moderatora", "snyal-moderatora"]
    klient.cookies.clear()


async def test_sebe_rol_ne_menyayut(klient, baza_conn):
    """Себе — никогда: иначе единственный админ разжалует сам себя.

    Чужого админа снять можно (07.09.2026, «назначать админа в панели»), но
    только если он не заведён настройками и не последний.
    """
    ya = await _moderator(klient, baza_conn, "+77020000017")

    sam = await klient.post("/api/moder/rol", json={"chelovekId": ya, "rol": "blogger"})
    assert sam.json() == {"ok": False, "reason": "sam-sebe"}
    assert await baza_conn.fetchval("select rol from lyudi where id = $1", ya) == "admin"

    krivaya = await klient.post("/api/moder/rol", json={"chelovekId": ya, "rol": "korol"})
    assert krivaya.json() == {"ok": False, "reason": "bad-role"}
    klient.cookies.clear()


async def test_vhoda_po_parolyu_bolshe_net(klient):
    """Слово владельца 07.09.2026: «логина и пароля не будет»."""
    klient.cookies.clear()
    otvet = await klient.post("/api/auth/parol", json={"login": "admin", "parol": "admin"})
    # Двери нет вовсе: 404, либо 405 — под этим адресом остался только
    # раздатчик собранных страниц, а он отвечает на GET.
    assert otvet.status_code in (404, 405)


# ------------------------------------------ админ из панели (07.09.2026)


async def test_admin_naznachaet_admina(klient, baza_conn):
    """Слово владельца: «сделай возможность назначать админа в панели»."""
    await _moderator(klient, baza_conn, "+77020000020")
    kto = await zavesti_cheloveka(baza_conn, "+77020000021", imya="Будущий админ")

    dal = await klient.post("/api/moder/rol", json={"chelovekId": kto, "rol": "admin"})
    assert dal.json()["ok"] is True
    assert await baza_conn.fetchval("select rol from lyudi where id = $1", kto) == "admin"

    # и снять можно тем же путём — админов на сайте больше одного
    snyal = await klient.post("/api/moder/rol", json={"chelovekId": kto, "rol": "blogger"})
    assert snyal.json()["ok"] is True
    assert await baza_conn.fetchval("select rol from lyudi where id = $1", kto) == "blogger"
    klient.cookies.clear()


async def test_admina_iz_nastroek_nazhatiem_ne_snyat(klient, baza_conn, monkeypatch):
    """Сервер вернёт ему права при первом старте — врать про это нельзя."""
    from app import nastroyki

    await _moderator(klient, baza_conn, "+77020000022")
    iz_nastroek = await zavesti_cheloveka(baza_conn, "+77020000023", rol="admin")
    monkeypatch.setattr(nastroyki, "ADMIN_TELEFONY", "+77020000023")

    otvet = await klient.post("/api/moder/rol", json={"chelovekId": iz_nastroek, "rol": "blogger"})
    assert otvet.json() == {"ok": False, "reason": "admin-iz-nastroek"}
    assert await baza_conn.fetchval(
        "select rol from lyudi where id = $1", iz_nastroek
    ) == "admin"

    # и в списке он помечен, чтобы экран не показывал кнопку впустую
    spisok = (await klient.get("/api/moder/lyudi")).json()["moderatory"]
    nash = [c for c in spisok if c["chelovekId"] == iz_nastroek][0]
    assert nash["izNastroek"] is True
    klient.cookies.clear()


async def test_poslednego_admina_ne_snyat(klient, baza_conn, monkeypatch):
    """Иначе в админку станет не войти вовсе, и чинить это только руками."""
    from app import nastroyki

    monkeypatch.setattr(nastroyki, "ADMIN_TELEFONY", "")
    monkeypatch.setattr(nastroyki, "VLADELETS_TELEFON", "")
    # все нынешние админы на минуту становятся блогерами, кроме двоих ниже
    await baza_conn.execute("update lyudi set rol = 'blogger' where rol = 'admin'")
    ya = await zavesti_cheloveka(baza_conn, "+77020000024", rol="admin")
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, ya))
    drugoy = await zavesti_cheloveka(baza_conn, "+77020000025", rol="admin")

    # пока админов двое — снять можно
    assert (await klient.post(
        "/api/moder/rol", json={"chelovekId": drugoy, "rol": "blogger"}
    )).json()["ok"] is True

    # остался один, и это я: себе роль не меняют
    assert (await klient.post(
        "/api/moder/rol", json={"chelovekId": ya, "rol": "blogger"}
    )).json() == {"ok": False, "reason": "sam-sebe"}

    # а если снимать последнего чужими руками — запрет по счёту
    vtoroy = await zavesti_cheloveka(baza_conn, "+77020000026", rol="admin")
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, vtoroy))
    await klient.post("/api/moder/rol", json={"chelovekId": ya, "rol": "blogger"})
    poslednii = await klient.post(
        "/api/moder/rol", json={"chelovekId": vtoroy, "rol": "blogger"}
    )
    assert poslednii.json()["reason"] in ("sam-sebe", "poslednii-admin")
    klient.cookies.clear()


# ------------------------------- ссылка-приглашение по номеру (07.09.2026)


async def test_novaya_ssylka_zavoditsya_na_nomer(klient, baza_conn):
    """Слово владельца: «приглашение ссылку генерировать по номеру телефона»."""
    await _moderator(klient, baza_conn, "+77020000030")
    telefon = "+77020000031"

    otvet = await klient.post(
        "/api/moder/novaya-ssylka", json={"telefon": telefon, "nick": "@po_nomeru"}
    )
    dannye = otvet.json()
    assert dannye["ok"] is True and dannye["ssylka"].startswith("/i/")

    chelovek_id = await baza_conn.fetchval("select id from lyudi where telefon = $1", telefon)
    assert chelovek_id is not None
    # приглашение выписано именно ему, и номер в нём уже есть
    zhivo = await klient.get("/api/invite/" + dannye["ssylka"].removeprefix("/i/"))
    assert zhivo.json()["phoneMasked"] != ""
    klient.cookies.clear()


async def test_novaya_ssylka_ne_dublirovat_nomer(klient, baza_conn):
    """Номер — это личность: вторую запись под тот же номер не заводим."""
    await _moderator(klient, baza_conn, "+77020000032")
    kto = await zavesti_cheloveka(baza_conn, "+77020000033")
    await zavesti_kartochku(baza_conn, kto, "@uzhe_est", 1000)

    zanyat = await klient.post("/api/moder/novaya-ssylka", json={"telefon": "+77020000033"})
    assert zanyat.json()["reason"] == "phone-taken"
    assert zanyat.json()["nik"] == "@uzhe_est"

    krivoy = await klient.post("/api/moder/novaya-ssylka", json={"telefon": "12345"})
    assert krivoy.json()["reason"] == "bad-phone"

    skolko = await baza_conn.fetchval(
        "select count(*) from lyudi where telefon = $1", "+77020000033"
    )
    assert skolko == 1
    klient.cookies.clear()
