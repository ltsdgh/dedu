/* de-du Service Worker — cache-first, offline support */
const CACHE = 'dedu-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon192.png',
  './icon512.png',
  './dedu_white.jpeg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Remove old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
