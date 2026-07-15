// Release ritual: bump CACHE_NAME here AND APP_VERSION in app.js together.
const CACHE_NAME = 'mixvault-v3';
const STATIC_ASSETS = [
  './index.html',
  './app.js',
  './config.js',
  './styles.css',
  './manifest.json',
  './AppIcon.png',
  './HeroImage.png',
  './cocktails.json',
  './ingredients.json',
  './mocktails.json',
];
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
];

self.addEventListener('install', e => {
  // Do NOT skipWaiting() here — the new worker waits until the user clicks
  // "Refresh" in the update banner, which posts SKIP_WAITING (see below).
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS))
  );
});

// Triggered by the update banner's Refresh button (app.js registerServiceWorker).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept Anthropic API calls — always live
  if (url.hostname === 'api.anthropic.com') return;

  // config.js carries the deploy-injected API key — serve it network-first so a
  // rotated key propagates on the next load without an app-version/cache bump.
  // Falls back to the cached copy when offline.
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // CDN fonts: network-first with cache fallback
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Local app shell: cache-first
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
