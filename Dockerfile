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

# 2 workers, 2 threads — plenty for a single-user picker; long Plex syncs get a generous timeout
CMD ["gunicorn", "--chdir", "backend", "--bind", "0.0.0.0:8080", \
     "--workers", "2", "--threads", "2", "--timeout", "180", "server:app"]
