import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// JS-driven viewport height. In an iOS standalone PWA (black-translucent status bar +
// viewport-fit=cover) window.innerHeight EXCLUDES the top safe-area inset — e.g. on an
// iPhone 15 Pro Max it reports 873 while the true screen is 932, ~59px short — so a bottom
// flex child pinned to innerHeight floats above the real edge and the page BODY peeks below
// the nav. PlexDice is a portrait PWA, so when launched standalone window.screen.height is the
// reliable full-screen height; drive --app-height straight from it. In a normal browser tab
// (not standalone) innerHeight is the right value. NO vh/dvh anywhere.
function setAppHeight() {
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const h = isStandalone ? window.screen.height : window.innerHeight;
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
