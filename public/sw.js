// Only static assets and the offline page are cached; HTML/POSTs always go to the network (auth + per-user data).
const CACHE = "td-__V__";

addEventListener("install", (e) => {
  skipWaiting();
  // Fails (and is skipped) when the Authentik session is expired: the redirect is cross-origin.
  e.waitUntil(fetch("/offline").then((r) => r.ok && caches.open(CACHE).then((c) => c.put("/offline", r))).catch(() => {}));
});

addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => clients.claim()));
});

addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  // Pass navigations through untouched (incl. login redirects); fall back only on network failure.
  if (r.mode === "navigate") e.respondWith(fetch(r).catch(() => caches.match("/offline")));
  else if (u.pathname.startsWith("/static/"))
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(r, c)); }
      return res;
    })));
});
