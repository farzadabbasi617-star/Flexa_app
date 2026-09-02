// gament-v6: robust offline fallback.
// v5 bug: on a flaky connection the HTML navigation fallback could resolve to
// undefined (nothing cached) → respondWith(undefined) → net::ERR_FAILED →
// Chrome shows its dead-end "This page couldn't load" page. v6 always has a
// real response to hand back: the precached /offline.html.
const CACHE_NAME = 'gament-v6';

const PRECACHE = [
  '/icons/gament-icon-192.png',
  '/icons/gament-icon-512.png',
  '/icons/gament-logo-square.png',
  '/manifest.json',
  '/offline.html',
];

// Install — precache gament icons + offline fallback page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate — delete ALL old caches (gament-v1..v5 and old arena caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Never hand undefined to respondWith — Chrome turns that into a hard
// navigation error. If everything else fails, serve the offline page.
const OFFLINE_FALLBACK = () =>
  caches
    .match('/offline.html')
    .then((c) => c || new Response('<!doctype html><meta charset="utf-8"><body style="background:#0d0b16;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh">اتصال برقرار نیست — دوباره تلاش کن</body>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));

// Fetch strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  // manifest + icons: network-first, never serve stale
  if (
    event.request.url.includes('/manifest.json') ||
    event.request.url.includes('/icons/')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((c) => c || Response.error())
        )
    );
    return;
  }

  // HTML pages: network-first; offline → cached copy or /offline.html
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(event.request)
          .then((c) => c || OFFLINE_FALLBACK())
      )
    );
    return;
  }

  // Static assets (_next/static): cache-first (they're immutable)
  if (event.request.url.includes('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Default: network-first → cached → offline page
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(event.request)
        .then((c) => c || (event.request.headers.get('accept')?.includes('text/html') ? OFFLINE_FALLBACK() : Response.error()))
    )
  );
});
