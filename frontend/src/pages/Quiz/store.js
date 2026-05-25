// Per-round client state in sessionStorage. In-progress rounds live in backend
// memory keyed by round_id; we keep the question payload + setup form here so
// Play/Result can read them without a GET-in-progress endpoint.
const ROUND = (id) => `quiz:round:${id}`;
const RESULTS = (id) => `quiz:results:${id}`;

function read(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function write(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
}

export const saveRound = (id, data) => write(ROUND(id), data);
export const loadRound = (id) => read(ROUND(id));
export const saveResults = (id, data) => write(RESULTS(id), data);
export const loadResults = (id) => read(RESULTS(id));
export function clearRound(id) {
  try {
    sessionStorage.removeItem(ROUND(id));
    sessionStorage.removeItem(RESULTS(id));
  } catch {
    /* ignore */
  }
}
