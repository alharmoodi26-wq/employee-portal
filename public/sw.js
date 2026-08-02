const CACHE = "eihg-portal-v3";

const PRECACHE = ["/", "/eihg-logo.jpeg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from same origin
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Skip Firebase, API, and _next/data requests — always go to network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis")
  ) {
    return;
  }

  const isHtml =
    request.mode === "navigate" ||
    request.headers.get("Accept")?.includes("text/html");

  // Pages/HTML: network-first so a fresh deploy shows up immediately.
  // Falls back to cache only when offline.
  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(
          () =>
            caches.match(request).then(
              (cached) =>
                cached ??
                caches.match("/") ??
                new Response("Offline", { status: 503 })
            )
        )
    );
    return;
  }

  // Other same-origin assets (logo, icons): cache-first, refresh in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => new Response("Offline", { status: 503 }));

      return cached ?? networkFetch;
    })
  );
});
