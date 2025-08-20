const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `glossonaut-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `glossonaut-runtime-${CACHE_VERSION}`;

// Recursos críticos que se precachean para carga instantánea
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/reinforce.js',
  '/data/pictures/logo.png',
  '/data/pictures/logoG.png',
  '/data/pictures/default.png',
  '/data/pictures/text-lesson.png',
  '/data/pictures/exam.png',
  '/data/pictures/booster.png',
  '/data/pictures/practice-mistakes.png',
  '/data/pictures/vocabulary.png',
  '/data/pictures/Phrases.png',
  '/data/pictures/structures.png',
  '/data/pictures/conectors.png',
  '/data/pictures/tenses.png'
  
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (!k.includes(CACHE_VERSION)) {
          return caches.delete(k);
        }
      }))
    ).then(() => self.clients.claim())
  );
});

// Estrategias:
// - HTML (navegación): Network-first con fallback a cache para offline
// - Estáticos (CSS/JS/Imágenes): Stale-while-revalidate
// - Datos JSON de niveles: Cache-first con actualización en segundo plano
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejar GET
  if (req.method !== 'GET') return;

  // Navegación HTML
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith((async () => {
      try {
        const networkRes = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, networkRes.clone());
        return networkRes;
      } catch (_) {
        return (await caches.match(req))
            || (await caches.match('/index.html'))
            || (await caches.match('/'));
      }
    })());
    return;
  }

  // Datos JSON
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, networkRes.clone()));
            return networkRes;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Estáticos: CSS/JS/Imágenes
  if ([
    'style', 'script', 'image', 'font'
  ].includes(req.destination)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, networkRes.clone()));
            return networkRes;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
});


