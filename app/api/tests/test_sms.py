"""Доставка кодов: выбор канала и отправка SMS через Mobizon.

Настоящий Mobizon здесь не дёргается — это деньги и сеть. Проверяется наше:
какой канал выбран, что уходит в провайдера и что мы делаем с его ответом.
"""

import httpx

from app import nastroyki, sms, vhod

from .conftest import zavesti_cheloveka


class OtvetZaglushka:
    """Ответ вместо настоящего: httpx.AsyncClient.post возвращает такой."""

    def __init__(self, telo: dict):
        self._telo = telo

    def json(self) -> dict:
        return self._telo


def _podmenit_post(monkeypatch, telo: dict, zapisi: list):
    async def post(self, url, **kwargs):  # noqa: ANN001
        zapisi.append({"url": url, "data": kwargs.get("data")})
        return OtvetZaglushka(telo)

    monkeypatch.setattr(httpx.AsyncClient, "post", post)


# ------------------------------------------------------------------- канал


def test_bez_klyucha_kanal_telegram(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "")
    monkeypatch.setattr(nastroyki, "KANAL_KODOV", "auto")
    assert vhod.kanal() == "telegram"


def test_s_klyuchom_kanal_sms(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    monkeypatch.setattr(nastroyki, "KANAL_KODOV", "auto")
    assert vhod.kanal() == "sms"


def test_kanal_mozhno_zadat_rukami(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    monkeypatch.setattr(nastroyki, "KANAL_KODOV", "telegram")
    assert vhod.kanal() == "telegram"


# --------------------------------------------------------------- отправка


async def test_sms_uhodit_na_nomer_bez_plyusa(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    monkeypatch.setattr(nastroyki, "MOBIZON_PODPIS", "")
    zapisi: list = []
    _podmenit_post(monkeypatch, {"code": 0, "data": {}, "message": ""}, zapisi)

    assert await sms.poslat_kod("123456", "+7 701 000 00 00") is True

    ushlo = zapisi[0]["data"]
    assert ushlo["recipient"] == "77010000000"  # Mobizon ждёт цифры без плюса
    assert "123456" in ushlo["text"]
    # Своей подписи нет — не подставляем: провайдер отобьёт незарегистрированную
    assert "from" not in ushlo


async def test_svoya_podpis_podstavlyaetsya(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    monkeypatch.setattr(nastroyki, "MOBIZON_PODPIS", "ANB")
    zapisi: list = []
    _podmenit_post(monkeypatch, {"code": 0}, zapisi)

    await sms.poslat_kod("123456", "+77010000000")
    assert zapisi[0]["data"]["from"] == "ANB"


async def test_otkaz_provaydera_eto_ne_otpravili(monkeypatch):
    """Beeline с общей подписи — как раз этот случай."""
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    _podmenit_post(monkeypatch, {"code": 1, "message": "Not enough funds"}, [])
    assert await sms.poslat_kod("123456", "+77010000000") is False


async def test_upavshaya_set_ne_ronyaet_server(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")

    async def post(self, url, **kwargs):  # noqa: ANN001
        raise httpx.ConnectError("сети нет")

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    assert await sms.poslat_kod("123456", "+77010000000") is False


async def test_krivoy_nomer_ne_otpravlyaem(monkeypatch):
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    zapisi: list = []
    _podmenit_post(monkeypatch, {"code": 0}, zapisi)
    assert await sms.poslat_kod("123456", "12345") is False
    assert zapisi == []  # до провайдера дело не дошло


async def test_tekst_vlezaet_v_odnu_sms():
    """Кириллица — 70 знаков на сообщение. Длиннее — платим дважды."""
    assert len(sms.SHABLON.format(kod="123456")) <= 70


# ------------------------------------------------- честный ответ на экране


async def test_ne_ushla_sms_znachit_no_delivery(klient, baza_conn, monkeypatch):
    """Номер верный, а код не ушёл — говорим об этом, а не «неверный номер».

    Раньше ответ был `bad-phone`, и человек чинил бы не то. С настоящим
    оператором такое случается по-настоящему.
    """
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    monkeypatch.setattr(nastroyki, "KANAL_KODOV", "auto")

    # Здесь подменяется сам отправитель, а не httpx: клиент проверок — тоже
    # httpx, и заглушка на нём перехватила бы наш собственный запрос.
    async def ne_ushlo(kod: str, telefon: str) -> bool:
        return False

    monkeypatch.setattr(sms, "poslat_kod", ne_ushlo)

    telefon = "+77015555555"
    await zavesti_cheloveka(baza_conn, telefon)
    otvet = await klient.post("/api/auth/start", json={"phone": telefon})
    assert otvet.json() == {"ok": False, "reason": "no-delivery"}


async def test_zagotovka_bez_nomera_sms_ne_poluchit(monkeypatch):
    """Заготовка из таблицы заказчика без телефона: слать некуда."""
    monkeypatch.setattr(nastroyki, "MOBIZON_KLYUCH", "klyuch-dlya-proverki")
    monkeypatch.setattr(nastroyki, "KANAL_KODOV", "auto")
    assert await vhod.poslat("123456", None, "метка") is False
