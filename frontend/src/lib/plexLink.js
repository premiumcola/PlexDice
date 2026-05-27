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

// iOS / iPadOS / Android — where the native Plex app can be deep-linked. iPadOS Safari
// masquerades as desktop (platform "MacIntel"), so the touch-point heuristic catches it.
export function isPlexAppPlatform() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  return iOS || /Android/.test(ua);
}

// Native Plex app deep link to a movie's preplay screen.
export function plexAppUrl(ratingKey, machineId) {
  const metadataKey = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `plex://preplay/?metadataKey=${metadataKey}&server=${machineId}`;
}

// On mobile, jump to the native app; if the page is still visible after ~1.5s (app not
// installed / didn't take over), fall back to the web URL. Returns true if it handled
// the open (caller should preventDefault), false to let the plain web link proceed.
export function openInPlexApp({ ratingKey, machineId, webUrl }) {
  if (!isPlexAppPlatform() || !ratingKey || !machineId) return false;
  let settled = false;
  const settle = (openWeb) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', leave);
    window.removeEventListener('blur', leave);
    if (openWeb && webUrl) window.open(webUrl, '_blank', 'noopener');
  };
  // The app taking over fires one of these on iOS — any of them cancels the fallback,
  // so we never pop Plex Web on top of the launched native app (the A1 false-positive).
  const onVisibility = () => { if (document.visibilityState === 'hidden') settle(false); };
  const leave = () => settle(false);
  const timer = setTimeout(() => settle(document.visibilityState === 'visible'), 1500);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', leave);
  window.addEventListener('blur', leave);
  window.location.href = plexAppUrl(ratingKey, machineId);
  return true;
}
