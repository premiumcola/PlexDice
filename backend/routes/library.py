"""Library endpoints: cached movies, refresh, and a Plex thumbnail proxy."""
from __future__ import annotations

import logging
from urllib.parse import urljoin

import requests
from flask import Blueprint, Response, jsonify, request

from services import library_cache, plex_client, settings_store

logger = logging.getLogger(__name__)
bp = Blueprint("library", __name__, url_prefix="/api/library")

_THUMB_TIMEOUT = 15


@bp.get("")
def get_library():
    """Return cached movies; refresh once on-demand if the cache is empty."""
    movies = library_cache.movies()
    if not movies and settings_store.get("plex").get("token"):
        try:
            library_cache.refresh(plex_client, settings_store)
            movies = library_cache.movies()
            library_cache.start_cast_enrichment(plex_client, settings_store)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Auto-refresh on empty library failed: %s", exc)
    return jsonify(
        {
            "movies": movies,
            "refreshed_at": library_cache.refreshed_at(),
            **library_cache.status(),
        }
    )


@bp.post("/refresh")
def refresh_library():
    try:
        result = library_cache.refresh(plex_client, settings_store)
        library_cache.start_cast_enrichment(plex_client, settings_store)
        return jsonify({"ok": True, **result})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        logger.exception("Library refresh failed")
        return jsonify({"ok": False, "error": str(exc)}), 502


@bp.get("/thumb/<rating_key>")
def thumb(rating_key: str):
    """Proxy a Plex poster/art so the Plex token never reaches the browser."""
    movie = library_cache.find(rating_key)
    if not movie:
        return jsonify({"error": "not found"}), 404
    path = movie.get("_art") if request.args.get("art") else movie.get("_thumb")
    if not path:
        return jsonify({"error": "no image"}), 404

    plex = settings_store.get("plex")
    url, token = plex.get("url"), plex.get("token")
    if not url or not token:
        return jsonify({"error": "plex not configured"}), 400

    target = urljoin(url.rstrip("/") + "/", path.lstrip("/"))
    try:
        upstream = requests.get(
            target, params={"X-Plex-Token": token}, timeout=_THUMB_TIMEOUT, verify=False
        )
    except requests.RequestException as exc:
        logger.warning("Thumb proxy request failed: %s", exc)
        return jsonify({"error": "upstream error"}), 502

    if upstream.status_code != 200:
        return jsonify({"error": "upstream status"}), upstream.status_code
    return Response(
        upstream.content,
        content_type=upstream.headers.get("Content-Type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
