const FEED_URL = "https://anchor.fm/s/104b7e58/podcast/rss";
const FEED_JSON_PATH = "./feed.json";

const els = {
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
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(r)}`;
  return `${m}:${pad2(r)}`;
}

function fmtDate(isoOrRfc) {
  const d = new Date(isoOrRfc);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeText(s) {
  return typeof s === "string" ? s : "";
}

function getEnclosure(item) {
  return item?.enclosure?.url || item?.enclosureUrl || item?.audioUrl || "";
}

function pickDurationSeconds(item) {
  const raw = item?.duration ?? item?.itunesDuration ?? item?.itunes?.duration ?? item?.itunes_duration;
  if (raw == null) return null;

  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();

  // 01:05:29 / 55:48 / 3340
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function episodeId(item) {
  // Prefer GUID; otherwise fall back to enclosure URL.
  return safeText(item?.guid || item?.id || getEnclosure(item));
}

const LS_KEYS = {
  lastEpisodeId: "podcast_light:lastEpisodeId",
  lastTimeByIdPrefix: "podcast_light:lastTime:",
  sleepMinutes: "podcast_light:sleepMinutes",
  sleepEnabled: "podcast_light:sleepEnabled",
};

function readLastTime(id) {
  const raw = localStorage.getItem(LS_KEYS.lastTimeByIdPrefix + id);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function writeLastTime(id, t) {
  localStorage.setItem(LS_KEYS.lastTimeByIdPrefix + id, String(Math.max(0, t)));
}

function readSleepMinutes() {
  const raw = localStorage.getItem(LS_KEYS.sleepMinutes);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.round(n);
}

function readSleepEnabled() {
  const raw = localStorage.getItem(LS_KEYS.sleepEnabled);
  if (raw == null) return true; // auto-on by default
  return raw === "true";
}

function writeSleepSettings({ enabled, minutes }) {
  localStorage.setItem(LS_KEYS.sleepEnabled, String(Boolean(enabled)));
  if (Number.isFinite(minutes) && minutes > 0) {
    localStorage.setItem(LS_KEYS.sleepMinutes, String(Math.round(minutes)));
  }
}

function setNowPlayingMeta({ showTitle, showSubtitle, epTitle, epSub }) {
  els.showTitle.textContent = showTitle;
  els.showSubtitle.textContent = showSubtitle;
  els.episodeTitle.textContent = epTitle;
  els.episodeSub.textContent = epSub;
}

function setPlayState(isPlaying) {
  els.playGlyph.textContent = isPlaying ? "❚❚" : "▶";
  els.btnPlay.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function setDownloadUrl(url) {
  if (!url) {
    els.btnDownload.setAttribute("href", "#");
    els.btnDownload.setAttribute("aria-disabled", "true");
    els.btnDownload.classList.add("is-disabled");
    return;
  }
  els.btnDownload.classList.remove("is-disabled");
  els.btnDownload.removeAttribute("aria-disabled");
  els.btnDownload.setAttribute("href", url);
  try {
    const u = new URL(url);
    const filename = u.pathname.split("/").filter(Boolean).at(-1) || "episode";
    els.btnDownload.setAttribute("download", filename);
  } catch {
    els.btnDownload.setAttribute("download", "episode");
  }
}

function toggleList(open) {
  const shouldOpen = open ?? els.listView.hidden;
  els.listView.hidden = !shouldOpen;
}

function renderList(items, activeId) {
  els.episodeList.innerHTML = "";
  for (const it of items) {
    const id = episodeId(it);
    const title = safeText(it.title) || "(untitled)";
    const date = fmtDate(it.pubDate || it.published || it.date);
    const dur = pickDurationSeconds(it);
    const durText = dur ? fmtTime(dur) : "";
    const enclosure = getEnclosure(it);

    const row = document.createElement("div");
    row.className = "item" + (id === activeId ? " item--active" : "");
    row.setAttribute("role", "listitem");
    row.dataset.id = id;

    const left = document.createElement("div");
    left.className = "item__left";
    left.textContent = id === activeId ? "▸" : " ";

    const main = document.createElement("div");
    main.className = "item__main";

    const t = document.createElement("div");
    t.className = "item__title";
    t.textContent = title;

    const sub = document.createElement("div");
    sub.className = "item__sub";
    if (date) {
      const s = document.createElement("span");
      s.className = "badge";
      s.textContent = date;
      sub.appendChild(s);
    }
    if (durText) {
      const s = document.createElement("span");
      s.className = "badge";
      s.textContent = durText;
      sub.appendChild(s);
    }

    main.appendChild(t);
    main.appendChild(sub);

    const right = document.createElement("div");
    right.className = "item__right";

    const dl = document.createElement("a");
    dl.className = "iconbtn item__dl";
    dl.href = enclosure || "#";
    dl.setAttribute("aria-label", "Download");
    dl.setAttribute("title", "Download");
    dl.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M8.5 10.5 12 13.9l3.5-3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    if (!enclosure) dl.setAttribute("aria-disabled", "true");

    right.appendChild(dl);

    row.appendChild(left);
    row.appendChild(main);
    row.appendChild(right);

    row.addEventListener("click", (e) => {
      // Allow direct download without switching episode if user clicked the download button.
      const a = e.target?.closest?.("a");
      if (a && a === dl) return;
      window.__player?.loadEpisodeById?.(id, { autoplay: true });
      toggleList(false);
    });

    els.episodeList.appendChild(row);
  }
}

async function loadFeedJson() {
  const res = await fetch(FEED_JSON_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load feed.json (${res.status})`);
  const data = await res.json();

  // Single-feed limitation: enforce the expected URL if present.
  if (data?.feedUrl && data.feedUrl !== FEED_URL) {
    throw new Error("This build is locked to a different RSS feed.");
  }
  return data;
}

function inferShowSubtitle(feed) {
  const parts = [];
  const lang = feed?.language ? String(feed.language) : "";
  if (lang) parts.push(lang.toUpperCase());
  const lastBuild = feed?.lastBuildDate || feed?.lastBuild || feed?.lastUpdated;
  if (lastBuild) parts.push(`Updated ${fmtDate(lastBuild)}`);
  return parts.join(" · ") || "Single-feed player";
}

function ensureAudioUrl(url) {
  if (!url) throw new Error("Episode has no audio enclosure URL.");
  return url;
}

function createPlayer(feed) {
  const items = Array.isArray(feed?.items) ? feed.items : [];

  const showTitle = safeText(feed?.title) || "Podcast";
  const showSubtitle = inferShowSubtitle(feed);

  let activeId = null;
  let activeItem = null;

  // Sleep timer (counts down while playing)
  const sleepOptionsMinutes = [15, 30, 45, 60, 90, 120, 0]; // 0 = Off
  let sleepEnabled = readSleepEnabled();
  let sleepMinutes = readSleepMinutes();
  let sleepRemainingMs = sleepEnabled ? sleepMinutes * 60_000 : 0;
  let sleepLastTick = null;
  let sleepInterval = null;

  const savedId = localStorage.getItem(LS_KEYS.lastEpisodeId);
  const first = items[0] || null;
  const initial = items.find((x) => episodeId(x) === savedId) || first;

  const audio = els.audio;
  audio.playbackRate = 1.0;

  function fmtSleepLabel() {
    if (!sleepEnabled || sleepMinutes <= 0) return "Off";
    // Show minutes remaining (rounded up), but keep compact.
    const minsLeft = Math.max(0, Math.ceil(sleepRemainingMs / 60_000));
    return `${minsLeft}m`;
  }

  function refreshSleepUi() {
    els.sleepLabel.textContent = fmtSleepLabel();
    const title = !sleepEnabled || sleepMinutes <= 0 ? "Sleep timer: Off" : `Sleep timer: ${fmtSleepLabel()} left`;
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
    sleepRemainingMs = sleepMinutes * 60_000;
    sleepLastTick = null;
    writeSleepSettings({ enabled: true, minutes: sleepMinutes });
    refreshSleepUi();
  }

  function ensureSleepIntervalRunning() {
    if (sleepInterval) return;
    sleepInterval = window.setInterval(() => {
      if (!sleepEnabled || sleepMinutes <= 0) return;
      if (audio.paused) {
        sleepLastTick = null;
        return;
      }
      const now = Date.now();
      if (sleepLastTick == null) {
        sleepLastTick = now;
        return;
      }
      const dt = now - sleepLastTick;
      sleepLastTick = now;
      sleepRemainingMs = Math.max(0, sleepRemainingMs - dt);
      refreshSleepUi();
      if (sleepRemainingMs <= 0) {
        // Time's up: pause playback.
        audio.pause();
        sleepEnabled = false;
        writeSleepSettings({ enabled: false, minutes: sleepMinutes });
        refreshSleepUi();
      }
    }, 500);
  }

  function setActive(item, { autoplay = false } = {}) {
    if (!item) return;
    activeItem = item;
    activeId = episodeId(item);
    localStorage.setItem(LS_KEYS.lastEpisodeId, activeId);

    const title = safeText(item.title) || "(untitled)";
    const date = fmtDate(item.pubDate || item.published || item.date);
    const dur = pickDurationSeconds(item);
    const durText = dur ? fmtTime(dur) : "";
    const sub = [date, durText].filter(Boolean).join(" · ") || " ";

    setNowPlayingMeta({
      showTitle,
      showSubtitle,
      epTitle: title,
      epSub: sub,
    });

    const url = ensureAudioUrl(getEnclosure(item));
    setDownloadUrl(url);

    const previousSrc = audio.currentSrc;
    audio.src = url;
    audio.load();

    renderList(items, activeId);

    // Restore position on metadata load (same episode).
    const restore = () => {
      audio.removeEventListener("loadedmetadata", restore);
      const t = readLastTime(activeId);
      if (t > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = clamp(t, 0, Math.max(0, audio.duration - 0.5));
      }
      if (autoplay) void audio.play();
    };
    audio.addEventListener("loadedmetadata", restore);

    // If switching episodes, reset UI immediately.
    if (previousSrc && previousSrc !== url) {
      els.scrubber.value = "0";
      els.timeCur.textContent = "0:00";
      els.timeDur.textContent = "0:00";
      setPlayState(false);
    }
  }

  function loadEpisodeById(id, { autoplay = false } = {}) {
    const item = items.find((x) => episodeId(x) === id);
    if (!item) return;
    setActive(item, { autoplay });
  }

  function pickRandomEpisodeId() {
    const n = items.length;
    if (n === 0) return null;
    if (n === 1) return episodeId(items[0]);
    let id = null;
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(Math.random() * n);
      id = episodeId(items[i]);
      if (id !== activeId) break;
    }
    return id;
  }

  // UI wiring
  els.btnPlay.addEventListener("click", async () => {
    if (!audio.src) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        // ignored
      }
    } else {
      audio.pause();
    }
  });

  els.btnBack.addEventListener("click", () => {
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - 15);
  });

  els.btnForward.addEventListener("click", () => {
    const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(dur, (audio.currentTime || 0) + 30);
  });

  els.btnSleep.addEventListener("click", () => {
    // Cycle between options; default should include 60.
    const curMinutes = sleepEnabled ? sleepMinutes : 0;
    let idx = sleepOptionsMinutes.indexOf(curMinutes);
    if (idx < 0) idx = sleepOptionsMinutes.indexOf(60);
    const next = sleepOptionsMinutes[(idx + 1) % sleepOptionsMinutes.length];
    armSleepTimer(next);
    ensureSleepIntervalRunning();
  });

  els.btnRandom.addEventListener("click", () => {
    const id = pickRandomEpisodeId();
    if (id) loadEpisodeById(id, { autoplay: true });
  });

  els.btnToggleList.addEventListener("click", () => toggleList(true));
  els.btnCloseList.addEventListener("click", () => toggleList(false));

  els.scrubber.addEventListener("input", () => {
    const max = Number(els.scrubber.max) || 1000;
    const p = Number(els.scrubber.value) / max;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = clamp(p * audio.duration, 0, audio.duration);
    }
  });

  audio.addEventListener("timeupdate", () => {
    const cur = audio.currentTime || 0;
    els.timeCur.textContent = fmtTime(cur);

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      els.timeDur.textContent = fmtTime(audio.duration);
      const max = Number(els.scrubber.max) || 1000;
      const p = clamp(cur / audio.duration, 0, 1);
      els.scrubber.value = String(Math.round(p * max));
    }
  });

  audio.addEventListener("durationchange", () => {
    els.timeDur.textContent = fmtTime(audio.duration || 0);
  });

  audio.addEventListener("play", () => setPlayState(true));
  audio.addEventListener("pause", () => setPlayState(false));
  audio.addEventListener("ended", () => setPlayState(false));

  // Persist listening position periodically
  let lastSavedAt = 0;
  audio.addEventListener("timeupdate", () => {
    if (!activeId) return;
    const now = Date.now();
    if (now - lastSavedAt < 2500) return;
    lastSavedAt = now;
    writeLastTime(activeId, audio.currentTime || 0);
  });

  // Initial render
  setNowPlayingMeta({
    showTitle,
    showSubtitle,
    epTitle: "Loading…",
    epSub: " ",
  });
  renderList(items, episodeId(initial));
  setActive(initial, { autoplay: false });

  // Initialize sleep timer UI + ticking (auto-on 60m by default)
  if (sleepEnabled && sleepMinutes > 0) {
    // Ensure we arm to get a clean full countdown.
    armSleepTimer(sleepMinutes);
  } else {
    refreshSleepUi();
  }
  ensureSleepIntervalRunning();

  return { loadEpisodeById, pickRandomEpisodeId };
}

async function boot() {
  try {
    const feed = await loadFeedJson();
    window.__player = createPlayer(feed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setNowPlayingMeta({
      showTitle: "Podcast",
      showSubtitle: "Feed not ready",
      epTitle: "Run the feed builder",
      epSub: "Then refresh this page.",
    });
    els.episodeList.innerHTML = `
      <div class="item" role="listitem" style="cursor: default;">
        <div class="item__left">!</div>
        <div class="item__main">
          <div class="item__title">Missing or invalid \`feed.json\`</div>
          <div class="item__sub">
            <span class="badge">Error</span>
            <span class="badge">${msg.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>
          </div>
        </div>
      </div>
      <div class="item" role="listitem" style="cursor: default;">
        <div class="item__left"> </div>
        <div class="item__main">
          <div class="item__title">Fix</div>
          <div class="item__sub">
            <span class="badge">Run</span>
            <span class="badge">npm install</span>
            <span class="badge">npm run update</span>
          </div>
        </div>
      </div>
    `;
    toggleList(true);
  }
}

boot();

