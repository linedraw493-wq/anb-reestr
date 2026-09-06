"""Отправка кода настоящей SMS. Провайдер — Mobizon.kz.

Слово владельца 06.09.2026: «давай Mobizone делать». Разбор, почему именно
он и что это стоит, — в `../../sms-provaydery.md`.

Коротко оттуда: начать можно **без своего имени отправителя** — на общей
подписи провайдера (`MOBIZON_PODPIS` пусто). Тогда SMS приходит от чего-то
вроде `MOBINFO`, документы и тридцать рабочих дней ожидания не нужны, и
стоит это 16,60–19,60 ₸ за сообщение.

⚠️ **У общей подписи нет Beeline.** Проверено вживую 06.09.2026: на номер
`+7 705…` провайдер отвечает «Для данного направления отсутствует
возможность отправки SMS», денег не берёт. На номер Kcell та же отправка
уходит и доходит: в кабинете провайдера статус «Доставлено», 16,60 ₸.

Абонентам Beeline SMS не дойдёт, пока не зарегистрирована своя подпись.
Мы честно отвечаем «не смогли отправить», и админ выдаёт такому человеку
резервный код из админки. Молча делать вид, что код ушёл, — хуже всего.

Номера по операторам (DEF-коды Казахстана):
  Beeline — 705, 771, 776, 777   ← этим сейчас не дойдёт
  Kcell / Activ — 701, 702, 775, 778
  Tele2 / Altel — 700, 707, 708, 747

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


# DEF-коды Beeline Казахстана. На общей подписи провайдера туда не доходит.
BEELINE = ("705", "771", "776", "777")


def pohozhe_beeline(telefon: str | None) -> bool:
    """Похож ли номер на Beeline — по коду оператора.

    Слово владельца 06.09.2026: «пока без билайна» — свою подпись не
    регистрируем. Значит этим людям код не придёт, и админ должен видеть их
    заранее, а не узнавать из жалобы.

    Именно «похоже»: в Казахстане номер можно перенести к другому оператору
    вместе с кодом. Поэтому по этому признаку мы ничего не запрещаем — он
    только подсказка человеку в админке. Кто на самом деле не принял, знает
    провайдер, и его отказ мы разбираем отдельно.
    """
    if not vklyucheno() or nastroyki.MOBIZON_PODPIS:
        # Своя подпись есть — Beeline доступен, подсказка не нужна.
        return False
    cifry = "".join(ch for ch in str(telefon or "") if ch.isdigit())
    return len(cifry) == 11 and cifry[1:4] in BEELINE


def _nomer(telefon: str) -> str:
    """+7 701 000 00 00 → 77010000000. Mobizon ждёт цифры без плюса."""
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
        # Номер сообщения у провайдера — единственная ниточка от нашей
        # попытки к его записи в «Истории SMS», где видно «Доставлено».
        # Личных данных в нём нет, поэтому в лог его можно.
        nomer_soobshcheniya = (dannye.get("data") or {}).get("messageId")
        log.info("SMS принята провайдером, messageId=%s", nomer_soobshcheniya)
        return True
    # Причина лежит не в message (там общая фраза «неправильно введены
    # данные»), а в data, по полям. Без неё разбираться невозможно: на
    # номере Beeline провайдер отвечает «для данного направления отправка
    # недоступна» — и это не поломка, а общая подпись без Beeline.
    log.warning(
        "Mobizon отказал: code=%s %s | %s",
        dannye.get("code"),
        dannye.get("message"),
        dannye.get("data"),
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
