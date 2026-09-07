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


async def test_perebor_nomerov_ostanavlivaetsya(klient, baza_conn, monkeypatch):
    """Защита от прощупывания базы: ответ «такого номера нет» сам по себе —
    подсказка, и перебирать номера подряд нельзя."""
    from app import main, nastroyki

    monkeypatch.setattr(nastroyki, "POPYTOK_S_ADRESA_V_MINUTU", 3)
    main._stuk.clear()

    otvety = []
    for i in range(5):
        o = await klient.post("/api/auth/start", json={"phone": f"+7701000{i:04d}"})
        otvety.append(o.json().get("reason"))
    main._stuk.clear()

    assert "too-often" in otvety


async def test_perebor_schitaetsya_po_nastoyashchemu_adresu(klient, monkeypatch):
    """Баг 07.09.2026: за проксей у всех посетителей один адрес.

    На бою сервер стоит за Vercel, и `request.client.host` там общий. Значит
    десяток попыток входа в минуту делился на весь сайт разом. Настоящий
    адрес приходит в `x-forwarded-for` — по нему и считаем.
    """
    from app import main, nastroyki

    monkeypatch.setattr(nastroyki, "POPYTOK_S_ADRESA_V_MINUTU", 3)
    main._stuk.clear()

    # первый человек выбирает свой запас
    for i in range(5):
        await klient.post(
            "/api/auth/start",
            json={"phone": f"+7702000{i:04d}"},
            headers={"x-forwarded-for": "5.5.5.5"},
        )
    # второй приходит следом — и его пускают: адрес другой
    sosed = await klient.post(
        "/api/auth/start",
        json={"phone": "+77029999999"},
        headers={"x-forwarded-for": "6.6.6.6, 10.0.0.1"},
    )
    main._stuk.clear()
    assert sosed.json().get("reason") != "too-often"


async def test_vhod_prodlevaetsya_sam(klient, baza_conn):
    """Слово владельца 07.09.2026: «чтобы запоминал вход в аккаунт».

    Сессия живёт 60 дней от последнего захода, а не от первого: заход на
    /api/me отодвигает срок и переставляет cookie.
    """
    from .conftest import otkryt_sessiyu, zavesti_cheloveka

    kto = await zavesti_cheloveka(baza_conn, "+77031111111")
    znachenie = await otkryt_sessiyu(baza_conn, kto)  # проверочная сессия живёт сутки
    klient.cookies.set("sessiya", znachenie)

    bylo = await baza_conn.fetchval(
        "select godna_do from sessii where chelovek_id = $1", kto
    )
    otvet = await klient.get("/api/me")
    assert otvet.json()["vnutri"] is True
    stalo = await baza_conn.fetchval(
        "select godna_do from sessii where chelovek_id = $1", kto
    )
    assert stalo > bylo
    # и браузеру сказали держать её столько же
    assert "sessiya=" in otvet.headers.get("set-cookie", "")
    klient.cookies.clear()


async def test_svezhiy_vhod_ne_dvigayut(klient, baza_conn):
    """Продление не должно ходить в базу на каждую страницу."""
    from datetime import datetime, timedelta, timezone

    from .conftest import otkryt_sessiyu, otpechatok, zavesti_cheloveka

    kto = await zavesti_cheloveka(baza_conn, "+77031111112")
    znachenie = await otkryt_sessiyu(baza_conn, kto)
    dolgo = datetime.now(timezone.utc) + timedelta(days=59)
    await baza_conn.execute(
        "update sessii set godna_do = $2 where otpechatok = $1", otpechatok(znachenie), dolgo
    )
    klient.cookies.set("sessiya", znachenie)

    otvet = await klient.get("/api/me")
    assert otvet.json()["vnutri"] is True
    stalo = await baza_conn.fetchval(
        "select godna_do from sessii where chelovek_id = $1", kto
    )
    assert stalo == dolgo
    assert "sessiya=" not in otvet.headers.get("set-cookie", "")
    klient.cookies.clear()
