const PLEX_DIRECT = /^https?:\/\/([\d-]+)\.[a-f0-9]+\.plex\.direct(:\d+)?/i;

// Defensive: rewrite a plex.direct deep-link to its LAN IP over plain HTTP before it
// reaches the DOM, so iOS Safari (which can't resolve *.plex.direct on restrictive home
// DNS) follows it. Used for the local Plex Web deep link and the native-app fallback.
export function sanitizePlexUrl(url) {
  if (!url) return url;
  const m = PLEX_DIRECT.exec(url);
  if (!m) return url;
  const ip = m[1].replace(/-/g, '.');
  const port = m[2] || ':32400';
  const suffix = url.slice(m[0].length);
  return `http://${ip}${port}${suffix}`;
}

// Native-app hand-off. The Plex iOS/Android app registers the plex:// custom URL scheme,
// which — unlike the Plex cloud universal links — reliably launches the installed app
// even from a standalone PWA, and (since it is not a real navigation when the app is
// missing) lets the caller cleanly fall back to the local web client. Targets the LOCAL
// server item by machineIdentifier + ratingKey so the app opens the user's own copy on
// the LAN, never the cloud catalog (which is empty for a local-only library). Returns
// null when the ids are missing so the caller uses the web deep link instead.
export function plexAppUrl(machineId, ratingKey) {
  if (!machineId || !ratingKey) return null;
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `plex://server/${machineId}/details?key=${key}`;
}
