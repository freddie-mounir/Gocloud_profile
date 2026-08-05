/**
 * GoCloud Service Worker
 * Implements caching strategies and offline support
 * Version: 2.0.1
 */

const CACHE_VERSION = 'gocloud-v2.0.1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/about.html',
  '/service.html',
  '/contact.html',
  '/css/main.min.css',
  '/css/mobile-menu.min.css',
  '/js/main.min.js',
  '/js/lazy-load.js',
  '/images/gocloud logo.webp',
  '/offline.html'
];

// Maximum cache sizes
const MAX_DYNAMIC_CACHE = 50;
const MAX_IMAGE_CACHE = 100;

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('[SW] Error caching static assets:', error);
      })
  );

  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('gocloud-') && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE && cacheName !== IMAGE_CACHE)
          .map(cacheName => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );

  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip external requests (CDN, APIs, etc.)
  if (url.origin !== location.origin) {
    return;
  }

  // Handle image requests
  if (request.destination === 'image') {
    event.respondWith(handleImageRequest(request));
    return;
  }

  // Handle static assets
  if (isStaticAsset(request.url)) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Handle HTML pages
  if (request.headers.get('Accept').includes('text/html')) {
    event.respondWith(handlePageRequest(request));
    return;
  }

  // Default: network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseClone);
            trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Handle static asset requests (cache first)
function handleStaticRequest(request) {
  return caches.match(request)
    .then(response => {
      return response || fetch(request)
        .then(fetchResponse => {
          if (!fetchResponse.ok) return fetchResponse;
          return caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, fetchResponse.clone());
            return fetchResponse;
          });
        });
    })
    .catch(() => {
      console.error('[SW] Failed to fetch static asset:', request.url);
    });
}

// Handle image requests (cache first, with size limit)
function handleImageRequest(request) {
  return caches.match(request)
    .then(response => {
      return response || fetch(request)
        .then(fetchResponse => {
          if (!fetchResponse.ok) return fetchResponse;
          return caches.open(IMAGE_CACHE).then(cache => {
            cache.put(request, fetchResponse.clone());
            trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE);
            return fetchResponse;
          });
        });
    })
    .catch(() => {
      // Return placeholder image if offline
      return caches.match('/images/placeholder.webp');
    });
}

// Handle HTML page requests (network first, cache fallback)
function handlePageRequest(request) {
  return fetch(request)
    .then(response => {
      if (response.ok) {
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, responseClone);
        });
      }
      return response;
    })
    .catch(() => {
      return caches.match(request)
        .then(response => {
          return response || caches.match('/offline.html');
        });
    });
}

// Check if URL is a static asset
function isStaticAsset(url) {
  return url.includes('/css/') ||
         url.includes('/js/') ||
         url.includes('/fonts/') ||
         url.endsWith('.css') ||
         url.endsWith('.js');
}

// Trim cache to maximum size
function trimCache(cacheName, maxItems) {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        cache.delete(keys[0]).then(() => {
          trimCache(cacheName, maxItems);
        });
      }
    });
  });
}

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data.action === 'clearCache') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[SW] Service worker loaded');
