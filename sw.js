/* Prelevox – service worker : coque de l'app hors ligne. Ne met JAMAIS en cache une requête vers un nœud ou un serveur. */
const CACHE = 'prelevox-v2';
const ASSETS = ['./', './index.html', './styles.css?v=2', './manifest.json', './js/keys.js?v=2', './js/vault.js?v=2', './js/demo.js?v=2', './js/chart.js?v=2', './js/sync.js?v=2', './js/app.js?v=2', './js/register-sw.js?v=2',
  './fonts/inter-latin.woff2', './icons/mark.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-32.png', './icons/apple-touch-icon-180.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // nœuds, serveurs : réseau direct, sans cache
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
