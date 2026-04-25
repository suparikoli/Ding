// Ding Field service worker — app-shell cache + queued POST replay.

const SHELL_CACHE = 'ding-shell-v1';
const RUNTIME_CACHE = 'ding-runtime-v1';
const SHELL_ASSETS = [
    '/field/',
    '/field/index.html',
    '/field/app.js',
    '/field/style.css',
    '/field/manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return; // POSTs are handled by the page (queued in IDB)
    const url = new URL(req.url);

    // Network-first for API calls — fall back to runtime cache.
    if (url.pathname.startsWith('/api/method/ding.field_sales.api.')) {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone));
                    return res;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    // Cache-first for shell + assets.
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                const clone = res.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
                return res;
            }).catch(() => cached);
        })
    );
});
