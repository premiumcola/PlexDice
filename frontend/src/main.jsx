import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// JS-driven viewport height. In an iOS standalone PWA (black-translucent status bar +
// viewport-fit=cover) window.innerHeight EXCLUDES the top safe-area inset — e.g. on an
// iPhone 15 Pro Max it reports 873 while the screen is 932, ~59px short — so a bottom flex
// child pinned to innerHeight floats above the true edge. Fix: --app-height = innerHeight +
// the measured top inset, which equals the full physical screen height. NO vh/dvh anywhere.
function measureTopInset() {
  // A throwaway fixed probe resolves env(safe-area-inset-top) to a concrete px height.
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const px = probe.offsetHeight;
  probe.remove();
  return px;
}

function setAppHeight() {
  const topInset = measureTopInset();
  let h = window.innerHeight + topInset;
  // Portrait only: never shorter than the physical screen height (CSS px). innerHeight + topInset
  // can land a few px short of the true bottom, which lets the page BODY peek below the nav;
  // flooring at screen.height closes that strip. Guarded so landscape (where iOS keeps
  // screen.height at its portrait value) is unaffected.
  if (window.innerHeight >= window.innerWidth) {
    h = Math.max(h, window.screen.height);
  }
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
