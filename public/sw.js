const CACHE_VERSION = 'v1.0.2';
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
  '/data/pictures/tenses.png',
  // Datos JSON precacheados para uso offline
  '/data/categories.json',
  '/data/conectors/lvl1.json',
  '/data/conectors/lvl2.json',
  '/data/conectors/lvl3.json',
  '/data/conectors/lvl4.json',
  '/data/phrases/lvl1.json',
  '/data/phrases/lvl2.json',
  '/data/phrases/lvl3.json',
  '/data/phrases/lvl4.json',
  '/data/structures/lvl1.json',
  '/data/structures/lvl2.json',
  '/data/structures/lvl3.json',
  '/data/structures/lvl4.json',
  '/data/tenses/lvl1.json',
  '/data/tenses/lvl2.json',
  '/data/tenses/lvl3.json',
  '/data/tenses/lvl4.json',
  '/data/vocabulary/lvl1.json',
  '/data/vocabulary/lvl2.json',
  '/data/vocabulary/lvl3.json',
  '/data/vocabulary/lvl4.json',
  '/data/placement/texts/a1.json',
  '/data/placement/texts/a2.json',
  '/data/placement/texts/b1.json',
  '/data/placement/texts/b2.json',
  '/data/wordlists/cefr/a1.json',
  '/data/wordlists/cefr/a2.json',
  '/data/wordlists/cefr/b1.json',
  '/data/wordlists/cefr/b2.json'
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
// - HTML (navegación): Cache-first (fetch sólo si falta). Actualización por versión del SW.
// - Estáticos (CSS/JS/Imágenes): Cache-first (fetch sólo si falta). Actualización por versión del SW.
// - Datos JSON: Cache-first (fetch sólo si falta). Actualización por versión del SW.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejar GET
  if (req.method !== 'GET') return;

  // Ignorar esquemas no http/https (ej. chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navegación HTML (cache-first)
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const networkRes = await fetch(req);
        const copy = networkRes.clone();
        event.waitUntil((async () => {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(req, copy);
        })());
        return networkRes;
      } catch (_) {
        return (await caches.match('/index.html'))
            || (await caches.match('/'));
      }
    })());
    return;
  }

  // Datos JSON (cache-first)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const networkRes = await fetch(req);
        const copy = networkRes.clone();
        event.waitUntil((async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(req, copy);
        })());
        return networkRes;
      } catch (_) {
        return cached; // puede ser undefined si no hay
      }
    })());
    return;
  }

  // Estáticos: CSS/JS/Imágenes (cache-first)
  if (['style', 'script', 'image', 'font'].includes(req.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const networkRes = await fetch(req);
        const copy = networkRes.clone();
        event.waitUntil((async () => {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(req, copy);
        })());
        return networkRes;
      } catch (_) {
        return cached; // si no hay, dejar que el navegador falle
      }
    })());
    return;
  }
});


