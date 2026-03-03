const CACHE_NAME = 'komissionka-cache-v1';
const urlsToCache = [
  '/',
  '/styles/globals.css',
  // Добавьте сюда другие важные ресурсы, которые должны быть доступны оффлайн
  // например, '/images/logo.png', '/scripts/main.js'
];

self.addEventListener('install', (event) => {
  // @ts-ignore
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // @ts-ignore
  event.respondWith(
    // @ts-ignore
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // @ts-ignore
        return fetch(event.request).then(
          (response) => {
            // Check if we received a valid response
            // @ts-ignore
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            // @ts-ignore
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // @ts-ignore
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  // @ts-ignore
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
