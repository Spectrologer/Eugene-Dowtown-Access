// A name for the cache storage.
const CACHE_NAME = 'eugene-access-cache-v1';

// A list of essential files to be cached when the service worker is installed.
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0'
];

// --- EVENT LISTENERS ---

// INSTALL: This event is fired when the service worker is first installed.
// It opens the cache and adds the essential files to it.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
      .catch(err => {
        console.error('Failed to cache resources during install:', err);
      })
  );
});

// ACTIVATE: This event is fired when the service worker is activated.
// It's a good place to clean up old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});


// FETCH: This event is fired for every network request the page makes.
// It allows us to intercept the request and respond with a cached version
// if one is available.
self.addEventListener('fetch', event => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // For requests to external resources like map tiles and the Google Sheet,
  // we use a "network falling back to cache" strategy. This ensures users
  // get the latest data when they are online.
  if (event.request.url.startsWith('http')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If the fetch is successful, we clone the response and cache it.
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        })
        .catch(() => {
          // If the network request fails (e.g., offline), we try to
          // find a match in the cache.
          return caches.match(event.request);
        })
    );
  } else {
    // For local assets, we use a "cache first" strategy.
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // If a cached version is found, return it.
          // Otherwise, fetch from the network.
          return response || fetch(event.request);
        })
    );
  }
});