"""Скрин статистики: сверка цифр и правило «спорный — на ручную сверку».

Саму модель здесь не дёргаем: это деньги и сеть, а проверять надо не её, а
наше правило поверх неё. Отчёт кладётся в базу таким, каким его кладёт
чтение, и дальше проверяется поведение сервера.
"""

import json

from app import chtenie, nastroyki

from .conftest import otkryt_sessiyu, zavesti_cheloveka, zavesti_kartochku


async def _polozhit_skrin(conn, kartochka_id: int, otchet: dict | None) -> None:
    kartinka_id = await conn.fetchval(
        "insert into kartinki (vid, tip, bayty, razmer) values ('skrin','image/jpeg',$1,$2)"
        " returning id",
        b"ne-nastoyashchaya-kartinka",
        26,
    )
    await conn.execute(
        "insert into skriny (kartochka_id, kartinka_id, otchet_ii) values ($1,$2,$3)",
        kartochka_id,
        kartinka_id,
        json.dumps(otchet, ensure_ascii=False) if otchet is not None else None,
    )


def _otchet(podpischiki=12500, ohvat=4300, tochnost=0.93) -> dict:
    return {
        "eto_statistika": True,
        "set": "instagram",
        "podpischiki": podpischiki,
        "ohvat": ohvat,
        "pokazy": None,
        "period_ohvata": "30 дней",
        "nik_viden": True,
        "data_vidna": True,
        "tochnost": tochnost,
        "zamechaniya": [],
    }


# ------------------------------------------------------------------ сверка цифр


def test_blizkie_cifry_schitayutsya_sovpavshimi():
    # статистика живая, за сутки цифра шевелится сама — 2% это совпадение
    assert chtenie.sovpalo(_otchet(podpischiki=12500), 12300, None) is True


def test_raskhozhdenie_v_razy_ne_sovpadenie():
    assert chtenie.sovpalo(_otchet(podpischiki=12500), 90000, None) is False


def test_bez_otcheta_nichego_ne_sverili():
    assert chtenie.sovpalo(None, 12500, 4300) is False


# ----------------------------------------------- спорный скрин уходит модератору


async def test_spornyy_skrin_uvodit_kartochku_na_proverku(klient, baza_conn, monkeypatch):
    monkeypatch.setattr(chtenie, "vklyucheno", lambda: True)

    kto = await zavesti_cheloveka(baza_conn, "+77030000001")
    kid = await zavesti_kartochku(baza_conn, kto, "@spornyy", None, status="draft")
    await _polozhit_skrin(baza_conn, kid, _otchet(podpischiki=12500))
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, kto))

    # в карточке 90 000, на скрине 12 500 — расхождение в семь раз
    otvet = await klient.post(
        "/api/card",
        json={"nick": "@spornyy", "followers": "90000", "reach": "", "istochnik": "screen"},
    )
    assert otvet.json()["ok"] is True
    status = await baza_conn.fetchval("select status from kartochki where id = $1", kid)
    assert status == "moderation"
    klient.cookies.clear()


async def test_chestnye_cifry_publikuyutsya_srazu(klient, baza_conn, monkeypatch):
    monkeypatch.setattr(chtenie, "vklyucheno", lambda: True)

    kto = await zavesti_cheloveka(baza_conn, "+77030000002")
    kid = await zavesti_kartochku(baza_conn, kto, "@chestnyy", None, status="draft")
    await _polozhit_skrin(baza_conn, kid, _otchet(podpischiki=12500))
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, kto))

    otvet = await klient.post(
        "/api/card",
        json={"nick": "@chestnyy", "followers": "12500", "reach": "", "istochnik": "screen"},
    )
    assert otvet.json()["status"] == "published"
    klient.cookies.clear()


async def test_neuverennoe_chtenie_tozhe_spornoe(klient, baza_conn, monkeypatch):
    monkeypatch.setattr(chtenie, "vklyucheno", lambda: True)

    kto = await zavesti_cheloveka(baza_conn, "+77030000003")
    kid = await zavesti_kartochku(baza_conn, kto, "@razmyto", None, status="draft")
    # цифры те же, но модель сама говорит, что читала плохо
    await _polozhit_skrin(baza_conn, kid, _otchet(podpischiki=12500, tochnost=0.2))
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, kto))

    await klient.post(
        "/api/card",
        json={"nick": "@razmyto", "followers": "12500", "reach": "", "istochnik": "screen"},
    )
    status = await baza_conn.fetchval("select status from kartochki where id = $1", kid)
    assert status == "moderation"
    klient.cookies.clear()


async def test_pri_vyklyuchennom_chtenii_vsyo_kak_ranshe(klient, baza_conn):
    """Ключа нет — судить о «нечитаемом» некому, старый порядок не ломаем."""
    assert not chtenie.vklyucheno()  # в проверках ключ пуст

    kto = await zavesti_cheloveka(baza_conn, "+77030000004")
    kid = await zavesti_kartochku(baza_conn, kto, "@bez_klyucha", None, status="draft")
    await _polozhit_skrin(baza_conn, kid, _otchet(podpischiki=12500))
    klient.cookies.set("sessiya", await otkryt_sessiyu(baza_conn, kto))

    await klient.post(
        "/api/card",
        json={"nick": "@bez_klyucha", "followers": "90000", "reach": "", "istochnik": "words"},
    )
    status = await baza_conn.fetchval("select status from kartochki where id = $1", kid)
    assert status == "published"
    klient.cookies.clear()


async def test_zagruzka_skrina_gostyu_zakryta(klient):
    klient.cookies.clear()
    otvet = await klient.post(
        "/api/card/screenshot", files={"file": ("s.jpg", b"1234", "image/jpeg")}
    )
    assert otvet.status_code == 403


def test_porog_tochnosti_zadan_nastroykoy():
    # цифра живёт в настройках, а не в коде — чтобы менять без правки кода
    assert 0 < nastroyki.POROG_TOCHNOSTI <= 1
