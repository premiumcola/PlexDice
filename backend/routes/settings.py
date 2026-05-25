"""Settings CRUD plus Plex discover / test-connection endpoints."""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from services import plex_client, settings_store

logger = logging.getLogger(__name__)
bp = Blueprint("settings", __name__, url_prefix="/api")


@bp.get("/settings")
def get_settings():
    return jsonify(settings_store.redacted())


@bp.post("/settings")
def post_settings():
    patch = request.get_json(silent=True) or {}
    settings_store.update(patch)
    return jsonify(settings_store.redacted())


@bp.post("/plex/discover")
def discover():
    body = request.get_json(silent=True) or {}
    token = body.get("token") or settings_store.get("plex").get("token")
    if not token:
        return jsonify({"error": "token required"}), 400
    try:
        return jsonify({"servers": plex_client.discover_servers(token)})
    except Exception as exc:  # noqa: BLE001 — bad token → clean 401, no stack trace to client
        logger.warning("Plex discover failed: %s", exc)
        return jsonify({"error": str(exc)}), 401


@bp.post("/plex/test")
def test_connection():
    body = request.get_json(silent=True) or {}
    url = body.get("url") or settings_store.get("plex").get("url")
    token = body.get("token") or settings_store.get("plex").get("token")
    if not url or not token:
        return jsonify({"ok": False, "error": "url and token required"}), 400
    try:
        server = plex_client.connect(url, token)
        return jsonify(
            {
                "ok": True,
                "server_name": server.friendlyName,
                "version": server.version,
                "library_sections": plex_client.list_library_sections(server),
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Plex test failed: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502
