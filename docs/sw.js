// AEGIS Service Worker
// Cache strategy: network-first for HTML/JS/CSS to avoid stale versions on GitHub Pages.
const CACHE_NAME = "aegis-0.9.0-2026-01-15T21:27:42Z";
const CORE = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./router.js",
  "./db.js",
  "./ai.js",
  "./version.json",
  "./data/recipes.json",
  "./data/workouts.json",
  "./data/groceries.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map(u => u + "?v=" + encodeURIComponent(CACHE_NAME)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

function isHtml(req){
  return req.mode === "navigate" || (req.headers.get("accept")||"").includes("text/html");
}
function isAsset(url){
  return url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // SPA navigation: network-first, fallback to cache, then to index.html (offline)
  if (isHtml(req)) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, net.clone());
        return net;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // JS/CSS/JSON: network-first to avoid stale bundles
  if (isAsset(url)) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, net.clone());
        return net;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // Others: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req);
    if (hit) return hit;
    const net = await fetch(req);
    cache.put(req, net.clone());
    return net;
  })());
});
