# ---- Stage 1: build frontend ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: python runtime ----
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./static

EXPOSE 8080

# 1 worker, 4 threads — single-user app; one worker keeps in-memory quiz sessions
# and the background cast-enrichment thread coherent. Generous timeout for Plex syncs.
CMD ["gunicorn", "--chdir", "backend", "--bind", "0.0.0.0:8080", \
     "--workers", "1", "--threads", "4", "--timeout", "180", "server:app"]
