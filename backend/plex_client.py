"""Thin wrapper around python-plexapi for discovery and movie fetching."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests
import urllib3
from plexapi.myplex import MyPlexAccount
from plexapi.server import PlexServer
from urllib3.exceptions import InsecureRequestWarning

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

    def connect(
        self,
        url: str,
        token: str,
        manual_url: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> PlexServer:
        """Open a PlexServer connection.

        With ``manual_url`` set (a LAN override from settings) connect straight to that
        address over a no-verify session — LAN servers carry self-signed certs and the
        raw IP sidesteps ``*.plex.direct`` DNS entirely. Otherwise connect to the
        discovered ``url`` via python-plexapi's normal flow (plex.tv → plex.direct).
        """
        manual = (manual_url or "").strip()
        if manual:
            if not token:
                raise ValueError("Plex token is required")
            # Scope the warning suppression to this path; LAN certs are self-signed.
            urllib3.disable_warnings(InsecureRequestWarning)
            session = requests.Session()
            session.verify = False
            # A failing manual URL must not hang startup → default to a 10s timeout.
            server = PlexServer(
                baseurl=manual.rstrip("/"), token=token, session=session, timeout=timeout or 10
            )
            logger.info("Connected to Plex via manual URL %s", manual)
            return server
        if not url or not token:
            raise ValueError("Plex URL and token are required")
        server = PlexServer(baseurl=url.rstrip("/"), token=token, timeout=timeout)
        logger.info("Connected to Plex via plex.tv discovery")
        return server

    def connect_from_settings(
        self, plex: Dict[str, Any], timeout: Optional[float] = None
    ) -> PlexServer:
        """Connect using a stored ``plex`` settings dict, honouring a manual URL override."""
        return self.connect(
            plex.get("url", ""),
            plex.get("token", ""),
            manual_url=plex.get("plex_server_url"),
            timeout=timeout,
        )

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
        self,
        server: PlexServer,
        section_ids: Optional[List[str]] = None,
        base_url: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        wanted = {str(s) for s in section_ids} if section_ids else None
        machine_id = server.machineIdentifier
        base = (base_url or getattr(server, "_baseurl", "") or "").rstrip("/")
        movies: List[Dict[str, Any]] = []
        for section in server.library.sections():
            if section.type != "movie":
                continue
            if wanted is not None and str(section.key) not in wanted:
                continue
            for movie in section.all():
                movies.append(self._movie_dict(movie, machine_id, base))
        logger.info("Fetched %d movies from Plex", len(movies))
        return movies

    def fetch_enrichment(
        self, server: PlexServer, rating_key: str, actor_limit: int = 5, crew_limit: int = 2
    ) -> Optional[Dict[str, Any]]:
        """One ``fetchItem`` per movie → top cast + crew/studio/country/tagline/
        collections. Returns ``{actors, meta, thumbs}`` (thumbs maps person key →
        raw Plex thumb for the thumb proxy), or ``None`` if the item can't be loaded."""
        try:
            item = server.fetchItem(int(rating_key))
        except Exception:  # noqa: BLE001 — a missing/oddball item just yields nothing
            return None

        thumbs: Dict[str, str] = {}

        def people(tags: Any, limit: int, prefix: str, with_role: bool) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for tag in (tags or [])[:limit]:
                name = getattr(tag, "tag", None)
                if not name:
                    continue
                tid = getattr(tag, "id", None)
                key = str(tid) if tid else None
                raw_thumb = getattr(tag, "thumb", None) or None
                thumb_url = None
                if raw_thumb and key:
                    thumbs[key] = raw_thumb
                    thumb_url = f"/api/plex/thumb/{prefix}/{key}"
                out.append(
                    {
                        "name": name,
                        "role": (getattr(tag, "role", None) or None) if with_role else None,
                        "thumb_url": thumb_url,
                    }
                )
            return out

        actors = people(getattr(item, "roles", None), actor_limit, "actor", True)
        meta = {
            "studio": getattr(item, "studio", None) or None,
            "countries": [c.tag for c in (getattr(item, "countries", None) or [])],
            "tagline": getattr(item, "tagline", None) or None,
            "directors": people(getattr(item, "directors", None), crew_limit, "crew", False),
            "writers": people(getattr(item, "writers", None), crew_limit, "crew", False),
            "collections": [c.tag for c in (getattr(item, "collections", None) or [])],
        }
        return {"actors": actors, "meta": meta, "thumbs": thumbs}

    @staticmethod
    def _movie_dict(movie: Any, machine_id: str, base_url: str) -> Dict[str, Any]:
        rating_key = str(movie.ratingKey)
        duration = getattr(movie, "duration", None)
        duration_min = int(duration / 60000) if duration else None
        genres = [g.tag for g in (getattr(movie, "genres", None) or [])]
        rating = getattr(movie, "rating", None) or getattr(movie, "audienceRating", None)
        last_viewed = getattr(movie, "lastViewedAt", None)
        metadata_key = f"/library/metadata/{rating_key}"
        # Deep-link into the LOCAL Plex Web client (configured server URL) so playback
        # starts directly on the LAN instead of round-tripping through app.plex.tv.
        plex_url = (
            f"{base_url}/web/index.html#!/server/{machine_id}"
            f"/details?key={quote(metadata_key, safe='')}"
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
            "view_count": int(getattr(movie, "viewCount", 0) or 0),
            "last_viewed_at": last_viewed.isoformat() if last_viewed else None,
            "summary": getattr(movie, "summary", "") or "",
            "thumb_url": f"/api/library/thumb/{rating_key}",
            "art_url": f"/api/library/thumb/{rating_key}?art=1",
            "plex_url": plex_url,
            # Internal raw Plex paths used by the thumbnail proxy (token stays server-side)
            "_thumb": getattr(movie, "thumb", None),
            "_art": getattr(movie, "art", None),
        }
