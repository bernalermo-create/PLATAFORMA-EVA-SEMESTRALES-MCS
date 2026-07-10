// Service worker mínimo — Fase 1: cachea el "app shell" para que la
// plataforma abra offline. La cola de sincronización de escaneos
// (Background Sync) se agrega en la Fase 2, junto con IndexedDB.
const CACHE = 'pev-shell-v1';
const SHELL = [
  './', './index.html', './styles.css', './app.js',
  './services/store.js', './services/qr.js', './services/sync.js',
  './modules/dashboard.js', './modules/institucional.js',
  './modules/evaluaciones.js', './modules/hojasQR.js', './modules/escaneo.js',
  './modules/resultados.js', './modules/config.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
