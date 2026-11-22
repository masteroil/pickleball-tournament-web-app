const cacheName = "pickleball-shell-v1";
self.addEventListener("install", (e) =>
  e.waitUntil(
    (async () => {
      const c = await caches.open(cacheName);
      const res = await fetch("/");
      const html = await res.clone().text();
      await c.put("/", res);
      await c.addAll(
        [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
          (x) => x[1],
        ),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (e.request.mode === "navigate")
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
  else if (u.pathname.startsWith("/assets/"))
    e.respondWith(caches.match(e.request).then((v) => v || fetch(e.request)));
});
