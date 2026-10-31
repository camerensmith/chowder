// Service worker for the Chowder PWA.
//
// - Page navigations / index.html: network-first, so a new deploy is picked up
//   on the next launch; falls back to the cached shell when offline.
// - Hashed build files (/_expo/, /assets/): cache-first (their URLs change
//   whenever their content does).
// - Everything else (map tiles, geocoding, other origins): not intercepted.
//
// BUILD_ID is replaced at deploy time by fix-paths.js so every deploy gets a
// fresh cache and old ones are deleted. Your data (IndexedDB) is separate from
// these caches and is never touched by an update.

const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `chowder-${BUILD_ID}`;
const SCOPE = self.registration ? self.registration.scope : self.location.href.replace(/sw\.js$/, '');
const SHELL_URL = new URL('./', SCOPE).href;

// A new version installs in the background and then *waits*: the app shows an
// "Update ready" prompt and sends SKIP_WAITING when the user taps Update, so a
// new deploy never reloads the app in the middle of something.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => undefined)
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith('chowder-') && name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

function isBuildAsset(url) {
  return url.pathname.includes('/_expo/') || url.pathname.includes('/assets/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !request.url.startsWith(SCOPE)) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
