// A new version number is critical to trigger the update process.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `headstone-memorial-cache-${CACHE_VERSION}`;

// The list of essential files for the app shell.
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/app.js',
  '/js/firebase-config.js',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js',
  'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css'
];

// 1. Install Event: Cache the app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Network first, then cache fallback.
self.addEventListener('fetch', event => {
  // We only want to apply this strategy to page navigations and our assets.
  if (event.request.mode !== 'navigate' && !urlsToCache.some(url => event.request.url.includes(url))) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return fetch(event.request)
        .then(response => {
          // If we get a valid response, cache it and return it.
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(err => {
          // If the network fails, try to serve from the cache.
          console.log('Network request failed, trying cache for:', event.request.url);
          return cache.match(event.request);
        });
    })
  );
});