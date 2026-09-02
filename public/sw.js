// gament-v7: INERT service worker (kill-switch for the broken v5 worker).
//
// History: v5's HTML fallback could hand undefined to respondWith() on a
// flaky mobile connection → net::ERR_FAILED → Chrome's dead-end
// "This page couldn't load" screen. v6 fixed the fallback but phones that
// never managed to load it stayed on broken v5.
//
// v7 ships through the SAME /sw.js URL so every device replaces its worker on
// the next visit. It deliberately has NO fetch handler: every request goes
// straight to the network and no navigation can ever be hijacked again.
// install/activate only wipe stale caches and take control immediately.
const KEEP = 'gament-v7-inert';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== KEEP).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});
