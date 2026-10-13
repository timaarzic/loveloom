const SHELL={"version":"89cea30868f85d08","urls":["/loveloom/","/loveloom/manifest.webmanifest","/loveloom/icon-192.png","/loveloom/icon-512.png","/loveloom/loveloom-mark.png","/loveloom/_next/static/GUCWnGfKI6lXfCX-_wg3A/_buildManifest.js","/loveloom/_next/static/GUCWnGfKI6lXfCX-_wg3A/_clientMiddlewareManifest.js","/loveloom/_next/static/GUCWnGfKI6lXfCX-_wg3A/_ssgManifest.js","/loveloom/_next/static/chunks/01ce6pg25fldo.js","/loveloom/_next/static/chunks/07_e2h29m3y84.js","/loveloom/_next/static/chunks/0bbiyjfneed49.js","/loveloom/_next/static/chunks/0cz1d0mv5g_q7.js","/loveloom/_next/static/chunks/0lgeyawwh8_kq.css","/loveloom/_next/static/chunks/0s7mvllxht1mo.js","/loveloom/_next/static/chunks/0tijmh_l-fbd3.js","/loveloom/_next/static/chunks/0umf92h1sb77c.js","/loveloom/_next/static/chunks/1fhyt8nmetcxj.js","/loveloom/_next/static/chunks/1t8l_thkppyyz.css","/loveloom/_next/static/chunks/24_5-o9idtfmp.js","/loveloom/_next/static/chunks/27_lnuank5ia5.js","/loveloom/_next/static/chunks/2ndvytbi0w0p1.js","/loveloom/_next/static/chunks/2uizm94qx4cq_.css","/loveloom/_next/static/chunks/2wm3fuycpa6-5.js","/loveloom/_next/static/chunks/39izrhsc5vwz9.js","/loveloom/_next/static/chunks/3mwcrlq3uo-gt.js","/loveloom/_next/static/chunks/4134mi08wrn9b.js","/loveloom/_next/static/chunks/turbopack-2mftluobh0kyn.js","/loveloom/_next/static/media/caveat-cyrillic-700-normal.1fa8ivsk7jg7u.woff2","/loveloom/_next/static/media/caveat-cyrillic-700-normal.3ox17telc49nw.woff","/loveloom/_next/static/media/caveat-cyrillic-ext-700-normal.01jrdi3u_l767.woff","/loveloom/_next/static/media/caveat-cyrillic-ext-700-normal.3e0pryymw5k5y.woff2","/loveloom/_next/static/media/caveat-latin-700-normal.05jlb5hscku72.woff2","/loveloom/_next/static/media/caveat-latin-700-normal.0r62mwb8etlhp.woff","/loveloom/_next/static/media/caveat-latin-ext-700-normal.20roc3v3t_opq.woff","/loveloom/_next/static/media/caveat-latin-ext-700-normal.2xkeu7jqe_l5j.woff2","/loveloom/_next/static/media/lora-cyrillic-ext-wght-normal.2pqk_a31na3qs.woff2","/loveloom/_next/static/media/lora-cyrillic-wght-normal.13yob4i7ia7xm.woff2","/loveloom/_next/static/media/lora-latin-ext-wght-normal.383e1xim-25sy.woff2","/loveloom/_next/static/media/lora-latin-wght-normal.42zqtbxrnmb37.woff2","/loveloom/_next/static/media/lora-math-wght-normal.3lwp9cgoa0a76.woff2","/loveloom/_next/static/media/lora-symbols-wght-normal.1er-a7axweiy3.woff2","/loveloom/_next/static/media/lora-vietnamese-wght-normal.0dua__kiubu8j.woff2","/loveloom/_next/static/media/manrope-cyrillic-ext-wght-normal.1dtltwig2y3wh.woff2","/loveloom/_next/static/media/manrope-cyrillic-wght-normal.1hmx3sz6swr8m.woff2","/loveloom/_next/static/media/manrope-greek-wght-normal.37b2k1x9f-55d.woff2","/loveloom/_next/static/media/manrope-latin-ext-wght-normal.0-hru0xfwhnbp.woff2","/loveloom/_next/static/media/manrope-latin-wght-normal.1p_a2k8qd5zhp.woff2","/loveloom/_next/static/media/manrope-vietnamese-wght-normal.3xvzy9_grgcx4.woff2","/loveloom/_next/static/media/neucha-cyrillic-400-normal.0ra33gul6u2yc.woff","/loveloom/_next/static/media/neucha-cyrillic-400-normal.2g90846skjo2u.woff2","/loveloom/_next/static/media/neucha-latin-400-normal.0imf5za9r-tv2.woff","/loveloom/_next/static/media/neucha-latin-400-normal.2ftwr_r6gu0sq.woff2"]};
// SHELL is injected only into the static beta build. Dynamic/local pages and
// authenticated API responses must never enter CacheStorage.
const shell = typeof SHELL === 'undefined' ? null : SHELL;
const shellCache = shell ? 'loveloom-public-shell-' + shell.version : null;
self.addEventListener('install', event => event.waitUntil((async () => {
  if (shell) await (await caches.open(shellCache)).addAll(shell.urls);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('loveloom-public-shell-') && key !== shellCache) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(!shell || url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate' && url.pathname===new URL(self.registration.scope).pathname){
    event.respondWith(fetch(event.request).catch(async()=> (await caches.open(shellCache)).match(shell.urls[0])));
  }else if(!url.search && shell.urls.includes(url.pathname)){
    event.respondWith((async()=> (await (await caches.open(shellCache)).match(url.pathname)) || fetch(event.request))());
  }
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const requested = new URL(payload.url || '?open=chat', self.registration.scope);
  const target = requested.origin===self.location.origin && requested.pathname===new URL(self.registration.scope).pathname ? requested.href : self.registration.scope;
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
