/* 場站操作限制查詢：離線快取（與 HTML 放在同一個資料夾） */
const CACHE = "jx-station-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;            /* 即時資料（空位、天氣、同步）不快取 */
  /* 先連網拿最新版；沒網路時才用上次存下的版本 */
  e.respondWith(
    fetch(r).then(res => {
      if (res && res.ok && !u.search) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match(u.pathname)))
  );
});
