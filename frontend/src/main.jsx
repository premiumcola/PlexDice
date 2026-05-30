import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initDebug } from './debug';
import './index.css';

// Start on-device devtools (eruda) before anything renders, but only when debug mode is enabled
// (?debug=1 or the plexdice_debug flag). Lazy — when disabled nothing is imported. See debug.js.
initDebug();

// JS-driven viewport height for the #root flex column (no vh/dvh). In the iOS standalone PWA
// window.innerHeight is the VISUAL viewport and under-reports by the top inset (873 on an iPhone
// 15 Pro Max) while window.screen.height is the full physical screen (932). PlexDice is portrait-
// locked, so screen.height is always the true full height — take the max of the two so #root fills
// the screen and the bottom nav reaches the physical edge, with no body strip showing below it.
const setAppHeight = () => {
  const h = Math.max(window.innerHeight, window.screen.height);
  document.documentElement.style.setProperty('--app-height', h + 'px');
};
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);
window.visualViewport && window.visualViewport.addEventListener('resize', setAppHeight);

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
