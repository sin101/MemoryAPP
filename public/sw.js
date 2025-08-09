self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('memoryapp-demo-v1').then(cache =>
      cache.addAll(['/','/index.html','/style.css','/app.js','/suggestions.js','/manifest.json'])
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});

