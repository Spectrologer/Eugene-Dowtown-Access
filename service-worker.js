// A name for the cache storage.
const CACHE_NAME = 'eugene-access-cache-v2'; // Incremented cache version

// A list of essential files to be cached when the service worker is installed.
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap'
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

  const requestUrl = new URL(event.request.url);

  // --- STRATEGY: Network Only for Google Sheets ---
  // Always go to the network for Google Sheet data to ensure freshness.
  // This prevents caching of bad responses (like login page redirects).
  if (requestUrl.hostname === 'docs.google.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- STRATEGY: Network falling back to cache for other external resources ---
  // For things like map tiles, try the network first.
  if (requestUrl.protocol.startsWith('http')) {
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
    // --- STRATEGY: Cache first for local assets ---
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