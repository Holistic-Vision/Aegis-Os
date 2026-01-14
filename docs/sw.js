const CACHE = "aegis-v0-1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./router.js",
  "./db.js",
  "./ai.js",
  "./manifest.webmanifest",
  "./i18n/fr.json",
  "./i18n/en.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  e.respondWith((async () => {
    const req = e.request;
    const url = new URL(req.url);
    // Network-first for JSON library feed if you add later; otherwise cache-first
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, res.clone());
    return res;
  })());
});
