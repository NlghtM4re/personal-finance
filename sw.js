/* ============================================================
   sw.js — Service worker: instant loads + offline app shell.
   Strategy:
   - Supabase (and any non-GET) requests: never intercepted.
   - Navigations: network-first, cached page as offline fallback.
   - Same-origin CSS/JS: network-first so styles always match the
     fresh HTML (stale-while-revalidate caused unstyled first loads
     after every deploy), cache as offline fallback.
   - Other static assets (icons, CDN, fonts): stale-while-revalidate.
   Bump CACHE_VERSION when shipping changes to force a refresh.
   ============================================================ */

const CACHE_VERSION = 'pf-v19';

const PRECACHE = [
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/pages/accounts.html',
  '/pages/add-transaction.html',
  '/pages/budget.html',
  '/pages/recurring.html',
  '/pages/settings.html',
  '/pages/spending.html',
  '/pages/subscriptions.html',
  '/pages/crypto.html',
  '/styles/main.css',
  '/styles/layout.css',
  '/styles/components.css',
  '/styles/dashboard.css',
  '/styles/pages.css',
  '/scripts/data/supabase.js',
  '/scripts/data/store.js',
  '/scripts/data/crypto.js',
  '/scripts/engine/summary.js',
  '/scripts/components/charts.js',
  '/scripts/components/nav.js',
  '/scripts/components/ui.js',
  '/scripts/pages/dashboard.js',
  '/scripts/pages/accounts.js',
  '/scripts/pages/transactions.js',
  '/scripts/pages/add-transaction.js',
  '/scripts/pages/budget.js',
  '/scripts/pages/recurring.js',
  '/scripts/pages/settings.js',
  '/scripts/pages/spending.js',
  '/scripts/pages/subscriptions.js',
  '/scripts/pages/crypto.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* live data + auth go straight to the network, always */
  if (url.hostname.endsWith('.supabase.co')) return;

  /* page navigations: fresh when online, cached shell when offline */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match('/index.html'))
        )
    );
    return;
  }

  /* same-origin CSS/JS: network-first so they never lag behind the HTML */
  const isStyleOrScript = url.origin === self.location.origin &&
    (req.destination === 'style' || req.destination === 'script' ||
     url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));
  if (isStyleOrScript) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  /* other static assets: serve cache immediately, refresh it in the background */
  event.respondWith(
    caches.match(req).then(hit => {
      const refresh = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
