// 오프라인 지원용 서비스 워커.
// 네트워크 우선: 온라인이면 항상 최신 파일을 받고, 오프라인일 때만 캐시를 쓴다.
const CACHE = 'yomu-v2';
const CORE = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/ui.js',
  'js/storage.js',
  'js/speech.js',
  'js/kana.js',
  'data/kana.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())),
      ),
  );
});
