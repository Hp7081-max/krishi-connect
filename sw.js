/* Krishi Connect — service worker (PWA)
   Rules, kept simple on purpose:
   - Network FIRST: when the internet works, users always get the newest code (no stale-file bugs).
   - If the internet is down: the last visited page + files come from cache, or /offline.html.
   - NEVER touches /api/ or /socket.io/ (chat, bids, payments, AI scans always go to the server).
   Bump VERSION when you change this file's caching rules. */
"use strict";

var VERSION = "v1";
var CACHE = "kc-" + VERSION;
var PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("kc-") === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                   // fonts, CDN etc.: browser handles them
  if (url.pathname.indexOf("/api/") === 0) return;                   // live data: never cache
  if (url.pathname.indexOf("/socket.io/") === 0) return;             // chat / real-time: never cache
  if (url.pathname === "/sw.js") return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/offline.html");
        return Response.error();
      });
    })
  );
});
