// Tiny history-based router (no dependency). Flask serves index.html for any
// non-API path (SPA fallback), so deep links like /quiz/play/<id> work.
import { useSyncExternalStore } from 'react';

const listeners = new Set();
let wired = false;

function emit() {
  listeners.forEach((l) => l());
}

function wire() {
  if (wired) return;
  wired = true;
  window.addEventListener('popstate', emit);
}

export function navigate(to, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  emit();
}

function subscribe(cb) {
  wire();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePathname() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  );
}

// Match a pathname against "/quiz/play/:roundId" style patterns.
// Returns a params object on match, or null.
export function matchRoute(pattern, pathname) {
  const pp = pattern.split('/').filter(Boolean);
  const ph = pathname.split('/').filter(Boolean);
  if (pp.length !== ph.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i += 1) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ph[i]);
    else if (pp[i] !== ph[i]) return null;
  }
  return params;
}
