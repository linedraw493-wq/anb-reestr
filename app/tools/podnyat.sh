#!/usr/bin/env bash
# Поднять весь стенд разом: база, сервер, экраны.
#   bash app/tools/podnyat.sh
# Останов — app/tools/opustit.sh
set -u
KOREN=/c/bloggers/app
SCRATCH="${TEMP:-/tmp}/anb"
mkdir -p "$SCRATCH"

# Порт базы. По умолчанию 55432. Windows иногда запирает случайный кусок
# портов под себя (Hyper-V), и тогда docker не встаёт на 55432: «bind: An
# attempt was made to access a socket in a way forbidden». Запертые куски
# видно так:  netsh interface ipv4 show excludedportrange protocol=tcp
# Лечится перезапуском службы winnat (нужны права админа) или своим портом:
#   ANB_DB_PORT=55632 bash app/tools/podnyat.sh
PORT="${ANB_DB_PORT:-55432}"
IMYA=anb-db
[ "$PORT" = "55432" ] || IMYA="anb-db-$PORT"

echo "1/3 база…"
docker start "$IMYA" >/dev/null 2>&1 || docker run -d --name "$IMYA" \
  -e POSTGRES_USER=reestr -e POSTGRES_PASSWORD=reestr -e POSTGRES_DB=reestr \
  -p "$PORT:5432" postgres:17-alpine >/dev/null
for i in $(seq 1 20); do
  docker exec "$IMYA" pg_isready -U reestr >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$IMYA" pg_isready -U reestr >/dev/null 2>&1 \
  && echo "    postgres на $PORT" || { echo "    база не поднялась"; exit 1; }

echo "2/3 сервер…"
znach() { grep "^$1=" "$KOREN/.env" | cut -d= -f2-; }
export DATABASE_URL="postgresql://reestr:reestr@localhost:$PORT/reestr"
export TELEGRAM_BOT_TOKEN="$(znach TELEGRAM_BOT_TOKEN)"
export TELEGRAM_CODE_CHAT_ID="$(znach TELEGRAM_CODE_CHAT_ID)"
export OTP_SECRET="$(znach OTP_SECRET)"
export MASTER_KOD="$(znach MASTER_KOD)"
export ADMIN_TELEFONY="$(znach ADMIN_TELEFONY)"
export ADMIN_LOGIN="$(znach ADMIN_LOGIN)"
export ADMIN_PAROL="$(znach ADMIN_PAROL)"
export ANTHROPIC_API_KEY="$(znach ANTHROPIC_API_KEY)"
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
