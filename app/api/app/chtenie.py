"""Чтение скрина статистики моделью Claude.

Блогер грузит скрин из Instagram или TikTok — модель смотрит на картинку и
достаёт три цифры: подписчиков, охват и показы (спека, день 4). Дальше их
видит модератор рядом с тем, что человек вписал руками, и решает, ставить ли
пометку «со скрина — проверено». Заодно модель говорит, видно ли на кадре ник
и дату: спека требует кадр целиком, с ником и датой.

Три правила, на которых держится этот модуль:

1. **Чтение никогда не блокирует.** Нет ключа, упал интернет, модель
   отказалась — возвращаем None, и человек вводит цифры сам, как и до
   06.09.2026. Скрин при этом сохраняется всегда.
2. **Мы ничего не решаем за модератора.** Модуль не одобряет и не отклоняет:
   он говорит, что увидел, и насколько уверен. Решение — человека.
3. **Соединение с базой на время запроса не держим.** Ответ модели идёт
   секунды, а соединений к базе всего горсть (`SOEDINENIY`). Сначала
   читаем, потом пишем.

Включается ключом `ANTHROPIC_API_KEY`. Модель и глубина раздумий меняются
настройками `MODEL_CHTENIYA` и `USILIE_CHTENIYA`, код трогать не надо.
"""

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any

import anthropic

from . import nastroyki

log = logging.getLogger("reestr.chtenie")

_klient: anthropic.AsyncAnthropic | None = None

# Верхняя граница здравого смысла. Больше этого не бывает ни у кого на
# свете, значит модель ошиблась строкой или прочла номер телефона.
PREDEL = 10_000_000_000

ZADACHA = """Ты читаешь скриншот статистики блогера из соцсети (Instagram, TikTok,
YouTube, Telegram) и достаёшь оттуда цифры.

Нужны три:
- «подписчики» — сколько людей подписано на аккаунт;
- «охват» — сколько аккаунтов или людей увидели контент за период (в Instagram
  это «охваченные аккаунты», в TikTok — уникальные зрители);
- «показы» — сколько раз контент показали, с повторами (в Instagram так и
  написано «показы», в TikTok — просмотры видео). Охват и показы это разное:
  один человек может увидеть пост пять раз.

Ещё две вещи проверь и скажи честно:
- «nik_viden» — видно ли на кадре ник или имя аккаунта;
- «data_vidna» — видно ли дату или период, за который показана статистика.
Заказчик просит кадр целиком, с ником и датой: без них непонятно, чья это
статистика и за когда.

Как отвечать:
- Числа — целыми, без пробелов и сокращений. «6,3 тыс.» это 6300, «1,2 млн» это
  1200000, «27.5K» это 27500.
- Не видно цифры — ставь null. Не выдумывай и не считай в уме по графику.
- «period_ohvata» — за какой срок показан охват, словами со скрина: «7 дней»,
  «30 дней», «последние 60 дней». Не написано — null.
- «tochnost» — насколько ты уверен в прочитанном, от 0 до 1. Цифры видно чётко и
  они подписаны — ближе к 1. Мелко, размыто, подпись неоднозначная, рядом
  несколько похожих чисел — ниже 0.5.
- «zamechaniya» — короткие фразы по-русски для модератора-человека о том, что
  смутило: «охват за 7 дней, а не за 30», «скрин обрезан», «цифра подписчиков
  закрыта пальцем», «это профиль, а не статистика». Всё чисто — пустой список.
  Про ник и дату здесь не пиши: для них есть отдельные поля выше, иначе одно и
  то же скажется дважды.
- «eto_statistika» — false, если на картинке вообще не статистика соцсети:
  случайное фото, переписка, картинка из интернета.

Ты не решаешь, честный блогер или нет. Ты только читаешь, что видно."""

SHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "eto_statistika": {"type": "boolean"},
        "set": {"type": ["string", "null"]},
        "podpischiki": {"type": ["integer", "null"]},
        "ohvat": {"type": ["integer", "null"]},
        "pokazy": {"type": ["integer", "null"]},
        "period_ohvata": {"type": ["string", "null"]},
        "nik_viden": {"type": "boolean"},
        "data_vidna": {"type": "boolean"},
        "tochnost": {"type": "number"},
        "zamechaniya": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "eto_statistika",
        "set",
        "podpischiki",
        "ohvat",
        "pokazy",
        "period_ohvata",
        "nik_viden",
        "data_vidna",
        "tochnost",
        "zamechaniya",
    ],
    "additionalProperties": False,
}


def vklyucheno() -> bool:
    """Есть ключ — читаем. Нет — молча живём по-старому."""
    return bool(nastroyki.ANTHROPIC_KLYUCH)


def _klient_modeli() -> anthropic.AsyncAnthropic:
    global _klient
    if _klient is None:
        # Человек стоит у экрана и ждёт, поэтому ждать ответа бесконечно
        # нельзя: минута — и признаём, что не прочитали.
        _klient = anthropic.AsyncAnthropic(
            api_key=nastroyki.ANTHROPIC_KLYUCH,
            timeout=60.0,
            max_retries=1,
        )
    return _klient


def _chislo(znachenie: Any) -> int | None:
    """Целое из ответа модели. Мусор и небылицы отбрасываем."""
    if not isinstance(znachenie, int) or isinstance(znachenie, bool):
        return None
    if znachenie <= 0 or znachenie > PREDEL:
        return None
    return znachenie


def _otchet(
    podpischiki: int | None,
    ohvat: int | None,
    pokazy: int | None,
    set_: str | None,
    period: str | None,
    tochnost: float,
    zamechaniya: list[str],
) -> dict[str, Any]:
    return {
        "podpischiki": podpischiki,
        "ohvat": ohvat,
        "pokazy": pokazy,
        "set": set_,
        "period": period,
        "tochnost": tochnost,
        "zamechaniya": zamechaniya,
        "model": nastroyki.MODEL_CHTENIYA,
        "prochitan_v": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


async def prochitat(bayty: bytes, tip: str) -> dict[str, Any] | None:
    """Прочитать скрин. Вернуть отчёт или None, если не вышло.

    `bayty` — уже ужатая картинка, та же, что ложится в базу; `tip` — её вид,
    `image/jpeg`. Ошибки наверх не поднимаем: неудачное чтение — это не
    поломка, а обычный ход событий.
    """
    if not vklyucheno():
        return None

    kartinka = base64.standard_b64encode(bayty).decode("ascii")
    try:
        otvet = await _klient_modeli().messages.create(
            model=nastroyki.MODEL_CHTENIYA,
            max_tokens=16000,
            system=ZADACHA,
            output_config={
                "effort": nastroyki.USILIE_CHTENIYA,
                "format": {"type": "json_schema", "schema": SHEMA},
            },
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": tip,
                                "data": kartinka,
                            },
                        },
                        {"type": "text", "text": "Прочитай цифры с этого скрина."},
                    ],
                }
            ],
        )
    except anthropic.APIStatusError as oshibka:
        # Ключ протух, кончились деньги, просим слишком часто — всё сюда.
        log.warning("чтение скрина: модель ответила ошибкой %s", oshibka.status_code)
        return None
    except anthropic.APIConnectionError:
        log.warning("чтение скрина: до модели не достучались")
        return None
    except Exception:  # noqa: BLE001 — чтение не имеет права ронять загрузку
        log.exception("чтение скрина: непредвиденное")
        return None

    if otvet.stop_reason == "refusal":
        log.warning("чтение скрина: модель отказалась смотреть картинку")
        return None

    tekst = next((b.text for b in otvet.content if b.type == "text"), None)
    if not tekst:
        return None
    try:
        syroy = json.loads(tekst)
    except json.JSONDecodeError:
        log.warning("чтение скрина: ответ не разобрался как JSON")
        return None

    zamechaniya = [str(z)[:200] for z in (syroy.get("zamechaniya") or []) if str(z).strip()]
    zamechaniya = zamechaniya[:6]
    tochnost = syroy.get("tochnost")
    tochnost = float(tochnost) if isinstance(tochnost, (int, float)) else 0.0
    tochnost = min(max(tochnost, 0.0), 1.0)

    if not syroy.get("eto_statistika", True):
        # Не статистика — цифрам с такой картинки веры нет никакой.
        return _otchet(
            None,
            None,
            None,
            None,
            None,
            0.0,
            ["Это не похоже на скрин статистики"] + zamechaniya,
        )

    # Требование спеки к кадру: целиком, с ником и датой. Не выполнено —
    # говорим об этом модератору его словами, а не молчим.
    pretenzii_k_kadru = []
    if not syroy.get("nik_viden", True):
        pretenzii_k_kadru.append("На кадре не видно ника — чья это статистика, неясно")
    if not syroy.get("data_vidna", True):
        pretenzii_k_kadru.append("На кадре нет даты или периода")

    return _otchet(
        _chislo(syroy.get("podpischiki")),
        _chislo(syroy.get("ohvat")),
        _chislo(syroy.get("pokazy")),
        str(syroy["set"])[:40] if syroy.get("set") else None,
        str(syroy["period_ohvata"])[:40] if syroy.get("period_ohvata") else None,
        tochnost,
        (pretenzii_k_kadru + zamechaniya)[:8],
    )


def sovpalo(otchet: dict[str, Any] | None, podpischiki: Any, ohvat: Any) -> bool:
    """Сошлись ли прочитанные цифры с теми, что стоят в карточке.

    Считается каждый раз заново, а не хранится: человек правит карточку
    руками и после чтения, и сохранённое «сошлось» на другой день врало бы.
    Расхождение до `RASHOZHDENIE_DOLYA` считаем совпадением — статистика
    живая, за сутки цифра шевелится сама.
    """
    if not otchet:
        return False
    pary = [
        (otchet.get("podpischiki"), podpischiki),
        (otchet.get("ohvat"), ohvat),
    ]
    sverili = False
    for so_skrina, v_kartochke in pary:
        if not so_skrina or not v_kartochke:
            continue
        sverili = True
        bolshee = max(int(so_skrina), int(v_kartochke))
        if abs(int(so_skrina) - int(v_kartochke)) / bolshee > nastroyki.RASHOZHDENIE_DOLYA:
            return False
    # Сверять было нечего — не выдаём это за совпадение.
    return sverili
