const PLEX_DIRECT = /^https?:\/\/([\d-]+)\.[a-f0-9]+\.plex\.direct(:\d+)?/i;

// Defensive: rewrite a plex.direct deep-link to its LAN IP over plain HTTP before it
// reaches the DOM, so iOS Safari (which can't resolve *.plex.direct on restrictive home
// DNS) follows it. Used only for the local-web fallback when a movie has no plex_guid.
export function sanitizePlexUrl(url) {
  if (!url) return url;
  const m = PLEX_DIRECT.exec(url);
  if (!m) return url;
  const ip = m[1].replace(/-/g, '.');
  const port = m[2] || ':32400';
  const suffix = url.slice(m[0].length);
  return `http://${ip}${port}${suffix}`;
}

// Plex Universal Link built from a movie's Plex Discover GUID. watch.plex.tv is the
// domain registered in the Plex iOS/Android app's Universal-Link handler (AASA), so the
// native app intercepts it and opens the user's matched library copy on its detail
// screen. (plex:// and app.plex.tv are NOT registered there — hence earlier attempts
// only reached the app home.) The key is encodeURIComponent'd exactly once.
export function plexWatchUrl(plexGuid) {
  const key = encodeURIComponent(`/library/metadata/${plexGuid}`);
  return `https://watch.plex.tv/details?key=${key}`;
}
