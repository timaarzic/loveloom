// Network-only: no private messages, room data or pages are cached offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if(event.request.method==='GET') event.respondWith(fetch(event.request));
});
