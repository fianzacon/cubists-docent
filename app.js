/* 큐비스트 도슨트 플레이어 — DATA는 index.html에서 주입된다 */
(function () {
  "use strict";

  var TRACKS = window.DATA.tracks;
  var KEY = "cubists-docent-v1";
  var audio = new Audio();
  audio.preload = "metadata";

  var cur = -1;
  var curSeg = -1;
  var rate = 1;
  var follow = true;      // 읽는 문단만 밝게 하고 따라 스크롤
  var doneSet = {};

  /* ── 저장/복원 (실패해도 동작해야 한다) ── */
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      rate = s.rate || 1;
      doneSet = s.done || {};
      if (typeof s.follow === "boolean") follow = s.follow;
      return s;
    } catch (e) { return {}; }
  }
  function save(extra) {
    try {
      var s = { rate: rate, done: doneSet, follow: follow,
                id: cur >= 0 ? TRACKS[cur].id : null,
                at: audio.currentTime || 0 };
      if (extra) for (var k in extra) s[k] = extra[k];
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* 사파리 비공개 모드 등 */ }
  }

  /* ── DOM ── */
  var $ = function (s) { return document.querySelector(s); };
  var listEl = $("#tracklist");
  var player = $("#player");
  var nowEl = $("#now");
  var seek = $("#seek");
  var tCur = $("#tcur");
  var tDur = $("#tdur");
  var playBtn = $("#play");
  var playIcon = $("#playicon");

  var ICON_PLAY = "M8 5v14l11-7z";
  var ICON_PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), x = Math.floor(s % 60);
    return m + ":" + (x < 10 ? "0" : "") + x;
  }

  /* ── 목록 렌더 ── */
  TRACKS.forEach(function (t, i) {
    var li = document.createElement("li");
    li.dataset.i = i;

    var btn = document.createElement("button");
    btn.className = "trackbtn";
    btn.innerHTML =
      '<span class="num">' + t.id + "</span>" +
      '<span class="tt">' + esc(t.title) +
      (t.subtitle ? "<small>" + esc(t.subtitle) + "</small>" : "") + "</span>" +
      '<span class="dur">' + (t.ready ? fmt(t.duration) : "준비 중") + "</span>";
    if (t.ready) {
      btn.addEventListener("click", function () { toggleTrack(i); });
    } else {
      li.classList.add("pending");
      btn.addEventListener("click", function () { openSheet(i); });
    }

    var sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = renderSheet(t, i);

    li.appendChild(btn);
    li.appendChild(sheet);
    listEl.appendChild(li);
  });

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  /* 문단마다 재생 위치를 붙여 렌더한다. 누르면 그 지점부터 재생된다. */
  function renderSheet(t, i) {
    var html =
      '<div class="followbar">' +
      '<button type="button" class="followtoggle" data-i="' + i + '">따라가기</button>' +
      "<span>문단을 누르면 그 부분부터 재생됩니다</span></div>";
    var paras = t.paras && t.paras.length ? t.paras : null;

    if (!paras) {
      return html +
        '<div class="look"><b>먼저 이렇게 보세요</b>' + esc(t.look) + "</div>" +
        '<div class="closing"><b>한 줄 정리</b>' + esc(t.closing) + "</div>";
    }

    paras.forEach(function (p, pi) {
      var attrs = ' class="seg%C" data-i="' + i + '" data-p="' + pi +
                  '" data-t="' + p.t + '"';
      if (p.kind === "look") {
        html += "<div" + attrs.replace("%C", " look") + ">" +
                "<b>먼저 이렇게 보세요</b>" + esc(t.look) + "</div>";
      } else if (p.kind === "closing") {
        html += "<div" + attrs.replace("%C", " closing") + ">" +
                "<b>한 줄 정리</b>" + esc(p.text) + "</div>";
      } else {
        html += "<p" + attrs.replace("%C", "") + ">" + esc(p.text) + "</p>";
      }
    });
    return html;
  }

  var lis = listEl.querySelectorAll("li");

  function paint() {
    for (var i = 0; i < lis.length; i++) {
      lis[i].classList.toggle("playing", i === cur);
      lis[i].classList.toggle("done", !!doneSet[TRACKS[i].id]);
    }
  }

  /* ── 재생 ── */
  function openSheet(i) {
    for (var k = 0; k < lis.length; k++) {
      lis[k].querySelector(".sheet").classList.toggle("open", k === i);
    }
  }

  function loadTrack(i, at) {
    cur = i;
    audio.src = TRACKS[i].file;
    audio.playbackRate = rate;
    if (at) {
      audio.addEventListener("loadedmetadata", function once() {
        audio.removeEventListener("loadedmetadata", once);
        try { audio.currentTime = at; } catch (e) {}
      });
    }
    nowEl.innerHTML = "<b>" + TRACKS[i].id + ". " + esc(TRACKS[i].title) + "</b>";
    tDur.textContent = fmt(TRACKS[i].duration);
    seek.max = TRACKS[i].duration || 1;
    seek.value = at || 0;
    player.classList.add("on");
    document.body.classList.add("playing-open");
    openSheet(i);
    paint();
    curSeg = -1;
    markSegment(at || 0);
    setMediaSession(i);
  }

  function play(i, at) {
    if (i !== cur) loadTrack(i, at);
    audio.playbackRate = rate;
    audio.play().catch(function () { /* 사용자 제스처 필요 */ });
  }

  function toggleTrack(i) {
    if (i === cur) {
      if (audio.paused) { audio.play().catch(function () {}); }
      else { audio.pause(); }
      openSheet(i);
      return;
    }
    play(i);
    lis[i].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function firstReady() {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].ready) return i;
    return -1;
  }
  function nextReady(from, step) {
    for (var i = from; i >= 0 && i < TRACKS.length; i += step) {
      if (TRACKS[i].ready) return i;
    }
    return -1;
  }

  /* 문단 클릭 → 그 지점으로 이동 / 따라가기 토글 */
  listEl.addEventListener("click", function (e) {
    var tgt = e.target;

    var tog = tgt.closest ? tgt.closest(".followtoggle") : null;
    if (tog) {
      follow = !follow;
      applyFollow();
      save();
      return;
    }

    var seg = tgt.closest ? tgt.closest(".seg") : null;
    if (!seg) return;
    var i = parseInt(seg.dataset.i, 10);
    var at = parseFloat(seg.dataset.t) || 0;
    if (!TRACKS[i].ready) return;
    if (i !== cur) { play(i, at); return; }
    try { audio.currentTime = at; } catch (err) {}
    if (audio.paused) audio.play().catch(function () {});
    curSeg = -1;
    markSegment(at);
  });

  function applyFollow() {
    var bars = listEl.querySelectorAll(".followtoggle");
    for (var i = 0; i < bars.length; i++) bars[i].classList.toggle("on", follow);
    var sheets = listEl.querySelectorAll(".sheet");
    for (var k = 0; k < sheets.length; k++) sheets[k].classList.toggle("follow", follow);
  }

  /* 지금 읽고 있는 문단을 표시하고, 따라가기가 켜져 있으면 화면 가운데로 옮긴다 */
  function markSegment(time) {
    if (cur < 0) return;
    var segs = lis[cur].querySelectorAll(".seg");
    if (!segs.length) return;

    var best = 0;
    for (var k = 0; k < segs.length; k++) {
      if (parseFloat(segs[k].dataset.t) <= time + 0.15) best = k;
    }
    if (best === curSeg) return;
    curSeg = best;

    for (var m = 0; m < segs.length; m++) {
      segs[m].classList.toggle("cur", m === best);
    }
    if (follow && !audio.paused) {
      try {
        segs[best].scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {
        segs[best].scrollIntoView();
      }
    }
  }

  playBtn.addEventListener("click", function () {
    if (cur < 0) { var f = firstReady(); if (f >= 0) play(f); return; }
    if (audio.paused) audio.play().catch(function () {});
    else audio.pause();
  });

  $("#prev").addEventListener("click", function () {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    var p = nextReady(cur - 1, -1);
    if (p >= 0) play(p);
  });
  $("#next").addEventListener("click", function () {
    var n = nextReady(cur + 1, 1);
    if (n >= 0) play(n);
  });
  $("#back15").addEventListener("click", function () {
    audio.currentTime = Math.max(0, audio.currentTime - 15);
  });
  $("#fwd15").addEventListener("click", function () {
    var end = isFinite(audio.duration) ? audio.duration : audio.currentTime + 15;
    audio.currentTime = Math.min(end, audio.currentTime + 15);
  });

  /* ── 배속 ── */
  var rateBtns = document.querySelectorAll("#rate button");
  function applyRate(r) {
    rate = r;
    audio.playbackRate = r;
    for (var i = 0; i < rateBtns.length; i++) {
      rateBtns[i].classList.toggle("sel", parseFloat(rateBtns[i].dataset.r) === r);
    }
    save();
  }
  for (var i = 0; i < rateBtns.length; i++) {
    rateBtns[i].addEventListener("click", function () {
      applyRate(parseFloat(this.dataset.r));
    });
  }

  /* ── 오디오 이벤트 ── */
  audio.addEventListener("play", function () { playIcon.setAttribute("d", ICON_PAUSE); });
  audio.addEventListener("pause", function () { playIcon.setAttribute("d", ICON_PLAY); save(); });
  var lastMark = -1;
  audio.addEventListener("timeupdate", function () {
    if (!seeking) { seek.value = audio.currentTime; tCur.textContent = fmt(audio.currentTime); }
    if (Math.abs(audio.currentTime - lastMark) > 0.5) {
      lastMark = audio.currentTime;
      markSegment(audio.currentTime);
    }
  });
  audio.addEventListener("loadedmetadata", function () {
    if (isFinite(audio.duration)) { seek.max = audio.duration; tDur.textContent = fmt(audio.duration); }
  });
  audio.addEventListener("ended", function () {
    doneSet[TRACKS[cur].id] = 1;
    save();
    var n = nextReady(cur + 1, 1);
    if (n >= 0) play(n);
    else { paint(); playIcon.setAttribute("d", ICON_PLAY); }
  });

  var seeking = false;
  seek.addEventListener("input", function () { seeking = true; tCur.textContent = fmt(seek.value); });
  seek.addEventListener("change", function () {
    seeking = false;
    try { audio.currentTime = parseFloat(seek.value); } catch (e) {}
    markSegment(parseFloat(seek.value));
  });

  window.addEventListener("pagehide", save);
  setInterval(function () { if (!audio.paused) save(); }, 5000);

  /* ── 잠금화면 컨트롤 ── */
  function setMediaSession(i) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: TRACKS[i].id + ". " + TRACKS[i].title,
        artist: "큐비스트: 시각의 혁신가들",
        album: "퐁피두센터 한화 도슨트"
      });
      navigator.mediaSession.setActionHandler("play", function () { audio.play(); });
      navigator.mediaSession.setActionHandler("pause", function () { audio.pause(); });
      navigator.mediaSession.setActionHandler("previoustrack", function () { if (cur > 0) play(cur - 1); });
      navigator.mediaSession.setActionHandler("nexttrack", function () { if (cur < TRACKS.length - 1) play(cur + 1); });
    } catch (e) {}
  }

  /* ── 오프라인 저장 ── */
  var offBtn = $("#offbtn");
  var offStatus = $("#offstatus");

  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    offBtn.disabled = true;
    offStatus.textContent = "이 환경에서는 오프라인 저장을 쓸 수 없습니다. 온라인 상태로 재생하세요.";
  } else {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      reg.update();   // 갱신본이 있으면 바로 가져온다
    }).catch(function () {
      offBtn.disabled = true;
      offStatus.textContent = "오프라인 저장을 준비하지 못했습니다.";
    });
    checkCached();
    offBtn.addEventListener("click", cacheAll);
  }

  function checkCached() {
    if (!window.caches) return;
    var need = TRACKS.filter(function (t) { return t.ready; }).length;
    caches.open(window.DATA.cacheName).then(function (c) {
      return c.keys();
    }).then(function (keys) {
      if (need && keys.length >= need) {
        offStatus.textContent = "저장 완료. 비행기모드에서도 들을 수 있습니다.";
        offStatus.className = "status done";
        offBtn.textContent = "저장됨";
        offBtn.disabled = true;
      }
    }).catch(function () {});
  }

  function cacheAll() {
    offBtn.disabled = true;
    var files = TRACKS.filter(function (t) { return t.ready; })
      .map(function (t) { return t.file; })
      .concat(["./", "index.html", "app.css", "app.js", "data.js"]);
    var n = 0;
    offStatus.className = "status";
    caches.open(window.DATA.cacheName).then(function (cache) {
      return files.reduce(function (p, url) {
        return p.then(function () {
          return cache.add(new Request(url, { cache: "reload" })).catch(function () {});
        }).then(function () {
          n++;
          offStatus.textContent = "저장 중… " + n + " / " + files.length;
        });
      }, Promise.resolve());
    }).then(function () {
      offStatus.textContent = "저장 완료. 비행기모드에서도 들을 수 있습니다.";
      offStatus.className = "status done";
      offBtn.textContent = "저장됨";
    }).catch(function () {
      offBtn.disabled = false;
      offStatus.textContent = "저장에 실패했습니다. 네트워크를 확인하고 다시 눌러보세요.";
    });
  }

  /* ── 초기화 ── */
  var s = load();
  applyRate(rate);
  applyFollow();
  paint();
  if (s.id) {
    var idx = TRACKS.findIndex(function (t) { return t.id === s.id; });
    if (idx >= 0) {
      loadTrack(idx, s.at || 0);
      audio.pause();
      nowEl.innerHTML = "<b>" + TRACKS[idx].id + ". " + esc(TRACKS[idx].title) +
        "</b> — 이어듣기";
    }
  }
})();
