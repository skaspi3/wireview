// Service Worker for Wireview - Pre-caches large WASM files
const CACHE_NAME = 'wireview-v1';
const WASM_ASSETS = [
  '/wiregasm.js',
  '/wiregasm.wasm',
  '/wiregasm.bmp'
];

// Install: Pre-cache WASM assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing and pre-caching WASM assets...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching WASM files');
        return cache.addAll(WASM_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: WASM files cached successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('Service Worker: Failed to cache WASM files:', err);
      })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Now controlling all pages');
      return self.clients.claim();
    })
  );
});

// Fetch: Serve WASM files from cache first (cache-first strategy)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept WASM-related requests
  if (WASM_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached version immediately
            return cachedResponse;
          }
          // Not in cache, fetch from network and cache it
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          });
        })
    );
  }
});
