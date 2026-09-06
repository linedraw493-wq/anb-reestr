"""Вход: по личной ссылке-приглашению, по номеру и коду, и кому нельзя.

Демо-код в проверках выключен (MASTER_KOD пуст) — проверяется настоящий путь.
Настоящий код никуда не отправляется: Telegram в проверках отключён, поэтому
код кладётся в базу напрямую тем же способом, каким его кладёт сервер.
"""

from .conftest import otpechatok, zavesti_cheloveka, zavesti_kartochku


async def _polozhit_kod(conn, chelovek_id: int, kod: str) -> None:
    """Живой код на пять минут — то же, что делает `vhod.vydat_kod`."""
    await conn.execute(
        "insert into kody (chelovek_id, otpechatok, godin_do)"
        " values ($1, $2, now() + interval '5 min')",
        chelovek_id,
        otpechatok(kod),
    )


async def test_chuzhoy_nomer_ne_puskayem(klient):
    otvet = await klient.post("/api/auth/start", json={"phone": "+77770000000"})
    assert otvet.json() == {"ok": False, "reason": "unknown-phone"}


async def test_krivoy_nomer_otbivaem(klient):
    otvet = await klient.post("/api/auth/start", json={"phone": "12345"})
    assert otvet.json()["reason"] == "bad-phone"


async def test_bez_dostavki_koda_vhod_ne_nachinaetsya(klient, baza_conn):
    """Ни Telegram, ни SMS не настроены — сервер честно отвечает «нет», а не
    делает вид, что код ушёл. В проверках это всегда так: бота тут нет."""
    telefon = "+77014444444"
    await zavesti_cheloveka(baza_conn, telefon)
    otvet = await klient.post("/api/auth/start", json={"phone": telefon})
    assert otvet.json()["ok"] is False


async def test_vhod_po_nomeru_i_kodu(klient, baza_conn):
    telefon = "+77011111111"
    kto = await zavesti_cheloveka(baza_conn, telefon)

    await _polozhit_kod(baza_conn, kto, "123456")
    itog = await klient.post("/api/auth/check", json={"phone": telefon, "code": "123456"})
    assert itog.json()["ok"] is True
    assert "sessiya" in itog.cookies or "sessiya" in klient.cookies

    ya = (await klient.get("/api/me")).json()
    assert ya["vnutri"] is True
    klient.cookies.clear()


async def test_nevernyy_kod_ne_puskayet(klient, baza_conn):
    telefon = "+77012222222"
    kto = await zavesti_cheloveka(baza_conn, telefon)
    await _polozhit_kod(baza_conn, kto, "654321")

    itog = await klient.post("/api/auth/check", json={"phone": telefon, "code": "000000"})
    assert itog.json()["ok"] is False
    assert itog.json()["reason"] == "wrong"
    klient.cookies.clear()


async def test_priglashenie_odnorazovoe(klient, baza_conn):
    telefon = "+77013333333"
    kto = await zavesti_cheloveka(baza_conn, telefon)
    await zavesti_kartochku(baza_conn, kto, "@po_ssylke", 700, status="draft")
    await baza_conn.execute(
        "insert into priglasheniya (token, chelovek_id, godno_do)"
        " values ($1, $2, now() + interval '30 days')",
        "token-proverki",
        kto,
    )

    zhivo = await klient.get("/api/invite/token-proverki")
    assert zhivo.json()["status"] != "dead"

    await _polozhit_kod(baza_conn, kto, "111222")
    itog = await klient.post(
        "/api/auth/check", json={"token": "token-proverki", "code": "111222"}
    )
    assert itog.json()["ok"] is True

    # ссылка гаснет после первого прохода — второй раз по ней не войти
    povtor = await klient.get("/api/invite/token-proverki")
    assert povtor.json()["status"] == "dead"
    klient.cookies.clear()


async def test_gost_ne_vidit_svoyu_kartochku(klient):
    klient.cookies.clear()
    otvet = await klient.get("/api/card")
    assert otvet.json()["ok"] is False
