/* web-to-github-pwa Service Worker
 * 策略：预缓存入口页与同目录静态资源 + 运行时 stale-while-revalidate。
 * CACHE_VERSION 每次发布可改，用来淘汰旧缓存。
 */
const CACHE_VERSION = '20261009';
const CACHE_NAME = 'pwa-cache-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  'vocab-quiz.html',
  'styles.css',
  'vocab-quiz.css',
  'vocab-quiz.js',
  'data/vocab-quiz.js',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('pwa-cache-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只处理同源 GET
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      // 有缓存先用缓存（快），后台更新；无缓存走网络
      return cached || network;
    })
  );
});
