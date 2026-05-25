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
    castEnriched: Boolean(data.cast_enriched),
    castProgress: data.cast_progress || { done: 0, total: 0 },
    schemaVersion: data.schema_version || 1,
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

export function getLibraryStatus() {
  return fetch('/api/library/status').then(unwrap);
}

function del(url) {
  return fetch(url, { method: 'DELETE' }).then(unwrap);
}

// ---- Quiz ----
export function quizNewRound(body) {
  return postJson('/api/quiz/round/new', body);
}
export function quizAnswer(roundId, body) {
  return postJson(`/api/quiz/round/${roundId}/answer`, body);
}
export function quizComplete(roundId, body) {
  return postJson(`/api/quiz/round/${roundId}/complete`, body);
}
export function quizAbandon(roundId) {
  return del(`/api/quiz/round/${roundId}`);
}
export function quizHistory() {
  return fetch('/api/quiz/history').then(unwrap);
}
export function quizRound(roundId) {
  return fetch(`/api/quiz/history/${roundId}`).then(unwrap);
}
export function quizDeleteRound(roundId) {
  return del(`/api/quiz/history/${roundId}`);
}
export function quizTopMovies() {
  return fetch('/api/quiz/history/top').then(unwrap);
}
export function quizMovieStats(movieKey) {
  return fetch(`/api/quiz/movie/${movieKey}/stats`).then(unwrap);
}

export function aiPlot(movie) {
  return postJson('/api/ai/plot', {
    title: movie.title || movie.t,
    original_title: movie.originalTitle || movie.o,
    year: movie.year || movie.y,
  });
}
