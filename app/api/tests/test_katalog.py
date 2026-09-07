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


# ------------------------- приёмка спеки: «поиск и фильтры работают» (07.09.2026)
#
# Спека, день 4–5: «список с поиском по нику, сортировка по подписчикам и
# охвату, фильтры: диапазон подписчиков, тематика, район, язык». По
# подписчикам и нику проверки были и раньше — здесь остальное.


async def _kartochka_s_otborom(
    conn, telefon: str, nik: str, *, podpischiki: int, ohvat: int,
    tematika: str | None = None, gorod: str | None = None,
    rayon: str | None = None, yazyk: str | None = None,
) -> int:
    kto = await zavesti_cheloveka(conn, telefon)
    kid = await zavesti_kartochku(conn, kto, nik, podpischiki, ohvat=ohvat)
    if yazyk:
        await conn.execute("update kartochki set yazyk = $2 where id = $1", kid, yazyk)
    if gorod:
        gid = await conn.fetchval("select id from goroda where nazvanie = $1", gorod)
        await conn.execute("update kartochki set gorod_id = $2 where id = $1", kid, gid)
        if rayon:
            rid = await conn.fetchval(
                "select id from rayony where gorod_id = $1 and nazvanie = $2", gid, rayon
            )
            await conn.execute("update kartochki set rayon_id = $2 where id = $1", kid, rid)
    if tematika:
        tid = await conn.fetchval("select id from tematiki where nazvanie = $1", tematika)
        await conn.execute(
            "insert into kartochka_tematiki (kartochka_id, tematika_id) values ($1, $2)",
            kid,
            tid,
        )
    return kid


async def test_otbor_po_tematike_gorodu_rayonu_i_yazyku(klient, baza_conn):
    tematika = await baza_conn.fetchval("select nazvanie from tematiki where vidna limit 1")
    gorod = await baza_conn.fetchval(
        "select g.nazvanie from goroda g join rayony r on r.gorod_id = g.id limit 1"
    )
    rayon = await baza_conn.fetchval(
        "select r.nazvanie from rayony r join goroda g on g.id = r.gorod_id"
        " where g.nazvanie = $1 limit 1",
        gorod,
    )

    await _kartochka_s_otborom(
        baza_conn, "+77015000001", "@podhodit_vsemu", podpischiki=4000, ohvat=800,
        tematika=tematika, gorod=gorod, rayon=rayon, yazyk="Русский",
    )
    await _kartochka_s_otborom(
        baza_conn, "+77015000002", "@ne_podhodit", podpischiki=4000, ohvat=800,
        yazyk="Казахский",
    )

    async def niki(**params):
        otvet = await klient.get("/api/katalog", params=params)
        return [k["nick"] for k in otvet.json()["karty"]]

    assert "@podhodit_vsemu" in await niki(tematika=tematika)
    assert "@ne_podhodit" not in await niki(tematika=tematika)
    assert "@podhodit_vsemu" in await niki(gorod=gorod)
    assert "@podhodit_vsemu" in await niki(gorod=gorod, rayon=rayon)
    assert "@podhodit_vsemu" in await niki(yazyk="Русский")
    assert "@podhodit_vsemu" not in await niki(yazyk="Казахский")


async def test_sortirovka_po_podpischikam_i_ohvatu(klient, baza_conn):
    """Спека: «сортировка по подписчикам и охвату» — обе, и обе честные."""
    await _kartochka_s_otborom(
        baza_conn, "+77015000003", "@mnogo_podpischikov", podpischiki=900_000, ohvat=1_000
    )
    await _kartochka_s_otborom(
        baza_conn, "+77015000004", "@bolshoy_ohvat", podpischiki=1_000, ohvat=900_000
    )

    po_podpischikam = (await klient.get("/api/katalog", params={"poryadok": "podpischiki"})).json()
    assert po_podpischikam["karty"][0]["nick"] == "@mnogo_podpischikov"

    po_ohvatu = (await klient.get("/api/katalog", params={"poryadok": "ohvat"})).json()
    assert po_ohvatu["karty"][0]["nick"] == "@bolshoy_ohvat"


async def test_stranicy_ne_teryayut_i_ne_dublyat(klient, baza_conn):
    """Каталог отдаётся страницами: на второй должно быть продолжение."""
    pervaya = (await klient.get("/api/katalog", params={"na_stranice": 5, "stranica": 1})).json()
    vtoraya = (await klient.get("/api/katalog", params={"na_stranice": 5, "stranica": 2})).json()
    assert len(pervaya["karty"]) == 5
    pervye = {k["id"] for k in pervaya["karty"]}
    vtorye = {k["id"] for k in vtoraya["karty"]}
    assert pervye and vtorye and not (pervye & vtorye)
    assert pervaya["vsego"] == vtoraya["vsego"]


async def test_data_cifr_vidna_v_kataloge(klient, baza_conn):
    """Спека, день 4: «с пометкой источника **и датой**».

    Дата ставится тогда, когда цифры записаны, — не раньше. У старых
    карточек её нет, и это честно: врать задним числом нельзя.
    """
    kto = await zavesti_cheloveka(baza_conn, "+77015000005")
    kid = await zavesti_kartochku(baza_conn, kto, "@s_datoy", 3000, ohvat=500)

    bez_daty = (await klient.get(f"/api/katalog/{kid}")).json()
    assert bez_daty["karta"]["cifryOt"] is None

    await baza_conn.execute("update kartochki set cifry_ot = now() where id = $1", kid)
    s_datoy = (await klient.get(f"/api/katalog/{kid}")).json()
    assert s_datoy["karta"]["cifryOt"] is not None
    assert len(s_datoy["karta"]["cifryOt"]) == 10  # 2026-09-07
