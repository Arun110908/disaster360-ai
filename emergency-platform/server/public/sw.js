const C='d360-shell-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./manifest.json']))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api'))return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
