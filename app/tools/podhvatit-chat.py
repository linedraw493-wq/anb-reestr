"""Подхватить номер чата у бота и вписать его в app/.env.

Зачем: бот Telegram не умеет писать первым — только тому, кто сам ему
написал. Как только владелец нажал Start у бота, этот скрипт находит номер
чата и дописывает его в настройки. Больше ничего не делает.

    py app/tools/podhvatit-chat.py            — найти и вписать
    py app/tools/podhvatit-chat.py --proba    — то же плюс тестовый код в чат

Токен читается из app/.env и на экран не выводится.
"""
import argparse
import json
import random
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / ".env"

# Консоль Windows по умолчанию не в utf-8 — кириллица иначе выходит кашей.
for potok in (sys.stdout, sys.stderr):
    try:
        potok.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass


def chitat_env() -> dict[str, str]:
    if not ENV.exists():
        sys.exit(f"Нет {ENV}")
    data: dict[str, str] = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip("'\"")
    return data


def zapisat_env(kluch: str, znachenie: str) -> None:
    stroki = ENV.read_text(encoding="utf-8").splitlines()
    nashli = False
    for i, line in enumerate(stroki):
        if line.strip().startswith(f"{kluch}="):
            stroki[i] = f"{kluch}={znachenie}"
            nashli = True
            break
    if not nashli:
        stroki.append(f"{kluch}={znachenie}")
    ENV.write_text("\n".join(stroki) + "\n", encoding="utf-8")


def api(token: str, metod: str, **params):
    url = f"https://api.telegram.org/bot{token}/{metod}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.load(r)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--proba", action="store_true", help="отправить тестовый код")
    args = parser.parse_args()

    env = chitat_env()
    token = env.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        sys.exit("В app/.env нет TELEGRAM_BOT_TOKEN")

    kto = api(token, "getMe")
    if not kto.get("ok"):
        sys.exit(f"Токен не принят: {kto}")
    print(f"бот: @{kto['result']['username']}")

    obnovleniya = api(token, "getUpdates", timeout=0)
    chaty: dict[int, str] = {}
    for u in obnovleniya.get("result", []):
        soobshchenie = u.get("message") or u.get("my_chat_member") or u.get("channel_post") or {}
        chat = soobshchenie.get("chat")
        if chat:
            imya = chat.get("title") or chat.get("username") or chat.get("first_name") or "?"
            chaty[chat["id"]] = f"{chat.get('type')} · {imya}"

    if not chaty:
        sys.exit(
            "Бот пока никого не видел.\n"
            f"Откройте @{kto['result']['username']} в Telegram и нажмите Start,\n"
            "потом запустите этот скрипт ещё раз."
        )

    print("нашли чаты:")
    for cid, opisanie in chaty.items():
        print(f"  {cid} — {opisanie}")

    cid = next(iter(chaty))
    zapisat_env("TELEGRAM_CODE_CHAT_ID", str(cid))
    print(f"вписали в app/.env: TELEGRAM_CODE_CHAT_ID={cid}")

    if args.proba:
        kod = f"{random.randint(0, 999999):06d}"
        otvet = api(
            token,
            "sendMessage",
            chat_id=cid,
            text=f"Проба связи. Код входа в реестр: {kod}",
        )
        print("проба отправлена" if otvet.get("ok") else f"проба не ушла: {otvet}")


if __name__ == "__main__":
    main()
