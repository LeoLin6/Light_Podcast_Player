/* ES5 on purpose: iPhone 4 / iOS 7 Safari cannot parse modern JS. */
var FEED_URL = "https://anchor.fm/s/104b7e58/podcast/rss";
var FEED_JSON_PATH = "./feed.json";

var els = {
  showTitle: document.getElementById("showTitle"),
  showSubtitle: document.getElementById("showSubtitle"),
  episodeTitle: document.getElementById("episodeTitle"),
  episodeSub: document.getElementById("episodeSub"),
  timeCur: document.getElementById("timeCur"),
  timeDur: document.getElementById("timeDur"),
  scrubber: document.getElementById("scrubber"),
  btnPlay: document.getElementById("btnPlay"),
  playGlyph: document.getElementById("playGlyph"),
  btnBack: document.getElementById("btnBack"),
  btnForward: document.getElementById("btnForward"),
  btnDownload: document.getElementById("btnDownload"),
  btnSleep: document.getElementById("btnSleep"),
  sleepLabel: document.getElementById("sleepLabel"),
  audio: document.getElementById("audio"),
  btnRandom: document.getElementById("btnRandom"),
  btnToggleList: document.getElementById("btnToggleList"),
  btnCloseList: document.getElementById("btnCloseList"),
  listView: document.getElementById("listView"),
  episodeList: document.getElementById("episodeList"),
  playHint: document.getElementById("playHint")
};

function pad2(n) {
  n = String(n);
  return n.length < 2 ? "0" + n : n;
}

function isNum(n) {
  return typeof n === "number" && isFinite(n);
}

function fmtTime(sec) {
  if (!isNum(sec) || sec <= 0) return "0:00";
  var s = Math.floor(sec);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var r = s % 60;
  if (h > 0) return h + ":" + pad2(m) + ":" + pad2(r);
  return m + ":" + pad2(r);
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(isoOrRfc) {
  if (!isoOrRfc) return "";
  var d = new Date(isoOrRfc);
  if (isNaN(d.getTime())) return "";
  return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeText(s) {
  return typeof s === "string" ? s : "";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isOldIOS() {
  var ua = navigator.userAgent || "";
  return /iP(hone|ad|od).*OS [1-8]_/.test(ua);
}

function unwrapAudioUrl(url) {
  if (!url) return "";
  var lower = url.toLowerCase();
  var token = "https%3a%2f%2f";
  var idx = lower.lastIndexOf(token);
  if (idx === -1) {
    token = "http%3a%2f%2f";
    idx = lower.lastIndexOf(token);
  }
  if (idx !== -1) {
    try {
      var decoded = decodeURIComponent(url.substring(idx));
      if (decoded.indexOf("http") === 0) return decoded;
    } catch (e) {}
  }
  return url;
}

function getEnclosure(item) {
  if (!item) return "";
  var url = "";
  if (item.enclosure && item.enclosure.url) url = item.enclosure.url;
  else if (item.enclosureUrl) url = item.enclosureUrl;
  else if (item.audioUrl) url = item.audioUrl;
  return unwrapAudioUrl(url);
}

function pickDurationSeconds(item) {
  if (!item) return null;
  var raw = item.duration;
  if (raw == null && item.itunesDuration != null) raw = item.itunesDuration;
  if (raw == null && item.itunes && item.itunes.duration != null) raw = item.itunes.duration;
  if (raw == null && item.itunes_duration != null) raw = item.itunes_duration;
  if (raw == null) return null;

  if (typeof raw === "number" && isNum(raw)) return raw;
  var s = String(raw).replace(/^\s+|\s+$/g, "");

  if (/^\d+$/.test(s)) return Number(s);
  var parts = s.split(":");
  var nums = [];
  var i;
  for (i = 0; i < parts.length; i++) {
    var n = Number(parts[i]);
    if (!isNum(n)) return null;
    nums.push(n);
  }
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

function episodeId(item) {
  if (!item) return "";
  return safeText(item.guid || item.id || getEnclosure(item));
}

var LS_KEYS = {
  lastEpisodeId: "podcast_light:lastEpisodeId",
  lastTimeByIdPrefix: "podcast_light:lastTime:",
  sleepMinutes: "podcast_light:sleepMinutes",
  sleepEnabled: "podcast_light:sleepEnabled",
  shuffleSeen: "podcast_light:shuffleSeen"
};

function lsGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function lsSet(key, val) {
  try {
    window.localStorage.setItem(key, val);
  } catch (e) {}
}

function readLastTime(id) {
  var raw = lsGet(LS_KEYS.lastTimeByIdPrefix + id);
  var n = Number(raw);
  if (!isNum(n) || n < 0) return 0;
  return n;
}

function writeLastTime(id, t) {
  lsSet(LS_KEYS.lastTimeByIdPrefix + id, String(Math.max(0, t)));
}

function readSleepMinutes() {
  var raw = lsGet(LS_KEYS.sleepMinutes);
  var n = Number(raw);
  if (!isNum(n) || n <= 0) return 60;
  return Math.round(n);
}

function readSleepEnabled() {
  var raw = lsGet(LS_KEYS.sleepEnabled);
  if (raw == null) return true;
  return raw === "true";
}

function writeSleepSettings(opts) {
  lsSet(LS_KEYS.sleepEnabled, String(!!opts.enabled));
  if (isNum(opts.minutes) && opts.minutes > 0) {
    lsSet(LS_KEYS.sleepMinutes, String(Math.round(opts.minutes)));
  }
}

function loadShuffleSeen() {
  var raw = lsGet(LS_KEYS.shuffleSeen);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || parsed.length == null) return [];
    var out = [];
    var i;
    for (i = 0; i < parsed.length; i++) {
      if (typeof parsed[i] === "string" && parsed[i]) out.push(parsed[i]);
    }
    return out;
  } catch (e) {
    return [];
  }
}

function saveShuffleSeen(ids) {
  lsSet(LS_KEYS.shuffleSeen, JSON.stringify(ids));
}

function arrayContains(arr, id) {
  var i;
  for (i = 0; i < arr.length; i++) {
    if (arr[i] === id) return true;
  }
  return false;
}

function setNowPlayingMeta(opts) {
  els.showTitle.textContent = opts.showTitle;
  els.showSubtitle.textContent = opts.showSubtitle;
  els.episodeTitle.textContent = opts.epTitle;
  els.episodeSub.textContent = opts.epSub;
}

function setPlayState(isPlaying) {
  els.playGlyph.textContent = isPlaying ? "❚❚" : "▶";
  els.btnPlay.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function filenameFromUrl(url) {
  if (!url) return "episode";
  var path = url.split("?")[0];
  var parts = path.split("/");
  var i;
  for (i = parts.length - 1; i >= 0; i--) {
    if (parts[i]) return parts[i];
  }
  return "episode";
}

function setDownloadUrl(url) {
  if (!url) {
    els.btnDownload.setAttribute("href", "#");
    els.btnDownload.setAttribute("aria-disabled", "true");
    els.btnDownload.className = els.btnDownload.className.replace(/\bis-disabled\b/g, "") + " is-disabled";
    return;
  }
  els.btnDownload.className = els.btnDownload.className.replace(/\bis-disabled\b/g, "");
  els.btnDownload.removeAttribute("aria-disabled");
  els.btnDownload.setAttribute("href", url);
  els.btnDownload.setAttribute("download", filenameFromUrl(url));
}

function isListOpen() {
  return els.listView.getAttribute("hidden") == null;
}

function toggleList(open) {
  var shouldOpen = typeof open === "boolean" ? open : !isListOpen();
  if (shouldOpen) {
    els.listView.removeAttribute("hidden");
    els.listView.style.display = "";
  } else {
    els.listView.setAttribute("hidden", "hidden");
    els.listView.style.display = "none";
  }
}

function isInside(el, ancestor) {
  while (el) {
    if (el === ancestor) return true;
    el = el.parentNode;
  }
  return false;
}

function renderList(items, activeId) {
  els.episodeList.innerHTML = "";
  var i;
  for (i = 0; i < items.length; i++) {
    (function (it) {
      var id = episodeId(it);
      var title = safeText(it.title) || "(untitled)";
      var date = fmtDate(it.pubDate || it.published || it.date);
      var dur = pickDurationSeconds(it);
      var durText = dur ? fmtTime(dur) : "";
      var enclosure = getEnclosure(it);

      var row = document.createElement("div");
      row.className = "item" + (id === activeId ? " item--active" : "");
      row.setAttribute("role", "listitem");
      row.setAttribute("data-id", id);

      var left = document.createElement("div");
      left.className = "item__left";
      left.textContent = id === activeId ? "▸" : " ";

      var main = document.createElement("div");
      main.className = "item__main";

      var t = document.createElement("div");
      t.className = "item__title";
      t.textContent = title;

      var sub = document.createElement("div");
      sub.className = "item__sub";
      if (date) {
        var sDate = document.createElement("span");
        sDate.className = "badge";
        sDate.textContent = date;
        sub.appendChild(sDate);
      }
      if (durText) {
        var sDur = document.createElement("span");
        sDur.className = "badge";
        sDur.textContent = durText;
        sub.appendChild(sDur);
      }

      main.appendChild(t);
      main.appendChild(sub);

      var right = document.createElement("div");
      right.className = "item__right";

      var dl = document.createElement("a");
      dl.className = "iconbtn item__dl";
      dl.href = enclosure || "#";
      dl.setAttribute("aria-label", "Download");
      dl.setAttribute("title", "Download");
      dl.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 3v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M8.5 10.5 12 13.9l3.5-3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        "</svg>";
      if (!enclosure) dl.setAttribute("aria-disabled", "true");

      right.appendChild(dl);
      row.appendChild(left);
      row.appendChild(main);
      row.appendChild(right);

      row.onclick = function (e) {
        var target = e.target || e.srcElement;
        if (isInside(target, dl)) return;
        if (window.__player && window.__player.loadEpisodeById) {
          window.__player.loadEpisodeById(id, { autoplay: true });
        }
        toggleList(false);
      };

      els.episodeList.appendChild(row);
    })(items[i]);
  }
}

function loadFeedJson(onOk, onErr) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", FEED_JSON_PATH, true);
  try {
    xhr.setRequestHeader("Cache-Control", "no-store");
  } catch (e) {}
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200 && xhr.status !== 0) {
      onErr(new Error("Failed to load feed.json (" + xhr.status + ")"));
      return;
    }
    try {
      var data = JSON.parse(xhr.responseText);
      if (data && data.feedUrl && data.feedUrl !== FEED_URL) {
        onErr(new Error("This build is locked to a different RSS feed."));
        return;
      }
      onOk(data);
    } catch (err) {
      onErr(err);
    }
  };
  try {
    xhr.send(null);
  } catch (err) {
    onErr(err);
  }
}

function inferShowSubtitle(feed) {
  var parts = [];
  var lang = feed && feed.language ? String(feed.language) : "";
  if (lang) parts.push(lang.toUpperCase());
  var lastBuild = (feed && (feed.lastBuildDate || feed.lastBuild || feed.lastUpdated)) || "";
  if (lastBuild) parts.push("Updated " + fmtDate(lastBuild));
  return parts.length ? parts.join(" · ") : "Single-feed player";
}

function ensureAudioUrl(url) {
  if (!url) throw new Error("Episode has no audio enclosure URL.");
  return url;
}

function findItemById(items, id) {
  var i;
  for (i = 0; i < items.length; i++) {
    if (episodeId(items[i]) === id) return items[i];
  }
  return null;
}

function indexOfValue(arr, val) {
  var i;
  for (i = 0; i < arr.length; i++) {
    if (arr[i] === val) return i;
  }
  return -1;
}

function tryPlay(audio) {
  try {
    var maybe = audio.play();
    if (maybe && typeof maybe.catch === "function") maybe.catch(function () {});
  } catch (e) {}
}

function bindTap(el, fn) {
  if (!el) return;
  var locked = false;
  function run(e) {
    if (locked) return;
    locked = true;
    window.setTimeout(function () {
      locked = false;
    }, 650);
    fn(e);
  }
  if (el.addEventListener) {
    el.addEventListener("touchstart", run, false);
    el.addEventListener("click", run, false);
  } else if (el.attachEvent) {
    el.attachEvent("onclick", run);
  }
}

function createPlayer(feed) {
  var items = feed && feed.items && feed.items.length != null ? feed.items : [];
  var showTitle = safeText(feed && feed.title) || "Podcast";
  var showSubtitle = inferShowSubtitle(feed);

  var activeId = null;
  var activeItem = null;

  var sleepOptionsMinutes = [15, 30, 45, 60, 90, 120, 0];
  var sleepEnabled = readSleepEnabled();
  var sleepMinutes = readSleepMinutes();
  var sleepRemainingMs = sleepEnabled ? sleepMinutes * 60000 : 0;
  var sleepLastTick = null;
  var sleepInterval = null;

  var savedId = lsGet(LS_KEYS.lastEpisodeId);
  var first = items.length ? items[0] : null;
  var initial = findItemById(items, savedId) || first;

  var audio = els.audio;
  var oldIOS = isOldIOS();
  var needsGestureSrc = oldIOS;
  if (oldIOS) {
    audio.setAttribute("controls", "controls");
    audio.setAttribute("preload", "auto");
    if (els.playHint) {
      els.playHint.removeAttribute("hidden");
      els.playHint.style.display = "block";
    }
  }

  function allEpisodeIds() {
    var ids = [];
    var i;
    for (i = 0; i < items.length; i++) ids.push(episodeId(items[i]));
    return ids;
  }

  function markShuffleSeen(id) {
    if (!id) return;
    var seen = loadShuffleSeen();
    var valid = {};
    var ids = allEpisodeIds();
    var i;
    for (i = 0; i < ids.length; i++) valid[ids[i]] = true;
    var next = [];
    for (i = 0; i < seen.length; i++) {
      if (valid[seen[i]] && !arrayContains(next, seen[i])) next.push(seen[i]);
    }
    if (!arrayContains(next, id) && valid[id]) next.push(id);
    saveShuffleSeen(next);
  }

  function fmtSleepLabel() {
    if (!sleepEnabled || sleepMinutes <= 0) return "Off";
    var minsLeft = Math.max(0, Math.ceil(sleepRemainingMs / 60000));
    return minsLeft + "m";
  }

  function refreshSleepUi() {
    els.sleepLabel.textContent = fmtSleepLabel();
    var title =
      !sleepEnabled || sleepMinutes <= 0 ? "Sleep timer: Off" : "Sleep timer: " + fmtSleepLabel() + " left";
    els.btnSleep.title = title;
    els.btnSleep.setAttribute("aria-label", title);
  }

  function armSleepTimer(minutes) {
    sleepMinutes = minutes;
    if (sleepMinutes <= 0) {
      sleepEnabled = false;
      sleepRemainingMs = 0;
      sleepLastTick = null;
      writeSleepSettings({ enabled: false, minutes: sleepMinutes });
      refreshSleepUi();
      return;
    }
    sleepEnabled = true;
    sleepRemainingMs = sleepMinutes * 60000;
    sleepLastTick = null;
    writeSleepSettings({ enabled: true, minutes: sleepMinutes });
    refreshSleepUi();
  }

  function ensureSleepIntervalRunning() {
    if (sleepInterval) return;
    sleepInterval = window.setInterval(function () {
      if (!sleepEnabled || sleepMinutes <= 0) return;
      if (audio.paused) {
        sleepLastTick = null;
        return;
      }
      var now = new Date().getTime();
      if (sleepLastTick == null) {
        sleepLastTick = now;
        return;
      }
      var dt = now - sleepLastTick;
      sleepLastTick = now;
      sleepRemainingMs = Math.max(0, sleepRemainingMs - dt);
      refreshSleepUi();
      if (sleepRemainingMs <= 0) {
        audio.pause();
        sleepEnabled = false;
        writeSleepSettings({ enabled: false, minutes: sleepMinutes });
        refreshSleepUi();
      }
    }, 500);
  }

  function setActive(item, opts) {
    opts = opts || {};
    var autoplay = !!opts.autoplay;
    if (!item) return;
    activeItem = item;
    activeId = episodeId(item);
    lsSet(LS_KEYS.lastEpisodeId, activeId);
    markShuffleSeen(activeId);

    var title = safeText(item.title) || "(untitled)";
    var date = fmtDate(item.pubDate || item.published || item.date);
    var dur = pickDurationSeconds(item);
    var durText = dur ? fmtTime(dur) : "";
    var bits = [];
    if (date) bits.push(date);
    if (durText) bits.push(durText);
    var sub = bits.length ? bits.join(" · ") : " ";

    setNowPlayingMeta({
      showTitle: showTitle,
      showSubtitle: showSubtitle,
      epTitle: title,
      epSub: sub
    });

    var url = ensureAudioUrl(getEnclosure(item));
    setDownloadUrl(url);

    var previousSrc = audio.getAttribute("src") || audio.currentSrc || "";
    audio.setAttribute("src", url);
    audio.src = url;

    renderList(items, activeId);

    function restore() {
      if (audio.removeEventListener) {
        audio.removeEventListener("loadedmetadata", restore, false);
      } else if (audio.detachEvent) {
        audio.detachEvent("onloadedmetadata", restore);
      }
      // Seeking before play() often kills audio on iOS 7.
      if (oldIOS) return;
      var t = readLastTime(activeId);
      if (t > 0 && isNum(audio.duration)) {
        try {
          audio.currentTime = clamp(t, 0, Math.max(0, audio.duration - 0.5));
        } catch (e) {}
      }
    }
    if (audio.addEventListener) {
      audio.addEventListener("loadedmetadata", restore, false);
    } else if (audio.attachEvent) {
      audio.attachEvent("onloadedmetadata", restore);
    }

    if (previousSrc && previousSrc !== url) {
      els.scrubber.value = "0";
      els.timeCur.textContent = "0:00";
      els.timeDur.textContent = "0:00";
      setPlayState(false);
    }

    if (autoplay) {
      needsGestureSrc = false;
      tryPlay(audio);
    } else if (oldIOS) {
      needsGestureSrc = true;
    }
  }

  function loadEpisodeById(id, opts) {
    var item = findItemById(items, id);
    if (!item) return;
    setActive(item, opts);
  }

  function pickRandomEpisodeId() {
    var ids = allEpisodeIds();
    var n = ids.length;
    if (n === 0) return null;
    if (n === 1) return ids[0];

    var valid = {};
    var i;
    for (i = 0; i < n; i++) valid[ids[i]] = true;

    var seen = loadShuffleSeen();
    var seenOk = [];
    for (i = 0; i < seen.length; i++) {
      if (valid[seen[i]] && !arrayContains(seenOk, seen[i])) seenOk.push(seen[i]);
    }

    var seenMap = {};
    for (i = 0; i < seenOk.length; i++) seenMap[seenOk[i]] = true;

    var pool = [];
    for (i = 0; i < n; i++) {
      if (ids[i] !== activeId && !seenMap[ids[i]]) pool.push(ids[i]);
    }

    if (!pool.length) {
      seenOk = activeId ? [activeId] : [];
      saveShuffleSeen(seenOk);
      pool = [];
      for (i = 0; i < n; i++) {
        if (ids[i] !== activeId) pool.push(ids[i]);
      }
    }

    if (!pool.length) return activeId;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function on(el, type, fn) {
    if (!el) return;
    if (el.addEventListener) el.addEventListener(type, fn, false);
    else if (el.attachEvent) el.attachEvent("on" + type, fn);
  }

  function playOrPause() {
    if (!activeItem) return;
    var url = getEnclosure(activeItem);
    if (!url) return;
    if (audio.paused) {
      // iOS 7 only unlocks playback if src is set in the same tap as play().
      if (needsGestureSrc || !audio.getAttribute("src")) {
        audio.setAttribute("src", url);
        audio.src = url;
        needsGestureSrc = false;
      }
      tryPlay(audio);
    } else {
      audio.pause();
    }
  }

  bindTap(els.btnPlay, playOrPause);

  on(els.btnBack, "click", function () {
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - 15);
  });

  on(els.btnForward, "click", function () {
    var dur = isNum(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(dur, (audio.currentTime || 0) + 30);
  });

  on(els.btnSleep, "click", function () {
    var curMinutes = sleepEnabled ? sleepMinutes : 0;
    var idx = indexOfValue(sleepOptionsMinutes, curMinutes);
    if (idx < 0) idx = indexOfValue(sleepOptionsMinutes, 60);
    var next = sleepOptionsMinutes[(idx + 1) % sleepOptionsMinutes.length];
    armSleepTimer(next);
    ensureSleepIntervalRunning();
  });

  bindTap(els.btnRandom, function () {
    var id = pickRandomEpisodeId();
    if (id) loadEpisodeById(id, { autoplay: true });
  });

  on(els.btnToggleList, "click", function () {
    toggleList(true);
  });
  on(els.btnCloseList, "click", function () {
    toggleList(false);
  });

  function onScrub() {
    var max = Number(els.scrubber.max) || 1000;
    var p = Number(els.scrubber.value) / max;
    if (isNum(audio.duration) && audio.duration > 0) {
      audio.currentTime = clamp(p * audio.duration, 0, audio.duration);
    }
  }
  on(els.scrubber, "input", onScrub);
  on(els.scrubber, "change", onScrub);

  on(audio, "timeupdate", function () {
    var cur = audio.currentTime || 0;
    els.timeCur.textContent = fmtTime(cur);

    if (isNum(audio.duration) && audio.duration > 0) {
      els.timeDur.textContent = fmtTime(audio.duration);
      var max = Number(els.scrubber.max) || 1000;
      var p = clamp(cur / audio.duration, 0, 1);
      els.scrubber.value = String(Math.round(p * max));
    }
  });

  on(audio, "durationchange", function () {
    els.timeDur.textContent = fmtTime(audio.duration || 0);
  });

  on(audio, "play", function () {
    setPlayState(true);
  });
  on(audio, "pause", function () {
    setPlayState(false);
  });
  on(audio, "ended", function () {
    setPlayState(false);
  });
  on(audio, "error", function () {
    var code = audio.error ? audio.error.code : 0;
    var msg = "Playback failed";
    if (code === 4) msg = "This file can't play in this browser";
    else if (code === 2) msg = "Network error loading audio";
    else if (code === 3) msg = "Audio decode error";
    els.episodeSub.textContent = msg;
    setPlayState(false);
  });

  var lastSavedAt = 0;
  on(audio, "timeupdate", function () {
    if (!activeId) return;
    var now = new Date().getTime();
    if (now - lastSavedAt < 2500) return;
    lastSavedAt = now;
    writeLastTime(activeId, audio.currentTime || 0);
  });

  setNowPlayingMeta({
    showTitle: showTitle,
    showSubtitle: showSubtitle,
    epTitle: "Loading…",
    epSub: " "
  });
  renderList(items, episodeId(initial));
  setActive(initial, { autoplay: false });

  if (sleepEnabled && sleepMinutes > 0) {
    armSleepTimer(sleepMinutes);
  } else {
    refreshSleepUi();
  }
  ensureSleepIntervalRunning();

  return { loadEpisodeById: loadEpisodeById, pickRandomEpisodeId: pickRandomEpisodeId };
}

function boot() {
  loadFeedJson(
    function (feed) {
      window.__player = createPlayer(feed);
    },
    function (err) {
      var msg = err && err.message ? err.message : String(err);
      setNowPlayingMeta({
        showTitle: "Podcast",
        showSubtitle: "Feed not ready",
        epTitle: "Run the feed builder",
        epSub: "Then refresh this page."
      });
      els.episodeList.innerHTML =
        '<div class="item" role="listitem" style="cursor: default;">' +
        '<div class="item__left">!</div>' +
        '<div class="item__main">' +
        '<div class="item__title">Missing or invalid feed.json</div>' +
        '<div class="item__sub">' +
        '<span class="badge">Error</span>' +
        '<span class="badge">' +
        escapeHtml(msg) +
        "</span>" +
        "</div></div></div>" +
        '<div class="item" role="listitem" style="cursor: default;">' +
        '<div class="item__left"> </div>' +
        '<div class="item__main">' +
        '<div class="item__title">Fix</div>' +
        '<div class="item__sub">' +
        '<span class="badge">Run</span>' +
        '<span class="badge">npm install</span>' +
        '<span class="badge">npm run update</span>' +
        "</div></div></div>";
      toggleList(true);
    }
  );
}

boot();
