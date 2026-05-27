const PLEX_DIRECT = /^https?:\/\/([\d-]+)\.[a-f0-9]+\.plex\.direct(:\d+)?/i;

// Defensive last line: rewrite any plex.direct deep-link to its LAN IP over plain HTTP
// before it reaches the DOM, so iOS Safari (which can't resolve *.plex.direct on
// restrictive home DNS) follows the link cleanly even if the backend served a stale URL.
export function sanitizePlexUrl(url) {
  if (!url) return url;
  const m = PLEX_DIRECT.exec(url);
  if (!m) return url;
  const ip = m[1].replace(/-/g, '.');
  const port = m[2] || ':32400';
  const suffix = url.slice(m[0].length);
  return `http://${ip}${port}${suffix}`;
}
