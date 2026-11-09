// Offline cache for the app's own files. Price feeds are never cached or touched here.
const CACHE = "metal-premium-1.0.0";
const ASSETS = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "favicon.svg",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png", "privacy.html", "privacy.css"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;   // let feed requests go straight to the network
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit =>
    hit || fetch(req).catch(() => req.mode === "navigate" ? caches.match("index.html") : Response.error())));
});
