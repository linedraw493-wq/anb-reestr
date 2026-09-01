"""Настройки из окружения. Значений здесь нет никогда — только имена."""

import os
from pathlib import Path

KOREN = Path(__file__).resolve().parents[1]

BAZA = os.environ.get("DATABASE_URL", "postgresql://reestr:reestr@localhost:55432/reestr")

# Коды входа временно уходят в Telegram-бота: все в один чат владельца.
# Бот не умеет писать первым по нику или номеру — только тому, кто сам ему
# написал. Слово владельца 02.09.2026.
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT = os.environ.get("TELEGRAM_CODE_CHAT_ID", "")

# Соль для отпечатков кодов и сессий. Меняешь — все входы и коды гаснут.
SOL = os.environ.get("OTP_SECRET", "razrabotka-ne-dlya-boya")

# На бою cookie только по https. Локально по http её иначе не поставить.
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") != "0"

ZHIZN_KODA_MIN = 5
POPYTOK_NA_KOD = 5
POVTOR_CHEREZ_SEK = 60
ZHIZN_SESSII_DNEY = 60  # слово владельца 02.09.2026
ZHIZN_PRIGLASHENIYA_DNEY = 30

# Куда положены собранные страницы. Одна служба: сервер отдаёт и то и другое.
STATIKA = Path(os.environ.get("STATIC_DIR", KOREN.parent / "web" / "dist"))

# Картинки ужимаем при загрузке — иначе база распухнет на скринах с телефонов.
KARTINKA_MAX_STORONA = 1200
KARTINKA_KACHESTVO = 82
KARTINKA_MAX_BAYT = 12 * 1024 * 1024

MAX_TEMATIK = 3
