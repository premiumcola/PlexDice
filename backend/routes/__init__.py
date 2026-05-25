"""Blueprint registration for all /api routes."""
from __future__ import annotations

from flask import Flask

from .ai import bp as ai_bp
from .library import bp as library_bp
from .plex import bp as plex_bp
from .plex_auth import bp as plex_auth_bp
from .settings import bp as settings_bp


def register_routes(app: Flask) -> None:
    app.register_blueprint(library_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(plex_auth_bp)
    app.register_blueprint(plex_bp)
    app.register_blueprint(ai_bp)
