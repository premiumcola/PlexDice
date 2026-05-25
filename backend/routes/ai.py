"""AI plot enrichment endpoint with a 24h on-disk cache."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any, Dict

from flask import Blueprint, jsonify, request

import ai_enrich
from services import AI_CACHE_PATH, settings_store

logger = logging.getLogger(__name__)
bp = Blueprint("ai", __name__, url_prefix="/api/ai")

_TTL_SECONDS = 24 * 3600
_lock = threading.Lock()


def _load_cache() -> Dict[str, Any]:
    if not os.path.exists(AI_CACHE_PATH):
        return {}
    try:
        with open(AI_CACHE_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _save_cache(cache: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(AI_CACHE_PATH), exist_ok=True)
    with open(AI_CACHE_PATH, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False)


@bp.post("/plot")
def plot():
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title required"}), 400
    if not settings_store.get("ai").get("enabled", True):
        return jsonify({"plot": "", "lohnt": "", "crew": "", "disabled": True})

    original_title = (body.get("original_title") or "").strip()
    year = body.get("year")
    cache_key = f"{title}|{original_title}|{year}"

    with _lock:
        entry = _load_cache().get(cache_key)
        if entry and (time.time() - entry.get("ts", 0)) < _TTL_SECONDS:
            return jsonify(entry["data"])

    result = ai_enrich.synopsis(title, year, original_title)

    if not result.get("disabled") and not result.get("error"):
        with _lock:
            cache = _load_cache()
            cache[cache_key] = {"ts": time.time(), "data": result}
            _save_cache(cache)
    return jsonify(result)
