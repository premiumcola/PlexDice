import { useEffect, useState } from 'react';
import { getSettings } from './api';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function osReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(REDUCE_QUERY).matches
    : false;
}

// Tiny prefs hook: reads ui prefs from the backend once on mount and tracks the OS
// prefers-reduced-motion query. `reduceMotion` is the user's toggle OR the OS
// preference (the OS acts as the fallback when the user never turned it on).
export function usePrefs() {
  const [ui, setUi] = useState(null);
  const [osReduce, setOsReduce] = useState(osReducedMotion);

  useEffect(() => {
    let alive = true;
    getSettings().then((s) => { if (alive) setUi(s?.ui || {}); }).catch(() => {});
    const mq = window.matchMedia ? window.matchMedia(REDUCE_QUERY) : null;
    const onChange = (e) => setOsReduce(e.matches);
    mq?.addEventListener?.('change', onChange);
    return () => { alive = false; mq?.removeEventListener?.('change', onChange); };
  }, []);

  return { reduceMotion: Boolean(ui?.reduce_motion) || osReduce };
}
