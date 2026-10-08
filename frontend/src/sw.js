/*
 * De service worker, alleen om de app te kunnen installeren. Hij bewaart
 * niets: alles gaat gewoon naar de dienst, zodat je nooit een oude stand ziet.
 */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Doorgeven zoals het binnenkomt; zonder dit biedt Chrome het installeren niet aan.
self.addEventListener('fetch', () => {});
