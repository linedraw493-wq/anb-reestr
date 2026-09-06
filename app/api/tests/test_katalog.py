"""Каталог: кого показываем, кого нет и что наружу не отдаём.

Главное здесь — последняя проверка: телефон живого человека не должен
уезжать в публичный ответ ни при каких условиях. Это не удобство, это
обещание тремстам людям.
"""

from .conftest import zavesti_cheloveka, zavesti_kartochku


async def test_v_katalog_popadayut_tolko_opublikovannye(klient, baza_conn):
    vidnyy = await zavesti_cheloveka(baza_conn, "+77010000001")
    chernovik = await zavesti_cheloveka(baza_conn, "+77010000002")
    await zavesti_kartochku(baza_conn, vidnyy, "@vidno", 5000)
    await zavesti_kartochku(baza_conn, chernovik, "@chernovik", 9000, status="draft")

    otvet = await klient.get("/api/katalog")
    assert otvet.status_code == 200
    niki = [k["nick"] for k in otvet.json()["karty"]]
    assert "@vidno" in niki
    assert "@chernovik" not in niki


async def test_otbor_po_podpischikam(klient, baza_conn):
    malyy = await zavesti_cheloveka(baza_conn, "+77010000003")
    bolshoy = await zavesti_cheloveka(baza_conn, "+77010000004")
    await zavesti_kartochku(baza_conn, malyy, "@malenkiy", 900)
    await zavesti_kartochku(baza_conn, bolshoy, "@bolshoy", 90_000)

    otvet = await klient.get("/api/katalog", params={"ot": 10_000})
    niki = [k["nick"] for k in otvet.json()["karty"]]
    assert "@bolshoy" in niki
    assert "@malenkiy" not in niki


async def test_poisk_po_niku(klient, baza_conn):
    kto = await zavesti_cheloveka(baza_conn, "+77010000005")
    await zavesti_kartochku(baza_conn, kto, "@redkoe_slovo_tut", 1200)

    otvet = await klient.get("/api/katalog", params={"poisk": "redkoe_slovo"})
    dannye = otvet.json()
    assert dannye["vsego"] == 1
    assert dannye["karty"][0]["nick"] == "@redkoe_slovo_tut"


async def test_telefon_naruzhu_ne_uezzhaet(klient, baza_conn):
    telefon = "+77010009999"
    kto = await zavesti_cheloveka(baza_conn, telefon)
    kid = await zavesti_kartochku(baza_conn, kto, "@s_telefonom", 3000)

    spisok = (await klient.get("/api/katalog")).text
    odna = (await klient.get(f"/api/katalog/{kid}")).text

    for otvet in (spisok, odna):
        assert telefon not in otvet
        assert "77010009999" not in otvet


async def test_snyataya_kartochka_ne_otdayotsya_po_pryamomu_adresu(klient, baza_conn):
    kto = await zavesti_cheloveka(baza_conn, "+77010000006")
    kid = await zavesti_kartochku(baza_conn, kto, "@spryatan", 4000, status="draft")

    otvet = await klient.get(f"/api/katalog/{kid}")
    assert otvet.json()["ok"] is False
