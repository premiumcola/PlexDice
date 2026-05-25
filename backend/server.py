"""PlexDice Flask app: API blueprints + SPA static hosting."""
from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from flask import Flask, request, send_from_directory

load_dotenv()

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("plexdice")

STATIC_DIR = os.environ.get(
    "STATIC_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static"),
)

# Imported after logging/env are configured (registers blueprints + builds singletons).
from routes import register_routes  # noqa: E402

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
register_routes(app)
logger.info("PlexDice started — serving static from %s", STATIC_DIR)


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(404)
def spa_fallback(_err):
    """Unknown non-API paths fall back to the SPA's index.html."""
    if request.path.startswith("/api/"):
        return {"error": "not found"}, 404
    index_path = os.path.join(app.static_folder, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(app.static_folder, "index.html")
    return {"error": "frontend not built"}, 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
