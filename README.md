# Plex Quiz & Dice 🎲🎯

Plex Quiz & Dice has two modes built on your Plex library: a **Würfeln** dice
roller that picks a random movie from filters you control — genre, year,
runtime, FSK and rating — with a slot-machine roll and one-tap deep links to
play it in Plex; and a **Quiz** game mode (cover→title, actor→movie,
movie→actor, plot→movie) with rounds, scoreboard and group photos. It's a PWA,
so you can install it on your iPhone or Android home screen. The catalog is
fetched live from your Plex server via API.

(The repo, Docker container and `/data` layout keep the original `plexdice`
name — only the display name changed.)

## Quick start (local, Docker)

```bash
cp .env.example .env          # optional: pre-fill PLEX_URL/PLEX_TOKEN
docker compose up --build -d
docker logs plexdice --tail 50
```

Then open <http://localhost:8090> and go to **Einstellungen → Plex**:

1. Paste your **Plex token** and tap the server button to load your servers.
2. Pick a server (host/port/SSL auto-fill), tap **Verbindung testen**, then **Speichern**.
3. Switch to **Bibliotheken**, select your movie libraries, and tap
   **Bibliotheken synchronisieren**.
4. Go back to **Würfeln** and roll. 🎬

You can also pre-seed the connection by filling `PLEX_URL` and `PLEX_TOKEN`
in `.env` before the first start — the settings page works either way.

### Movie info (keyless)

The "Erzähl mir was über den Film" button needs **no API key**. It builds real
facts (director, cast, writers, studio, country, collection, tagline, rating…)
from the cached Plex metadata, and crawls a synopsis from German Wikipedia's
public REST API per movie. Results are cached in `data/movie_info_cache.json`
for 24h.

## Quick start (Unraid)

_Placeholder._ Add the PlexDice container via Community Apps / a custom
template: image built from this repo, host port **8090 → 8080**, and map a
host path to **/data** for persistent settings + cache. Provide `PLEX_URL`
and `PLEX_TOKEN` as container variables.

## Getting your Plex token

See Plex's official guide:
<https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/>

The token is stored only in `data/settings.json` on the server and is never
returned to the browser (the GET `/api/settings` response redacts it, and Plex
thumbnails are proxied through the backend so the token never leaves it).

## How it works

- **Backend** — Python 3.11 + Flask + [python-plexapi](https://github.com/pkkid/python-plexapi),
  served by gunicorn. Stores everything as JSON in `/data`
  (`settings.json`, `library_cache.json`, `movie_info_cache.json`, quiz data).
- **Frontend** — Vite + React + Tailwind, built to static files and served by
  Flask in production (SPA fallback for client routes).
- **Docker** — multi-stage build (Node builds the frontend, Python runtime
  serves it).

### API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET  | `/api/library` | Cached movies (refresh-on-empty) |
| POST | `/api/library/refresh` | Re-sync from Plex |
| GET  | `/api/library/thumb/<key>` | Token-safe Plex poster/art proxy |
| GET/POST | `/api/settings` | Read (redacted) / save settings |
| POST | `/api/plex/discover` | List account servers from plex.tv |
| POST | `/api/plex/test` | Test a connection, list movie sections |
| POST | `/api/movie/info` | Keyless facts + Wikipedia synopsis (cached 24h) |

## Icons

App icons under `frontend/public/icons/` are pre-generated from `logo.svg`
(isometric orange die with the Plex chevron). To regenerate after editing the
SVG, render `logo.svg` to `icon-192.png`, `icon-512.png` and `icon-maskable.png`
with any SVG rasterizer (e.g. `rsvg-convert`, Inkscape, or `@resvg/resvg-js`).
