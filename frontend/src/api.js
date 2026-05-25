// Thin fetch wrappers for the PlexDice backend API.
// Dev: Vite proxies /api -> http://localhost:8080. Prod: same origin.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function unwrap(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.error || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body || {}),
  }).then(unwrap);
}

// Map backend movie dicts to the short keys the Dice UI was written against,
// while keeping the long keys (thumb_url, plex_url, summary, …) available.
function adaptMovie(m) {
  return {
    ...m,
    t: m.title,
    o: m.originalTitle,
    y: m.year,
    r: m.duration_min,
    g: m.genres || [],
    f: m.fsk,
    s: m.rating,
  };
}

export async function getLibrary() {
  const data = await fetch('/api/library').then(unwrap);
  return {
    movies: (data.movies || []).map(adaptMovie),
    refreshedAt: data.refreshed_at || null,
  };
}

export function refreshLibrary() {
  return postJson('/api/library/refresh', {});
}

export function getSettings() {
  return fetch('/api/settings').then(unwrap);
}

export function saveSettings(patch) {
  return postJson('/api/settings', patch);
}

// Token lives server-side after OAuth login; these endpoints read it themselves.
export function discoverServers() {
  return postJson('/api/plex/discover', {});
}

export function testConnection({ url, ssl }) {
  return postJson('/api/plex/test', { url, ssl });
}

export function createPlexPin() {
  return postJson('/api/plex/auth/pin', {});
}

export function checkPlexPin(id) {
  return fetch(`/api/plex/auth/pin/${id}`).then(unwrap);
}

export function plexLogout() {
  return postJson('/api/plex/auth/logout', {});
}

export function aiPlot(movie) {
  return postJson('/api/ai/plot', {
    title: movie.title || movie.t,
    original_title: movie.originalTitle || movie.o,
    year: movie.year || movie.y,
  });
}
