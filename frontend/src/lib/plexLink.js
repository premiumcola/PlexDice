// Native-app hand-off via Plex's documented deep-link scheme. The Plex iOS / Android / desktop
// app registers the plex:// custom URL scheme; the "preplay" action opens the item's info screen
// in the app (pass action "play" to start playback instead). The link targets the LOCAL server
// item by its machineIdentifier — the 40-hex server id; the friendly name does NOT work — plus the
// ratingKey, so the app opens the user's own copy and streams directly from the local server on the
// LAN. It is local-only: it carries no plex.tv / relay / streaming URL and NEVER a token, only the
// local item key, the metadata type and the local server id — the app resolves the server id and
// streams from the local server. metadataType: movie = 1 (default 1). The metadataKey keeps RAW
// slashes exactly as in Plex's documented example — it must NOT be URL-encoded (nor double-encoded).
//
// Plex requirement (a Plex limitation, not something we can fix here): the deep link only opens the
// app if the Plex app is installed, has been opened at least once (first run completed), and is
// logged into an account with access to that server.
export function plexAppUrl(machineId, ratingKey, type = 1, action = 'preplay') {
  if (!machineId || !ratingKey) return null;
  return `plex://${action}/?metadataKey=/library/metadata/${ratingKey}`
    + `&metadataType=${type}&server=${machineId}`;
}
