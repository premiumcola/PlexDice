"""Plex OAuth PIN login flow (matches the Seerr/Jellyseerr UX)."""
from __future__ import annotations

import logging
from typing import Any, Dict

import requests
from flask import Blueprint, jsonify

from services import settings_store

logger = logging.getLogger(__name__)
bp = Blueprint("plex_auth", __name__, url_prefix="/api/plex/auth")

_PLEX_TV = "https://plex.tv/api/v2"
_TIMEOUT = 15


def _headers() -> Dict[str, str]:
    """Common headers required on every plex.tv API call."""
    return {
        "X-Plex-Product": "PlexDice",
        "X-Plex-Version": "1.0",
        "X-Plex-Client-Identifier": settings_store.ensure_client_id(),
        "X-Plex-Device": "PlexDice",
        "X-Plex-Device-Name": "PlexDice",
        "X-Plex-Platform": "Web",
        "Accept": "application/json",
    }


@bp.post("/pin")
def create_pin():
    """Request a fresh login PIN from plex.tv."""
    try:
        resp = requests.post(
            f"{_PLEX_TV}/pins", params={"strong": "true"}, headers=_headers(), timeout=_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
        return jsonify({"id": data["id"], "code": data["code"]})
    except requests.RequestException as exc:
        logger.warning("Plex pin creation failed: %s", exc)
        return jsonify({"error": str(exc)}), 502


@bp.get("/pin/<pin_id>")
def check_pin(pin_id: str):
    """Poll a PIN; once claimed, persist the token + user and report success."""
    try:
        resp = requests.get(f"{_PLEX_TV}/pins/{pin_id}", headers=_headers(), timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.warning("Plex pin check failed: %s", exc)
        return jsonify({"error": str(exc)}), 502

    token = data.get("authToken")
    if not token:
        return jsonify({"ok": False, "pending": True})

    user = _fetch_user(token)
    settings_store.set_plex(token=token, user=user)
    logger.info("Plex login succeeded for %s", (user or {}).get("username") or "unknown")
    return jsonify({"ok": True, "user": user})


@bp.post("/logout")
def logout():
    """Forget the stored Plex token and user."""
    settings_store.set_plex(token="", user=None)
    return jsonify({"ok": True})


@bp.post("/client-id")
def ensure_client_id():
    """Return the stable client identifier, generating one if settings lost it.

    The frontend calls this before building the auth URL: an empty clientID makes
    plex.tv silently reject the login, so we guarantee a value server-side first.
    """
    return jsonify({"client_id": settings_store.ensure_client_id()})


def _fetch_user(token: str) -> Dict[str, Any]:
    """Fetch the signed-in account's username, email and avatar."""
    headers = {**_headers(), "X-Plex-Token": token}
    try:
        resp = requests.get(f"{_PLEX_TV}/user", headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return {
            "username": data.get("username") or data.get("title") or "",
            "email": data.get("email") or "",
            "thumb": data.get("thumb") or "",
        }
    except requests.RequestException as exc:
        logger.warning("Plex user fetch failed: %s", exc)
        return {"username": "", "email": "", "thumb": ""}
