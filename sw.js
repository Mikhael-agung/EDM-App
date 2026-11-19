// Service worker Log WEDM.
// NAIKKAN versi ini tiap deploy supaya HP ambil file baru.
const CACHE = "wedm-v1";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // satu per satu: kalau ada file hilang (mis. config.js), install tetap jalan
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // JANGAN pernah cache API/auth Supabase: data dan sesi harus selalu segar
  if (
    url.hostname.endsWith("supabase.co") ||
    url.hostname.endsWith("supabase.in")
  )
    return;

  // file milik app sendiri: online -> ambil terbaru, offline -> dari cache
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then(
              (r) =>
                r ||
                (req.mode === "navigate"
                  ? caches.match("index.html")
                  : Response.error()),
            ),
        ),
    );
    return;
  }

  // library CDN (supabase-js): pakai cache dulu, perbarui di belakang
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || net;
    }),
  );
});
