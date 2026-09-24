/* de-du Service Worker — network-first, offline support */
const CACHE = 'dedu-v60';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon192.png',
  './icon512.png',
  './apple-touch-icon.png',
  './dedu_white.jpeg'
];
const FONTS = 'https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap';

self.addEventListener('install', e => {
  // The fonts are optional: if they can't be fetched, the update must still
  // install, otherwise phones stay stuck on the old version.
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).then(() => c.add(FONTS).catch(() => {})))
  );
  self.skipWaiting();
});

// Versions before v57 were cache-first and their pages have no reload-on-update
// code, so a phone upgrading from one of them would keep showing the old game.
const LAST_CACHE_FIRST_VERSION = 56;

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Remove old caches
    const old = (await caches.keys()).filter(k => k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    // Coming from a cache-first version: reload open windows ourselves so the
    // new version appears now, without the user having to do anything.
    const fromCacheFirst = old.some(k => {
      const m = /^dedu-v(\d+)$/.exec(k);
      return m && Number(m[1]) <= LAST_CACHE_FIRST_VERSION;
    });
    if (fromCacheFirst) {
      const wins = await self.clients.matchAll({ type: 'window' });
      await Promise.all(wins.map(w => w.navigate(w.url).catch(() => {})));
    }
  })());
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Network-first for our own files, so a new deploy shows up right away;
  // the cache is only a fallback when offline.
  if (url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(e.request).then(cached => cached || caches.match('./index.html'))
      )
    );
  // Cache-first for Google Fonts (they never change)
  } else if (url.includes('fonts.googleapis.com') ||
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
