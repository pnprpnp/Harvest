const CACHE_NAME = "harvest-app-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./icon.png",
  "./manifest.json"
];

// インストール時にキャッシュ
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// リクエスト時にキャッシュ優先
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});