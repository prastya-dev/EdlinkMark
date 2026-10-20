var CACHE = 'edlinkmark-v3';
var SHELL = ['./', './index.html', './manifest.webmanifest',
             './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); })
    .then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request, url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== self.location.origin) return;  // API POST & berkas luar: lewat
  if(url.pathname.indexOf('/api/') === 0) return;                          // proxy EdLink: jangan di-cache

  if(req.mode === 'navigate'){
    // halaman selalu ambil versi terbaru, cache hanya untuk offline
    e.respondWith(fetch(req).then(function(r){
      var copy = r.clone();
      caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
      return r;
    }).catch(function(){ return caches.match('./index.html'); }));
    return;
  }

  e.respondWith(caches.match(req).then(function(hit){ return hit || fetch(req); }));
});
