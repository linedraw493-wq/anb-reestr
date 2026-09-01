#!/usr/bin/env bash
# Остановить стенд. База переживает — данные на её диске.
for port in 8000 5173; do
  PID=$(netstat -ano 2>/dev/null | grep "127.0.0.1:$port" | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$PID" ] && powershell -NoProfile -Command "Stop-Process -Id $PID -Force" 2>/dev/null \
    && echo "порт $port освобождён"
done
docker stop anb-db >/dev/null 2>&1 && echo "база остановлена"
