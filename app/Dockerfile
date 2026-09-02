# Одна служба: собираем экраны, потом их же отдаёт питон-сервер.
# Решение 01.09.2026 — так проще деплой и не надо возиться с разрешениями
# между доменами.

# ---------------------------------------------------------------- экраны
FROM node:24-alpine AS web

WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
# На бою всё живое: и приглашения, и карточки, и каталог идут в базу.
ENV VITE_API=live
RUN npx vite build

# ---------------------------------------------------------------- сервер
FROM python:3.12-slim AS server

# Pillow ужимает скрины — ему нужны системные библиотеки для jpeg и png
RUN apt-get update \
 && apt-get install -y --no-install-recommends libjpeg62-turbo zlib1g \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY api/app ./app
COPY api/migrations ./migrations
COPY --from=web /web/dist ./static

# Миграции накатываются сами при старте — отдельного шага не нужно.
ENV STATIC_DIR=/app/static \
    PYTHONUNBUFFERED=1 \
    COOKIE_SECURE=1

# Render сам подставляет PORT; локально по умолчанию 8000.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
