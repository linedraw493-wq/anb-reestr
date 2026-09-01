#!/usr/bin/env bash
# Поднять весь стенд разом: база, сервер, экраны.
#   bash app/tools/podnyat.sh
# Останов — app/tools/opustit.sh
set -u
KOREN=/c/bloggers/app
SCRATCH="${TEMP:-/tmp}/anb"
mkdir -p "$SCRATCH"

echo "1/3 база…"
docker start anb-db >/dev/null 2>&1 || docker run -d --name anb-db \
  -e POSTGRES_USER=reestr -e POSTGRES_PASSWORD=reestr -e POSTGRES_DB=reestr \
  -p 55432:5432 postgres:17-alpine >/dev/null
for i in $(seq 1 20); do
  docker exec anb-db pg_isready -U reestr >/dev/null 2>&1 && break
  sleep 2
done
docker exec anb-db pg_isready -U reestr >/dev/null 2>&1 \
  && echo "    postgres на 55432" || { echo "    база не поднялась"; exit 1; }

echo "2/3 сервер…"
znach() { grep "^$1=" "$KOREN/.env" | cut -d= -f2-; }
export DATABASE_URL='postgresql://reestr:reestr@localhost:55432/reestr'
export TELEGRAM_BOT_TOKEN="$(znach TELEGRAM_BOT_TOKEN)"
export TELEGRAM_CODE_CHAT_ID="$(znach TELEGRAM_CODE_CHAT_ID)"
export OTP_SECRET="$(znach OTP_SECRET)"
export COOKIE_SECURE=0
( cd "$KOREN/api" && ./.venv/Scripts/python.exe -m uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 --log-level info > "$SCRATCH/api.log" 2>&1 & )
for i in $(seq 1 20); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/spravochniki)" = "200" ] && break
  sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/spravochniki)" = "200" ] \
  && echo "    сервер на 8000" || { echo "    сервер не поднялся, лог: $SCRATCH/api.log"; exit 1; }

echo "3/3 экраны…"
( cd "$KOREN/web" && npx vite --host 127.0.0.1 --port 5173 > "$SCRATCH/vite.log" 2>&1 & )
for i in $(seq 1 20); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/)" = "200" ] && break
  sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/)" = "200" ] \
  && echo "    экраны на 5173" || { echo "    экраны не поднялись, лог: $SCRATCH/vite.log"; exit 1; }

echo
echo "готово → http://localhost:5173"
