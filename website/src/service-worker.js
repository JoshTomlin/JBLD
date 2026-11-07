/* eslint-disable no-restricted-globals */

import { clientsClaim } from "workbox-core";
import { pgliteVersion, pgliteRuntimeFiles } from "./data/databaseRuntime";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";

// Workbox's size limit excludes the database binaries from the app precache.
// Warm their versioned cache at install so the first offline reopen also works.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("jbld-database-runtime").then((cache) => cache.addAll(
    pgliteRuntimeFiles.map((file) =>
      new URL(`${process.env.PUBLIC_URL || "."}/pglite/${pgliteVersion}/${file}`, self.location.href).href
    )
  )));
});

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST || []);

registerRoute(
  ({ request }) => request.mode === "navigate",
  createHandlerBoundToURL(`${process.env.PUBLIC_URL}/index.html`)
);

// WASM/data fetches have no script destination. Cache them with their
// versioned ESM files so the local database can reopen offline.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes("/pglite/"),
  new CacheFirst({ cacheName: "jbld-database-runtime" })
);

registerRoute(
  ({ request }) => request.destination === "style" || request.destination === "script",
  new StaleWhileRevalidate({
    cacheName: "jbld-static-assets",
  })
);

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "jbld-images",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
