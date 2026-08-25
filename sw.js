/* 오프라인 재생용 서비스워커. CACHE_NAME은 build.py가 version.js에 써 넣는다.
 *
 * 정책:
 *  - 오디오(mp3)는 크고 바뀌지 않으므로 캐시 우선.
 *  - HTML/JS/CSS/JSON은 네트워크 우선. 그래야 갱신이 폰에 바로 반영된다.
 *    (예전에 캐시 우선이라 갱신된 코드가 반영되지 않는 문제가 있었다.)
 *    네트워크가 안 되면 캐시로 넘어가므로 오프라인 재생은 그대로 된다.
 */
importScripts("version.js");
var CACHE = self.CACHE_NAME;

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        return n === CACHE ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isAudio(url) {
  return /\.mp3(\?|$)/i.test(url);
}

function putCopy(req, res) {
  if (res && res.ok && res.type === "basic") {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = e.request.url;

  if (isAudio(url)) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(e.request).then(function (res) {
          return putCopy(e.request, res);
        });
      })
    );
    return;
  }

  // 코드·데이터는 네트워크 우선
  e.respondWith(
    fetch(e.request).then(function (res) {
      return putCopy(e.request, res);
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match("index.html", { ignoreSearch: true });
      });
    })
  );
});
