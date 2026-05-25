# PlexDice

A web app that picks random movies from a Plex library based on
configurable filters (genre, year, runtime, FSK, rating).
PWA-installable on iOS/Android home screen. Talks to Plex live via API.

**Repo:** github.com/premiumcola/PlexDice (private)
**Working dir:** D:\CLAUDE_code\PlexDice (Windows host, WSL access via /mnt/d/CLAUDE_code/PlexDice)
**Container port:** 8090 (8099 is taken by tam-spy)

## Stack

- Backend: Python 3.11 + Flask + python-plexapi + Anthropic SDK
- Frontend: Vite + React + Tailwind, served as static via Flask in prod
- Storage: JSON files in /data (settings.json, library_cache.json, ai_cache.json)
- Runtime: Docker (multi-stage build), local dev + Unraid deploy

## Behavior

- Work fully autonomous, no clarifying questions
- On ambiguity: pick the most sensible solution and proceed
- After each task: short summary of what was done
- If something fails: try to fix yourself 2x; after 3 failures stop and explain

## Git — after each completed task, immediately

```
Set-Location D:\CLAUDE_code\PlexDice   (or cd /mnt/d/CLAUDE_code/PlexDice in WSL)
git add .
git commit -m "feat/fix: short description"
git push origin main
```

- Never combine `cd && git` — always separate commands
- Commit messages in English, max 60 chars
- One commit per task, not bundled

## Code Quality

- No unused variables, no dead code
- Don't write a function twice — search first
- Python: no `print()`, only `logging`
- JavaScript: no `console.log()` in production code
- Type hints on Python function signatures

## Design Principles

- Less text, more icons
- Classic, sophisticated, modern — no colorful chaos
- No duplications — show each info once
- Buttons: never dark-on-dark, always readable
- No thin border lines — depth through color contrast
- Rounded corners everywhere (min 8px)
- Info inline with element — no separate info pane next to it
- Mobile-first: must look good on iPhone (393px viewport)
- Accent color: `#f5a623` (PlexDice orange)
- Background: `zinc-950` (#09090b), surfaces `zinc-900` (#18181b)

## Docker

- After all changes: `docker compose up --build -d`
- Check `docker logs plexdice --tail 50`
- Done only when no errors in logs

## Repo structure (target)

```
plexdice/
├── docker-compose.yml
├── Dockerfile              # multi-stage: node build + python runtime
├── .env.example
├── CLAUDE.md               # this file
├── README.md
├── backend/
│   ├── server.py
│   ├── settings.py
│   ├── plex_client.py
│   ├── library_cache.py
│   ├── ai_enrich.py
│   └── routes/
└── frontend/
    ├── src/
    │   ├── pages/Dice.jsx       # ported from reference/filmwuerfel-original.jsx
    │   └── pages/Settings.jsx   # Seerr-style, see reference/seerr-settings.png
    └── public/                  # manifest.json, service-worker.js, icons/
```

## Reference files

- `reference/filmwuerfel-original.jsx` — UI vorlage for Dice page
- `reference/seerr-settings.png` — design vorlage for Settings page

Both must be read at the start of any task that touches the UI.
