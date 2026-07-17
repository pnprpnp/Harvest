const CACHE_PREFIX = "harvestnavi-app-";
const META_CACHE_NAME = "harvestnavi-meta-v1";
const META_URL = new URL("__harvestnavi_cache_meta__", self.registration.scope).toString();
const INDEX_URL = new URL("index.html", self.registration.scope).toString();
const APP_SHELL_PATHS = [
  "manifest.json",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "app-icon.png",
  "welcome-screen.png",
  "シミュのアイコン.svg",
  "モニターのアイコン.svg",
  "記録のアイコン.svg"
];

function sanitizeVersion(value){
  const text = String(value || "").trim().toLowerCase();
  if(!/^[a-z0-9_-]{8,80}$/.test(text)) throw new Error("更新バージョンが正しくありません");
  return text;
}

async function hashSource(source){
  const bytes = new TextEncoder().encode(String(source || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

async function readMeta(){
  const cache = await caches.open(META_CACHE_NAME);
  const response = await cache.match(META_URL);
  if(!response) return null;
  try{
    const value = await response.json();
    if(!value || typeof value !== "object" || !value.activeCache) return null;
    return value;
  }catch(e){
    return null;
  }
}

async function writeMeta(meta){
  const cache = await caches.open(META_CACHE_NAME);
  await cache.put(META_URL, new Response(JSON.stringify(meta), {
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "no-store"
    }
  }));
}

async function fetchNetworkResource(url, version){
  const target = new URL(url, self.registration.scope);
  target.searchParams.set("__hn_sw_network", String(version || Date.now()));
  const response = await fetch(target.toString(), {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Cache-Control": "no-cache" }
  });
  if(!response.ok) throw new Error(target.pathname + "を取得できませんでした");
  return response;
}

async function buildVersionCache(version, indexSource){
  const safeVersion = sanitizeVersion(version);
  const cacheName = CACHE_PREFIX + safeVersion;
  await caches.delete(cacheName);
  const cache = await caches.open(cacheName);

  try{
    const source = String(indexSource || "");
    if(source.length < 1000 || source.length > 3000000 || !source.includes("<title>Harvestnavi</title>")){
      throw new Error("最新版の内容を確認できません");
    }
    await cache.put(INDEX_URL, new Response(source, {
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-store"
      }
    }));

    await Promise.all(APP_SHELL_PATHS.map(async path => {
      const canonicalUrl = new URL(path, self.registration.scope).toString();
      try{
        const response = await fetchNetworkResource(canonicalUrl, safeVersion);
        await cache.put(canonicalUrl, response);
      }catch(e){
        // index.htmlがあればアプリは起動できるため、画像類の失敗だけでは更新を中止しない。
      }
    }));
    return cacheName;
  }catch(e){
    await caches.delete(cacheName);
    throw e;
  }
}

async function seedApprovedVersionIfNeeded(){
  const existing = await readMeta();
  if(existing?.activeCache && await caches.has(existing.activeCache)) return existing;

  const response = await fetchNetworkResource(INDEX_URL, "initial-" + Date.now());
  const source = await response.text();
  const version = await hashSource(source);
  const cacheName = await buildVersionCache(version, source);
  const meta = {
    activeCache: cacheName,
    activeVersion: version,
    previousCache: "",
    previousVersion: "",
    updatedAt: new Date().toISOString()
  };
  await writeMeta(meta);
  return meta;
}

async function cleanupVersionCaches(meta){
  const keep = new Set([META_CACHE_NAME, meta?.activeCache, meta?.previousCache].filter(Boolean));
  const names = await caches.keys();
  await Promise.all(names.map(name => (
    name.startsWith(CACHE_PREFIX) && !keep.has(name) ? caches.delete(name) : Promise.resolve(false)
  )));
}

async function stageAndActivateUpdate(version, indexSource){
  const safeVersion = sanitizeVersion(version);
  const meta = await seedApprovedVersionIfNeeded();
  if(meta.activeVersion === safeVersion){
    return { ...meta, unchanged: true };
  }

  const cacheName = await buildVersionCache(safeVersion, indexSource);
  const nextMeta = {
    activeCache: cacheName,
    activeVersion: safeVersion,
    previousCache: meta.activeCache || "",
    previousVersion: meta.activeVersion || "",
    updatedAt: new Date().toISOString()
  };
  await writeMeta(nextMeta);
  await cleanupVersionCaches(nextMeta);
  return nextMeta;
}

async function rollbackApprovedVersion(){
  const meta = await readMeta();
  if(!meta?.previousCache || !(await caches.has(meta.previousCache))){
    throw new Error("戻せる安定版がありません");
  }
  const nextMeta = {
    activeCache: meta.previousCache,
    activeVersion: meta.previousVersion || "previous",
    previousCache: meta.activeCache || "",
    previousVersion: meta.activeVersion || "",
    updatedAt: new Date().toISOString()
  };
  await writeMeta(nextMeta);
  await cleanupVersionCaches(nextMeta);
  return nextMeta;
}

async function getActiveCachedResponse(request){
  const meta = await readMeta();
  if(!meta?.activeCache) return null;
  const cache = await caches.open(meta.activeCache);
  const url = new URL(request.url);
  if(request.mode === "navigate") return cache.match(INDEX_URL);
  url.search = "";
  url.hash = "";
  return cache.match(url.toString());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await seedApprovedVersionIfNeeded();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await seedApprovedVersionIfNeeded();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if(request.method !== "GET") return;
  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;
  if(url.searchParams.has("__hncheck") || url.searchParams.has("__hn_sw_network")) return;

  event.respondWith((async () => {
    const cached = await getActiveCachedResponse(request);
    if(cached) return cached;
    return fetch(request);
  })());
});

self.addEventListener("message", event => {
  const port = event.ports && event.ports[0];
  const reply = value => {
    if(port) port.postMessage(value);
  };
  event.waitUntil((async () => {
    try{
      const data = event.data || {};
      if(data.type === "HARVESTNAVI_STAGE_UPDATE"){
        const meta = await stageAndActivateUpdate(data.version, data.indexSource);
        reply({ ok: true, meta });
        return;
      }
      if(data.type === "HARVESTNAVI_ROLLBACK"){
        const meta = await rollbackApprovedVersion();
        reply({ ok: true, meta });
        return;
      }
      if(data.type === "HARVESTNAVI_GET_CACHE_STATE"){
        const meta = await readMeta();
        reply({ ok: true, meta });
        return;
      }
      throw new Error("未対応の操作です");
    }catch(e){
      reply({ ok: false, message: String(e?.message || e) });
    }
  })());
});
