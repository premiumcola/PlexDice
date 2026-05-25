"""Thin wrapper around python-plexapi for discovery and movie fetching."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from plexapi.myplex import MyPlexAccount
from plexapi.server import PlexServer

logger = logging.getLogger(__name__)

_FSK_BUCKETS = [0, 6, 12, 16, 18]
_US_RATINGS = {"G": 0, "PG": 6, "PG-13": 12, "TV-14": 12, "R": 16, "NC-17": 18, "TV-MA": 18}


def parse_fsk(content_rating: Optional[str]) -> Optional[int]:
    """Map a Plex contentRating string (e.g. ``de/16``, ``FSK 12``, ``R``) to an FSK bucket."""
    if not content_rating:
        return None
    digits = "".join(ch for ch in content_rating if ch.isdigit())
    if digits:
        value = int(digits)
        for bucket in reversed(_FSK_BUCKETS):
            if value >= bucket:
                return bucket
        return 0
    return _US_RATINGS.get(content_rating.strip().upper())


class PlexClient:
    """Stateless helpers; every call connects fresh from the given credentials."""

    def connect(self, url: str, token: str) -> PlexServer:
        if not url or not token:
            raise ValueError("Plex URL and token are required")
        return PlexServer(baseurl=url.rstrip("/"), token=token)

    def discover_servers(self, token: str) -> List[Dict[str, Any]]:
        """Query plex.tv for the account's servers and their connection URIs."""
        account = MyPlexAccount(token=token)
        servers: List[Dict[str, Any]] = []
        for res in account.resources():
            if "server" not in (res.provides or ""):
                continue
            connections = [
                {
                    "uri": conn.uri,
                    "address": conn.address,
                    "port": conn.port,
                    "local": bool(conn.local),
                    "https": str(conn.protocol).lower() == "https"
                    or str(conn.uri).startswith("https"),
                }
                for conn in res.connections
            ]
            servers.append({"name": res.name, "connections": connections})
        return servers

    def list_library_sections(self, server: PlexServer) -> List[Dict[str, Any]]:
        return [
            {"id": str(section.key), "title": section.title}
            for section in server.library.sections()
            if section.type == "movie"
        ]

    def fetch_all_movies(
        self, server: PlexServer, section_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        wanted = {str(s) for s in section_ids} if section_ids else None
        machine_id = server.machineIdentifier
        movies: List[Dict[str, Any]] = []
        for section in server.library.sections():
            if section.type != "movie":
                continue
            if wanted is not None and str(section.key) not in wanted:
                continue
            for movie in section.all():
                movies.append(self._movie_dict(movie, machine_id))
        logger.info("Fetched %d movies from Plex", len(movies))
        return movies

    @staticmethod
    def _movie_dict(movie: Any, machine_id: str) -> Dict[str, Any]:
        rating_key = str(movie.ratingKey)
        duration = getattr(movie, "duration", None)
        duration_min = int(duration / 60000) if duration else None
        genres = [g.tag for g in (getattr(movie, "genres", None) or [])]
        rating = getattr(movie, "rating", None) or getattr(movie, "audienceRating", None)
        key = getattr(movie, "key", "") or f"/library/metadata/{rating_key}"
        # Universal web/app deep link — opens in a browser tab and the Plex app on mobile
        plex_url = (
            f"https://app.plex.tv/desktop/#!/server/{machine_id}"
            f"/details?key={quote(key, safe='')}"
        )
        return {
            "key": rating_key,
            "title": movie.title,
            "originalTitle": getattr(movie, "originalTitle", None) or movie.title,
            "year": getattr(movie, "year", None),
            "genres": genres,
            "duration_min": duration_min,
            "contentRating": getattr(movie, "contentRating", None),
            "fsk": parse_fsk(getattr(movie, "contentRating", None)),
            "rating": round(float(rating), 1) if rating is not None else None,
            "summary": getattr(movie, "summary", "") or "",
            "thumb_url": f"/api/library/thumb/{rating_key}",
            "art_url": f"/api/library/thumb/{rating_key}?art=1",
            "plex_url": plex_url,
            # Internal raw Plex paths used by the thumbnail proxy (token stays server-side)
            "_thumb": getattr(movie, "thumb", None),
            "_art": getattr(movie, "art", None),
        }
