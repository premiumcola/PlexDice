import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initDebug } from './debug';
import './index.css';

// Start on-device devtools (eruda) before anything renders, but only when debug mode is enabled
// (?debug=1 or the plexdice_debug flag). Lazy — when disabled nothing is imported. See debug.js.
initDebug();

// JS-driven viewport height for the #root flex column (no vh/dvh anywhere). On an iOS standalone
// PWA (black-translucent status bar + viewport-fit=cover) the three height measures disagree:
// window.innerHeight is the VISUAL viewport and under-reports by the top inset (e.g. 873 on an
// iPhone 15 Pro Max), while documentElement.clientHeight (the LAYOUT viewport that cover paints)
// and window.screen.height are the full screen (932). Pinning #root to innerHeight leaves the
// page BODY peeking below the bottom nav. Taking the MAX of all three always reaches the true
// bottom edge, and — unlike a standalone-mode branch — it never falls back to the short value
// when iOS reports display-mode/navigator.standalone unreliably right after install.
function setAppHeight() {
  const h = Math.max(
    document.documentElement.clientHeight,
    window.innerHeight,
    window.screen.height,
  );
  document.documentElement.style.setProperty('--app-height', `${h}px`);
}
setAppHeight();
window.addEventListener('load', setAppHeight);
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);
window.visualViewport?.addEventListener('resize', setAppHeight);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker on production builds only, and reload once when a new worker
// takes control so the installed PWA never stays on stale assets after a deploy. The SW
// uses skipWaiting()+clients.claim(), so a new version activates immediately and fires
// controllerchange here; the guard prevents a reload loop.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let reloading = false;
  // Only reload on an UPDATE (a worker already controlled this page at load). On a
  // first-ever install the SW's clients.claim() also fires controllerchange, but there's
  // nothing stale then — reloading would just flicker the first launch.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => { reg.update?.(); })
      .catch(() => {});
  });
}
