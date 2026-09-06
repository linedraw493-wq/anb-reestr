"""Постоянный код входа — именной.

Слово владельца 06.09.2026: «оставь мой аккаунт по номеру … как админский,
код на меня именно 111111». Всем остальным вход идёт по спеке — настоящий
код на телефон.

Здесь проверяется главное: что этот код **не подходит к чужому кабинету**.
Именно так была устроена дыра до 06.09 — код пускал кого угодно на любой
номер, и лежал он в открытом репозитории.
"""

from app import nastroyki, vhod

from .conftest import zavesti_cheloveka


def _nastroit(monkeypatch, kod: str, telefony: str):
    monkeypatch.setattr(nastroyki, "MASTER_KOD", kod)
    monkeypatch.setattr(nastroyki, "MASTER_KOD_TELEFONY", telefony)


# ------------------------------------------------------------- для кого он


def test_dlya_svoego_nomera_rabotaet(monkeypatch):
    _nastroit(monkeypatch, "111111", "+77052819342")
    assert vhod.master_kod_dlya("+77052819342") is True


def test_nomer_uznayotsya_v_lyuboy_zapisi(monkeypatch):
    """Владелец пишет свой номер и через 8, и через +7 — это один человек."""
    _nastroit(monkeypatch, "111111", "87052819342")
    assert vhod.master_kod_dlya("+77052819342") is True
    assert vhod.master_kod_dlya("87052819342") is True
    assert vhod.master_kod_dlya("7 705 281 93 42") is True


def test_dlya_chuzhogo_nomera_ne_rabotaet(monkeypatch):
    _nastroit(monkeypatch, "111111", "+77052819342")
    assert vhod.master_kod_dlya("+77011234567") is False


def test_pustoy_spisok_znachit_nikomu(monkeypatch):
    """Даже если код задан. Раньше пустой список значил «всем» — это и была дыра."""
    _nastroit(monkeypatch, "111111", "")
    assert vhod.master_kod_dlya("+77052819342") is False


def test_zvyozdochka_znachit_vsem(monkeypatch):
    """Осознанное решение для своей машины, не значение по умолчанию."""
    _nastroit(monkeypatch, "111111", "*")
    assert vhod.master_kod_dlya("+77011234567") is True


def test_bez_koda_spisok_nichego_ne_znachit(monkeypatch):
    _nastroit(monkeypatch, "", "+77052819342")
    assert vhod.master_kod_dlya("+77052819342") is False


# ----------------------------------------------------------- на живом входе


async def test_chuzhoy_kabinet_postoyannym_kodom_ne_otkryt(klient, baza_conn, monkeypatch):
    """Тот самый случай, ради которого всё и переделано."""
    _nastroit(monkeypatch, "111111", "+77052819342")

    chuzhoy = "+77014443322"
    await zavesti_cheloveka(baza_conn, chuzhoy)
    otvet = await klient.post("/api/auth/check", json={"phone": chuzhoy, "code": "111111"})
    assert otvet.json()["ok"] is False
    klient.cookies.clear()


async def test_svoy_kabinet_postoyannym_kodom_otkryvaetsya(klient, baza_conn, monkeypatch):
    # Номер самого владельца заводит сервер при старте — берём другой «свой»,
    # чтобы проверка не спорила с ним за одну строку в базе.
    svoy = "+77052819343"
    _nastroit(monkeypatch, "111111", svoy)
    await zavesti_cheloveka(baza_conn, svoy, rol="admin", imya="Свой номер")

    # SMS при этом не отправляется — слать нечего, код постоянный
    nachalo = await klient.post("/api/auth/start", json={"phone": svoy})
    assert nachalo.json()["ok"] is True

    itog = await klient.post("/api/auth/check", json={"phone": svoy, "code": "111111"})
    assert itog.json()["ok"] is True
    klient.cookies.clear()


async def test_ostalnym_vhod_po_speke(klient, baza_conn, monkeypatch):
    """Не свой номер — идёт обычный путь: код шлётся, постоянный не подходит."""
    _nastroit(monkeypatch, "111111", "+77052819342")

    poslannye: list = []

    async def poslat(kod: str, telefon: str | None, metka: str = "") -> bool:
        poslannye.append(telefon)
        return True

    monkeypatch.setattr(vhod, "poslat", poslat)

    chuzhoy = "+77019998877"
    await zavesti_cheloveka(baza_conn, chuzhoy)
    otvet = await klient.post("/api/auth/start", json={"phone": chuzhoy})
    assert otvet.json()["ok"] is True
    assert poslannye == [chuzhoy]  # код ушёл по-настоящему
    klient.cookies.clear()
