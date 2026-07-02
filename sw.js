/**
* sw.js — KHub Boilerplate
* Version: network-first shortcut refresh
*
* BUMP THIS VERSION STRING on every deploy that changes HTML, CSS, JS, manifest, or SW behavior.
*/

const CACHE_VERSION = 'finance-v102-audit-token-cache-fixes';

const PRECACHE_URLS = [
'./',
'./index.html',
'./manifest.json',
'./excel-import-bridge.html',
'./bridge-manifest.json',
'./icons/excel-bridge-72.png',
'./icons/excel-bridge-96.png',
'./icons/excel-bridge-128.png',
'./icons/excel-bridge-144.png',
'./icons/excel-bridge-152.png',
'./icons/excel-bridge-180.png',
'./icons/excel-bridge-192.png',
'./icons/excel-bridge-384.png',
'./icons/excel-bridge-512.png',
'./css/styles.css',
'./css/dark-mode.css',
'./css/components.css',
'./css/responsive.css',
'./js/config.js',
'./js/error-boundary.js',
'./js/a11y.js',
'./js/perf.js',
'./js/firebase/firebase-config.js',
'./js/firebase/cloud-backup.js',
'./js/firebase/firebase-sync.js',
'./storage.js',
'./dashboard.js',
'./app.js',
];

self.addEventListener('install', event => {
event.waitUntil(
caches.open(CACHE_VERSION)
.then(cache => cache.addAll(PRECACHE_URLS))
.then(() => {
self.skipWaiting();
console.log('[KHub SW] Installed — skipping wait, activating immediately.');
})
.catch(err => console.error('[KHub SW] Install failed:', err))
);
});

self.addEventListener('activate', event => {
event.waitUntil(
caches.keys()
.then(keys => Promise.all(
keys
.filter(key => key !== CACHE_VERSION)
.map(key => {
console.log('[KHub SW] Deleting old cache:', key);
return caches.delete(key);
})
))
.then(() => self.clients.claim())
.then(() => {
self.clients.matchAll({ type: 'window' }).then(clients => {
clients.forEach(client => client.postMessage({ type: 'RELOAD_READY' }));
});
})
);
});

self.addEventListener('fetch', event => {
if (event.request.method !== 'GET') return;
const url = new URL(event.request.url);
if (url.origin !== self.location.origin) return;
const isAppShell = PRECACHE_URLS.some(path => new URL(path, self.location.href).pathname === url.pathname);
if (!isAppShell) return;
event.respondWith(
fetch(event.request)
.then(response => {
if (response && response.status === 200 && response.type === 'basic') {
const cloned = response.clone();
caches.open(CACHE_VERSION).then(cache => cache.put(event.request, cloned));
}
return response;
})
.catch(() => caches.match(event.request, { ignoreSearch: true }))
);
});

self.addEventListener('message', event => {
if (!event.data) return;
if (event.data.type === 'SKIP_WAITING') {
console.log('[KHub SW] SKIP_WAITING received — activating new version.');
self.skipWaiting();
}
});
