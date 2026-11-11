/* Prelevox – service worker : coque de l'app hors ligne. Ne met JAMAIS en cache une requête vers un nœud ou un serveur. */
const CACHE = 'prelevox-v7';
const VENDOR = 'prelevox-vendor-monero-ts-0.11.22'; // module Monero (~4 Mo) : mis en cache à la première synchro, puis servi hors ligne
const ASSETS = ['./', './index.html', './styles.css?v=7', './manifest.json', './js/theme.js?v=7', './js/keys.js?v=7', './js/vault.js?v=7', './js/demo.js?v=7', './js/chart.js?v=7', './js/keyimages.js?v=7', './js/sync.js?v=7', './js/price.js?v=7', './js/ptr.js?v=7', './js/app.js?v=7', './js/register-sw.js?v=7',
  './fonts/inter-latin.woff2', './icons/mark.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-32.png', './icons/apple-touch-icon-180.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE && x !== VENDOR).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // nœuds, serveurs : réseau direct, sans cache
  if (url.pathname.indexOf('/vendor/') >= 0) { // fichiers versionnés : cache d'abord
    e.respondWith(caches.open(VENDOR).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => { if (res.ok && res.type === 'basic') c.put(e.request, res.clone()); return res; }))));
    return;
  }
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

// Alerte de prix envoyée par le serveur prelevox-push : toujours afficher une notification visible
// (iOS retire l'abonnement si un push n'affiche rien). Format « Declarative Web Push » (web_push: 8030).
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) {}
  const n = d.notification || {};
  const title = n.title || 'Alerte de prix XMR';
  const opts = { body: n.body || 'Une de vos alertes de prix Prelevox s\u2019est déclenchée. Touchez pour voir le cours.', tag: n.tag || 'px-alerte', lang: 'fr',
    icon: './icons/icon-192.png', badge: './icons/favicon-32.png', data: { url: n.navigate || './#/prix' }, renotify: true };
  e.waitUntil(self.registration.showNotification(title, opts));
});
// Toucher la notification ouvre (ou ramène) Prelevox sur l'onglet Prix.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './#/prix', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { if (c.navigate) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
