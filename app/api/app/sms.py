"""Отправка кода настоящей SMS. Провайдер — Mobizon.kz.

Слово владельца 06.09.2026: «давай Mobizone делать». Разбор, почему именно
он и что это стоит, — в `../../sms-provaydery.md`.

Коротко оттуда: начать можно **без своего имени отправителя** — на общей
подписи провайдера (`MOBIZON_PODPIS` пусто). Тогда SMS приходит от чего-то
вроде `MOBINFO`, документы и тридцать рабочих дней ожидания не нужны, и
стоит это 16,60–19,60 ₸ за сообщение.

⚠️ **У общей подписи нет Beeline.** Абонентам Beeline SMS не дойдёт вовсе,
пока не зарегистрирована своя подпись (это отдельная абонплата у оператора).
Провайдер вернёт ошибку, мы честно ответим «не смогли отправить», и админ
выдаст такому человеку резервный код из админки. Так и задумано: молча
делать вид, что код ушёл, — хуже всего.

Что меняется, когда своя подпись появится: заполняется `MOBIZON_PODPIS`.
Код не трогается.
"""

import logging

import httpx

from . import nastroyki

log = logging.getLogger("reestr.sms")

# Кириллица в SMS — 70 знаков на одно сообщение, дальше цена умножается.
# Текст ниже короче: платим за одно.
SHABLON = "Код {kod} — вход в реестр блогеров. Никому не говорите."


def vklyucheno() -> bool:
    return bool(nastroyki.MOBIZON_KLYUCH)


def _nomer(telefon: str) -> str:
    """+7 705 281 93 42 → 77052819342. Mobizon ждёт цифры без плюса."""
    return "".join(ch for ch in telefon if ch.isdigit())


async def poslat_kod(kod: str, telefon: str) -> bool:
    """Послать код на номер. True — провайдер принял сообщение.

    «Принял» не равно «человек получил»: доставка идёт секунды, и статус
    приходит отдельным запросом. Ждать его на входе нельзя — человек стоит
    перед экраном. Если сообщение не дойдёт, у админа есть резервный код.
    """
    if not vklyucheno():
        log.warning("Mobizon не настроен — SMS не отправлена")
        return False

    nomer = _nomer(telefon or "")
    if len(nomer) != 11:
        log.warning("номер не похож на казахстанский, SMS не отправлена")
        return False

    telo = {
        "recipient": nomer,
        "text": SHABLON.format(kod=kod),
        "apiKey": nastroyki.MOBIZON_KLYUCH,
    }
    # Пусто — общая подпись провайдера. Своя ставится только после
    # регистрации у оператора, иначе провайдер отобьёт сообщение.
    if nastroyki.MOBIZON_PODPIS:
        telo["from"] = nastroyki.MOBIZON_PODPIS

    try:
        async with httpx.AsyncClient(timeout=15) as klient:
            otvet = await klient.post(
                f"{nastroyki.MOBIZON_ADRES}/service/message/sendsmsmessage",
                data=telo,
            )
        dannye = otvet.json()
    except Exception:
        # Сеть, таймаут, не-JSON в ответе — всё это «не отправили».
        # Падать нельзя: человек стоит на экране входа.
        log.exception("не смогли отправить SMS через Mobizon")
        return False

    # У Mobizon 0 значит «принято», всё остальное — беда. Ни кода, ни номера
    # в лог не пишем: код это секрет, номер это личные данные.
    if dannye.get("code") == 0:
        return True
    log.warning(
        "Mobizon отказал: code=%s message=%s", dannye.get("code"), dannye.get("message")
    )
    return False


async def ostatok() -> float | None:
    """Сколько денег на счету у провайдера. None — не спросили.

    Нужно затем, чтобы деньги кончались не молча: пустой счёт выглядит
    точно так же, как поломка, и разбираться в этом посреди регистрации
    блогеров — плохое время.
    """
    if not vklyucheno():
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as klient:
            otvet = await klient.post(
                f"{nastroyki.MOBIZON_ADRES}/service/user/getownbalance",
                data={"apiKey": nastroyki.MOBIZON_KLYUCH},
            )
        dannye = otvet.json()
        if dannye.get("code") != 0:
            return None
        return float(dannye["data"]["balance"])
    except Exception:
        log.exception("не смогли спросить остаток у Mobizon")
        return None
