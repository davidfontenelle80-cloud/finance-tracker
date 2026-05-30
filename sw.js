/* ══════════════════════════════════════════════════════════════
   SW.JS — Service Worker (PWA / Offline)
   Caches all app shell assets on install.
   Serves from cache first, falls back to network.
   Cache-busted by CACHE_NAME version — bump it to force update.
══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'finance-tracker-v7';

// All static assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './storage.js',
  './lang.js',
  './setup.js',
  './paychecks.js',
  './entry.js',
  './tracker.js',
  './accounts.js',
  './investments.js',
  './dashboard.js',
  './transfers.js',
  './app.js',
  './manifest.json'
];

// ── Install: pre-cache everything ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // take control of all open pages
  );
});

// ── Fetch: cache-first strategy ──────────────────────────────
// For Chart.js CDN: network-first (we want the latest), then cache fallback
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Network-first for CDN resources
  if (url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (app shell)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
