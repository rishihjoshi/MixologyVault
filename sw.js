'use strict';

const CACHE_VER  = 'v1';
const CACHE_CORE = 'hb-core-' + CACHE_VER;
const CACHE_IMG  = 'hb-images-' + CACHE_VER;
const MAX_IMGS   = 50;

const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/cocktails.json',
  '/mocktails.json',
  '/ingredients.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_CORE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_CORE && k !== CACHE_IMG)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Images: cache-first with LRU cap
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/')) {
    e.respondWith(
      caches.open(CACHE_IMG).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok) {
          const keys = await cache.keys();
          if (keys.length >= MAX_IMGS) await cache.delete(keys[0]);
          cache.put(e.request, res.clone());
        }
        return res;
      })
    );
    return;
  }

  // JSON: network-first, cache fallback
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE_CORE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request))
  );
});
