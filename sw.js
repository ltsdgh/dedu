/* de-du Service Worker — cache-first, offline support */
const CACHE = 'dedu-v18';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon192.png',
  './icon512.png',
  './dedu_white.jpeg',
  'https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap'
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
  const url = e.request.url;
  // Cache-first for same-origin and Google Fonts
  if (url.startsWith(self.location.origin) ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        });
      })
    );
  } else {
    e.respondWith(fetch(e.request));
  }
});
