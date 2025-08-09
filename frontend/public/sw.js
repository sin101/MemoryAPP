/* global importScripts, workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);
workbox.precaching.cleanupOutdatedCaches();

workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new workbox.strategies.NetworkFirst({ cacheName: 'api-cache' })
);

workbox.routing.registerRoute(
  ({ request }) => request.destination === 'document',
  new workbox.strategies.NetworkFirst({ cacheName: 'pages' })
);
