// Network-only: no private messages, room data or pages are cached offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if(event.request.method==='GET') event.respondWith(fetch(event.request));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const target = new URL(payload.url || '?open=chat', self.registration.scope).href;
  const icon = new URL('icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(payload.title || 'LoveLoom', {
    body: payload.body || 'В вашем пространстве появилось что-то новое 💌',
    icon,
    badge: icon,
    tag: payload.tag || 'loveloom-update',
    renotify: true,
    data: { url: target },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
