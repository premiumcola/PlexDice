"""User-triggered cache maintenance (from the Settings › Allgemein tab)."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify

from routes.movie_info import clear_cache as _clear_movie_info_cache

logger = logging.getLogger(__name__)
bp = Blueprint("cache", __name__, url_prefix="/api/cache")


@bp.post("/ai/clear")
def clear_ai():
    """Wipe the keyless movie-info (AI-plot) cache back to empty."""
    count = _clear_movie_info_cache()
    logger.info("AI cache cleared by user")
    return jsonify({"ok": True, "cleared": count})
