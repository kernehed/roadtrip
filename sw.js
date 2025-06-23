const cacheName = 'kerneheds-v1';
const filesToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(cacheName).then(c => c.addAll(filesToCache)));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
