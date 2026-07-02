const CACHE_NAME = 'trustkey-v4';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Push notifications ───────────────────────────────────────────────────────
// The server posts a JSON payload { title, body, tag, data:{ url } }. Show it as a
// system notification even when the app is closed (works in the installed PWA).
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { body: event.data ? event.data.text() : '' }; }

  const title = payload.title || 'TrustKey';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    vibrate: [80, 40, 80],
    data: { url: '/', ...(payload.data || {}) },
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // "Share your location" ping: if the tech's app is already open, tell it to grab GPS
    // now (no tap needed). If it's closed, the notification above lets them tap to open.
    if (options.data.type === 'share-location') {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of wins) c.postMessage({ type: 'share-location' });
    }
  })());
});

// Tapping a notification focuses an open app window (or opens one).
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) {
        await c.focus();
        if (data.type === 'share-location') c.postMessage({ type: 'share-location' });
        return;
      }
    }
    // App was closed — open it. On load the tech's app grabs GPS if they're en route,
    // which fulfills the waiting client's ETA request.
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || new Response('Offline', { status: 503 })))
  );
});
