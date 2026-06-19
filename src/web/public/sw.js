const CACHE_NAME = 'labby-cache-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/labby.svg',
  '/icons/labby-icon-16.png',
  '/icons/labby-icon-32.png',
  '/icons/labby-icon-48.png',
  '/icons/labby-icon-192.png',
  '/icons/labby-icon-512.png',
  '/icons/labby-maskable-192.png',
  '/icons/labby-maskable-512.png'
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => (self as any).skipWaiting())
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => (self as any).clients.claim())
  );
});

self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);

  // Bypass cache for API calls, settings, and non-GET requests
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Ignore network failure
        });
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
