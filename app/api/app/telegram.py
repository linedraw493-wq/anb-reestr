"""Отправка кода через Telegram-бота.

Временная замена SMS-оператору, слово владельца 02.09.2026. Все коды падают
в один чат владельца — иначе нельзя: бот Telegram не умеет писать первым ни
по нику, ни по номеру, только тому, кто сам ему написал.

Когда появится настоящий оператор — меняется только этот файл.
"""

import logging

import httpx

from . import nastroyki

log = logging.getLogger("reestr.telegram")


async def poslat_kod(kod: str, metka: str) -> bool:
    """metka — чей это код, чтобы владелец понимал, кому его передать."""
    if not nastroyki.TELEGRAM_TOKEN or not nastroyki.TELEGRAM_CHAT:
        log.warning("Telegram не настроен — код %s никуда не ушёл", "*" * len(kod))
        return False

    url = f"https://api.telegram.org/bot{nastroyki.TELEGRAM_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as klient:
            otvet = await klient.post(
                url,
                json={
                    "chat_id": nastroyki.TELEGRAM_CHAT,
                    "text": f"Реестр блогеров · {metka}\nКод входа: {kod}",
                },
            )
        return otvet.json().get("ok", False)
    except Exception:
        log.exception("не смогли отправить код в Telegram")
        return False
