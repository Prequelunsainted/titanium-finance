// Service worker: guarda o app no aparelho para funcionar offline.
// Ao publicar uma nova versão, troque o número em CACHE (e VERSION em app.js).

const CACHE = "titanium-mobile-2.1.0";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "core.js",
  "store.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).catch(() =>
          request.mode === "navigate" ? caches.match("index.html") : Response.error(),
        ),
    ),
  );
});
