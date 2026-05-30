// On-device debug tooling: eruda (DOM inspector, computed styles, console, network) loaded
// LAZILY and ONLY when explicitly enabled, so the normal production bundle stays lean and the
// overlay is completely invisible in normal use. Enable via ?debug=1 in the URL or the sticky
// localStorage flag; in the installed PWA (no URL bar) toggle it with 5 quick taps on the logo.

const FLAG = 'plexdice_debug';
const TAP_WINDOW_MS = 2000;
const TAPS_NEEDED = 5;

// True when debug mode is requested: ?debug=1 on the URL, or the persisted localStorage flag.
export function isDebugEnabled() {
  try {
    if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
  } catch { /* malformed URL */ }
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false; // storage unavailable (e.g. private mode)
  }
}

// Lazy-load eruda and start the overlay. The dynamic import keeps eruda out of the main bundle —
// the chunk is only fetched when debug mode is on. Guarded so it initialises at most once.
let started = false;
export function initDebug() {
  if (started || !isDebugEnabled()) return;
  started = true;
  import('eruda').then((m) => m.default.init()).catch(() => { /* offline / chunk unavailable */ });
}

// Flip the sticky flag and reload, so the overlay can be turned on/off from the home-screen PWA.
function toggleDebug() {
  try {
    localStorage.setItem(FLAG, localStorage.getItem(FLAG) === '1' ? '0' : '1');
  } catch { /* storage unavailable */ }
  window.location.reload();
}

// 5 taps on the logo within TAP_WINDOW_MS flips debug mode. Wired to the header logo's onClick.
let taps = 0;
let firstTapAt = 0;
export function handleLogoTap() {
  const now = Date.now();
  if (now - firstTapAt > TAP_WINDOW_MS) {
    taps = 0;
    firstTapAt = now;
  }
  taps += 1;
  if (taps >= TAPS_NEEDED) {
    taps = 0;
    toggleDebug();
  }
}
