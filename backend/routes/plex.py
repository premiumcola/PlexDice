"""Plex helper endpoints: actor-thumbnail proxy (token stays server-side)."""
from __future__ import annotations

import logging
from urllib.parse import urljoin

import requests
from flask import Blueprint, Response, jsonify

from services import library_cache, plex_client, settings_store

logger = logging.getLogger(__name__)
bp = Blueprint("plex", __name__, url_prefix="/api/plex")

_THUMB_TIMEOUT = 15


@bp.get("/connection-info")
def connection_info():
    """Active Plex connection: manual override vs auto-discovery, the base URL in use
    (never the token), and a quick reachability probe."""
    plex = settings_store.get("plex")
    manual = (plex.get("plex_server_url") or "").strip()
    url = manual or (plex.get("url") or "")
    mode = "manual" if manual else "auto"
    reachable = False
    if url and plex.get("token"):
        try:
            plex_client.connect_from_settings(plex, timeout=5)
            reachable = True
        except Exception as exc:  # noqa: BLE001 — unreachable is a normal, reported state
            logger.info("connection-info: Plex unreachable (%s)", exc)
    return jsonify({"mode": mode, "url": url, "reachable": reachable})


@bp.get("/thumb/<kind>/<key>")
def person_thumb(kind: str, key: str):
    """Proxy a Plex actor/crew portrait. ``key`` resolves to a raw thumb that may be a
    server-relative path (needs the token) or a full plex.tv static URL. ``kind`` is
    ``actor`` or ``crew`` — both share one key space."""
    raw = library_cache.person_thumb_raw(key)
    if not raw:
        return jsonify({"error": "not found"}), 404

    plex = settings_store.get("plex")
    url, token = plex.get("url"), plex.get("token")
    try:
        if raw.startswith("http://") or raw.startswith("https://"):
            upstream = requests.get(raw, timeout=_THUMB_TIMEOUT, verify=False)
        else:
            if not url or not token:
                return jsonify({"error": "plex not configured"}), 400
            target = urljoin(url.rstrip("/") + "/", raw.lstrip("/"))
            upstream = requests.get(
                target, params={"X-Plex-Token": token}, timeout=_THUMB_TIMEOUT, verify=False
            )
    except requests.RequestException as exc:
        logger.warning("Actor thumb proxy failed: %s", exc)
        return jsonify({"error": "upstream error"}), 502

    if upstream.status_code != 200:
        return jsonify({"error": "upstream status"}), upstream.status_code
    return Response(
        upstream.content,
        content_type=upstream.headers.get("Content-Type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
