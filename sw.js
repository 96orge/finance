// Bump when SHELL_ASSETS or the caching strategy changes; old caches are deleted on activate.
const CACHE_VERSION = 'steady-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// Saved on install, so the app works offline straight after the first visit.
const SHELL_ASSETS = [
  './', 'index.html', 'app.js', 'style.css',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'vendor/outfit/outfit.css', 'vendor/outfit/outfit-latin.woff2', 'vendor/outfit/outfit-latin-ext.woff2',
  'vendor/fontawesome/css/all.min.css', 'vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'vendor/chart.js/chart.umd.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Path relative to the app's root, e.g. "vendor/chart.js/chart.umd.min.js" — the site
  // lives under /finance/ on GitHub Pages but at / locally.
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);

  if (path.startsWith('vendor/') || path.startsWith('icons/')) {
    // Third-party files and icons only change when deliberately upgraded: answer from the
    // cache immediately (fast on slow connections) and refresh the saved copy in the background.
    const network = fetch(e.request).then(async (res) => {
      if (res.ok) await (await caches.open(SHELL_CACHE)).put(e.request, res.clone());
      return res;
    });
    e.respondWith(caches.match(e.request).then((cached) => cached || network));
    e.waitUntil(network.catch(() => {}));
    return;
  }

  // The app's own code: network first, so online users always get the latest version;
  // the cache is only a fallback when offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((cached) =>
      cached || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
