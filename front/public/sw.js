// Minimal service worker for PWA installability.
//
// Chrome and other Chromium browsers only surface the "Install app" prompt when a service worker
// with a `fetch` handler is registered. This worker intentionally does no caching: it forwards
// every request straight to the network so we get installability and standalone launch without
// taking on the risk of serving stale assets. Offline support can be layered on later.
self.addEventListener("install", () => {
  // Activate this worker as soon as it finishes installing, replacing any previous version.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all open clients immediately so the active worker is always the latest one.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through: let the browser handle the request normally (no caching).
});
