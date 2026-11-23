/* ============================================================================
   Terminallike — 4K TV Frontend Controller
   Features:
     - Live /api/briefing polling + local clock
     - Classic TRMNL Paper / OLED-Safe Ink / Auto-at-sunset theme switching
     - Subtle OLED burn-in pixel shift (Lissajous orbit every 2 min)
     - Idle cursor & controls auto-hide (5s)
     - Screen Wake Lock API with automatic visibility re-acquisition
     - Settings drawer (S) with Open-Meteo city lookup & localStorage persistence
   ============================================================================ */

const STORAGE_KEY = 'terminallike_prefs_v1';
const IDLE_MS = 5000;
const PIXEL_SHIFT_INTERVAL_MS = 2 * 60 * 1000;

const DEFAULT_PREFS = {
  themeMode: 'auto', // 'auto' | 'paper' | 'oled'
  pixelShift: true,
  refreshMinutes: 10,
  name: '',
  note: null, // null = use server env default; string = override
  city: '',
  lat: null,
  lon: null,
  tz: '',
  units: '',
  demo: false,
};

let prefs = loadPrefs();
let latestBriefing = null;
let refreshTimer = null;
let idleTimer = null;
let pixelShiftTimer = null;
let pixelShiftStep = 0;
let wakeLockSentinel = null;
let pendingCitySelection = null;

// DOM references
const el = {
  canvas: document.getElementById('canvas'),
  greetingKicker: document.getElementById('greeting-kicker'),
  demoBadge: document.getElementById('demo-badge'),
  warningBadge: document.getElementById('warning-badge'),
  dateHeading: document.getElementById('date-heading'),
  weatherIcon: document.getElementById('weather-icon'),
  weatherTemp: document.getElementById('weather-temp'),
  weatherCond: document.getElementById('weather-cond'),
  weatherMeta: document.getElementById('weather-meta'),
  clockTime: document.getElementById('clock-time'),
  clockPeriod: document.getElementById('clock-period'),
  summaryMeta: document.getElementById('summary-meta'),
  aiSummary: document.getElementById('ai-summary'),
  upNextLabel: document.getElementById('up-next-label'),
  upNextCountdown: document.getElementById('up-next-countdown'),
  upNextTitle: document.getElementById('up-next-title'),
  upNextMeta: document.getElementById('up-next-meta'),
  rhythmStats: document.getElementById('rhythm-stats'),
  rhythmTrack: document.getElementById('rhythm-track'),
  noteBlock: document.getElementById('personal-note-block'),
  noteText: document.getElementById('personal-note-text'),
  todayCount: document.getElementById('today-count'),
  alldayStrip: document.getElementById('allday-strip'),
  todayList: document.getElementById('today-list'),
  tomorrowMeta: document.getElementById('tomorrow-meta'),
  tomorrowList: document.getElementById('tomorrow-list'),
  statusSync: document.getElementById('status-sync'),
  statusTheme: document.getElementById('status-theme'),
  statusProtection: document.getElementById('status-protection'),
  btnTheme: document.getElementById('btn-theme'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnSettings: document.getElementById('btn-settings'),
  backdrop: document.getElementById('drawer-backdrop'),
  drawer: document.getElementById('settings-drawer'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  form: document.getElementById('settings-form'),
  inputName: document.getElementById('input-name'),
  selectTheme: document.getElementById('select-theme'),
  inputCitySearch: document.getElementById('input-city-search'),
  btnCitySearch: document.getElementById('btn-city-search'),
  cityResults: document.getElementById('city-results'),
  citySelected: document.getElementById('city-selected'),
  selectUnits: document.getElementById('select-units'),
  selectRefresh: document.getElementById('select-refresh'),
  inputNote: document.getElementById('input-note'),
  togglePixelShift: document.getElementById('toggle-pixel-shift'),
  toggleDemo: document.getElementById('toggle-demo'),
  wakelockStatus: document.getElementById('wakelock-status'),
  btnResetSettings: document.getElementById('btn-reset-settings'),
};

/* ============================================================================
   Preferences Persistence
   ============================================================================ */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/* ============================================================================
   Minimal Monochrome E-Ink Weather Icons
   ============================================================================ */
function getWeatherSvg(iconKey) {
  const stroke = 'currentColor';
  const common = `fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  switch (iconKey) {
    case 'sun':
      return `<svg viewBox="0 0 32 32" ${common}><circle cx="16" cy="16" r="5.5"/><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.2 2.2M23 23l2.2 2.2M25.2 6.8L23 9M9 23l-2.2 2.2"/></svg>`;
    case 'sun-cloud':
      return `<svg viewBox="0 0 32 32" ${common}><path d="M12 13a4.5 4.5 0 1 1 7.6-2.5M15 4v2M7.5 7.5l1.5 1.5M22.5 7.5L21 9"/><path d="M9.5 24h13.5a4.5 4.5 0 0 0 .8-8.9A6 6 0 0 0 12.2 14a4.8 4.8 0 0 0-2.7 10z"/></svg>`;
    case 'cloud':
      return `<svg viewBox="0 0 32 32" ${common}><path d="M8.5 24h15a5 5 0 0 0 .8-9.9A6.5 6.5 0 0 0 12 13a5.5 5.5 0 0 0-3.5 11z"/></svg>`;
    case 'fog':
      return `<svg viewBox="0 0 32 32" ${common}><path d="M7 14h18M5 19h22M9 24h14M10 10a5 5 0 0 1 9.5-1.5"/></svg>`;
    case 'drizzle':
    case 'rain':
      return `<svg viewBox="0 0 32 32" ${common}><path d="M8.5 19h15a4.5 4.5 0 0 0 .7-8.9A6 6 0 0 0 12.4 9.5 4.8 4.8 0 0 0 8.5 19z"/><path d="M11 23l-1.2 4M16.5 23l-1.2 4M22 23l-1.2 4"/></svg>`;
    case 'snow':
      return `<svg viewBox="0 0 32 32" ${common}><path d="M8.5 19h15a4.5 4.5 0 0 0 .7-8.9A6 6 0 0 0 12.4 9.5 4.8 4.8 0 0 0 8.5 19z"/><circle cx="11.5" cy="24.5" r="1" fill="${stroke}"/><circle cx="16.5" cy="26" r="1" fill="${stroke}"/><circle cx="21.5" cy="24.5" r="1" fill="${stroke}"/></svg>`;
    case 'storm':
      return `<svg viewBox="0 0 32 32" ${common}><path d="M8.5 18h15a4.5 4.5 0 0 0 .7-8.9A6 6 0 0 0 12.4 8.5 4.8 4.8 0 0 0 8.5 18z"/><path d="M16.5 18L13 24h4l-1.5 5"/></svg>`;
    default:
      return `<svg viewBox="0 0 32 32" ${common}><circle cx="16" cy="16" r="5.5"/></svg>`;
  }
}

/* ============================================================================
   Formatting Helpers
   ============================================================================ */
function activeTimeZone() {
  return latestBriefing?.timezone || prefs.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatTime(iso, tz = activeTimeZone()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatClockParts(now, tz = activeTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(now);

  let hour = '--';
  let minute = '--';
  let dayPeriod = '';
  for (const p of parts) {
    if (p.type === 'hour') hour = p.value;
    if (p.type === 'minute') minute = p.value;
    if (p.type === 'dayPeriod') dayPeriod = p.value.toUpperCase();
  }
  return { time: `${hour}:${minute}`, period: dayPeriod };
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatSunsetShort(isoLocal) {
  if (!isoLocal) return null;
  // Open-Meteo returns local wall-clock ISO like "2026-11-23T16:54"
  const match = /T(\d{2}):(\d{2})/.exec(isoLocal);
  if (!match) return null;
  const h24 = Number(match[1]);
  const m = match[2];
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${suffix}`;
}

/* ============================================================================
   Theme Engine (Classic TRMNL Paper / OLED-Safe Ink / Auto at Sunset)
   ============================================================================ */
function resolveAutoTheme(weather, tz) {
  const now = new Date();
  const hm = getLocalHourMinute(now, tz);
  const nowMin = hm.hour * 60 + hm.minute;

  const parseWallMin = (str) => {
    const m = /T(\d{2}):(\d{2})/.exec(String(str || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  const sunriseMin = parseWallMin(weather?.sunrise) ?? 7 * 60;
  const sunsetMin = parseWallMin(weather?.sunset) ?? 18 * 60 + 30;

  return nowMin >= sunriseMin && nowMin < sunsetMin ? 'paper' : 'oled';
}

function getLocalHourMinute(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  let hour = 12;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value) % 24;
    if (p.type === 'minute') minute = Number(p.value);
  }
  return { hour, minute };
}

function applyTheme() {
  const tz = activeTimeZone();
  const resolved =
    prefs.themeMode === 'auto'
      ? resolveAutoTheme(latestBriefing?.weather, tz)
      : prefs.themeMode;

  document.documentElement.setAttribute('data-theme', resolved);

  const sunsetLabel = formatSunsetShort(latestBriefing?.weather?.sunset);
  if (prefs.themeMode === 'auto') {
    el.statusTheme.textContent = sunsetLabel
      ? `Theme: Auto (${resolved === 'paper' ? 'Paper' : 'OLED'} · Sunset ${sunsetLabel})`
      : `Theme: Auto (${resolved === 'paper' ? 'Paper' : 'OLED'})`;
  } else {
    el.statusTheme.textContent =
      resolved === 'paper' ? 'Theme: TRMNL Paper' : 'Theme: OLED-Safe Ink';
  }
}

function cycleThemeMode() {
  const order = ['auto', 'paper', 'oled'];
  const next = order[(order.indexOf(prefs.themeMode) + 1) % order.length];
  prefs.themeMode = next;
  savePrefs();
  applyTheme();
}

/* ============================================================================
   OLED Burn-In Subtle Pixel Shift
   ============================================================================ */
function updatePixelShift() {
  if (!prefs.pixelShift) {
    document.documentElement.style.setProperty('--shift-x', '0px');
    document.documentElement.style.setProperty('--shift-y', '0px');
    el.statusProtection.textContent = 'OLED Shift: Off';
    return;
  }

  // Gentle orbital drift within ±6px X, ±4px Y
  pixelShiftStep = (pixelShiftStep + 1) % 24;
  const angle = (pixelShiftStep / 24) * Math.PI * 2;
  const x = Math.round(Math.sin(angle) * 6);
  const y = Math.round(Math.cos(angle * 2) * 4);
  document.documentElement.style.setProperty('--shift-x', `${x}px`);
  document.documentElement.style.setProperty('--shift-y', `${y}px`);
  el.statusProtection.textContent = 'OLED Shift: On';
}

function startPixelShift() {
  if (pixelShiftTimer) clearInterval(pixelShiftTimer);
  el.statusProtection.textContent = prefs.pixelShift ? 'OLED Shift: On' : 'OLED Shift: Off';
  if (!prefs.pixelShift) {
    document.documentElement.style.setProperty('--shift-x', '0px');
    document.documentElement.style.setProperty('--shift-y', '0px');
    return;
  }
  pixelShiftTimer = setInterval(updatePixelShift, PIXEL_SHIFT_INTERVAL_MS);
}

/* ============================================================================
   Idle Cursor & Controls Auto-Hide
   ============================================================================ */
function resetIdleTimer() {
  document.body.classList.remove('is-idle');
  if (idleTimer) clearTimeout(idleTimer);
  // Keep cursor & controls visible while Settings drawer is open
  if (!el.drawer.classList.contains('hidden')) return;
  idleTimer = setTimeout(() => {
    document.body.classList.add('is-idle');
  }, IDLE_MS);
}

/* ============================================================================
   Screen Wake Lock API
   ============================================================================ */
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) {
    el.wakelockStatus.textContent = 'Screen Wake Lock: Not supported in this browser';
    return;
  }
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    el.wakelockStatus.textContent = 'Screen Wake Lock: Active (display kept awake)';
    wakeLockSentinel.addEventListener('release', () => {
      el.wakelockStatus.textContent = 'Screen Wake Lock: Standby';
    });
  } catch {
    el.wakelockStatus.textContent = 'Screen Wake Lock: Waiting for interaction';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    acquireWakeLock();
  }
});

/* ============================================================================
   Rendering
   ============================================================================ */
function updateClock() {
  const now = new Date();
  const tz = activeTimeZone();
  const { time, period } = formatClockParts(now, tz);
  el.clockTime.textContent = time;
  el.clockPeriod.textContent = period;

  el.dateHeading.textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  if (prefs.themeMode === 'auto' && latestBriefing) {
    applyTheme();
  }
}

function renderBriefing(data) {
  latestBriefing = data;
  const tz = data.timezone;

  // Masthead
  el.greetingKicker.textContent = data.greeting.toUpperCase();
  el.demoBadge.classList.toggle('hidden', !data.demoMode);

  if (data.meta?.warnings?.length) {
    el.warningBadge.textContent = `${data.meta.warnings.length} FEED NOTICE`;
    el.warningBadge.title = data.meta.warnings.join('\n');
    el.warningBadge.classList.remove('hidden');
  } else {
    el.warningBadge.classList.add('hidden');
  }

  // Weather
  const w = data.weather;
  el.weatherIcon.innerHTML = getWeatherSvg(w?.icon || 'sun-cloud');
  if (w && w.available && w.temperature !== null) {
    el.weatherTemp.textContent = `${w.temperature}${w.unitSymbol}`;
    el.weatherCond.textContent = w.condition;
    const sunsetText = formatSunsetShort(w.sunset);
    const metaParts = [
      w.locationName,
      `H ${w.high}° · L ${w.low}°`,
      sunsetText ? `Sunset ${sunsetText}` : null,
    ].filter(Boolean);
    el.weatherMeta.textContent = metaParts.join(' · ');
  } else {
    el.weatherTemp.textContent = '--°';
    el.weatherCond.textContent = 'Forecast offline';
    el.weatherMeta.textContent = w?.locationName || 'Check network connection';
  }

  // AI Daily Briefing
  el.aiSummary.textContent = data.summary?.text || 'No summary available.';
  const providerLabel =
    data.summary?.provider && data.summary.provider !== 'local'
      ? `AI · ${data.summary.provider.toUpperCase()}`
      : 'SMART SUMMARY';
  el.summaryMeta.textContent = `${providerLabel}${data.summary?.cached ? ' · CACHED' : ''}`;

  // Up Next Spotlight
  renderUpNext(data.upNext, tz);

  // Day Rhythm Bar (7 AM – 9 PM)
  renderDayRhythm(data.dayRhythm);

  // Personal Note
  if (data.personalNote) {
    el.noteText.textContent = data.personalNote;
    el.noteBlock.classList.remove('hidden');
  } else {
    el.noteBlock.classList.add('hidden');
  }

  // Today's Schedule
  renderTodaySchedule(data.today?.events || [], tz);

  // Tomorrow Preview
  renderTomorrowPreview(data.tomorrow?.events || [], data.weather, tz);

  // Footer Sync Status
  el.statusSync.textContent = `Synced ${formatTime(data.generatedAt, tz)}`;

  updateClock();
  applyTheme();
}

function renderUpNext(upNext, tz) {
  if (!upNext || !upNext.event) {
    el.upNextLabel.textContent = 'UP NEXT';
    el.upNextCountdown.textContent = 'ALL CLEAR';
    el.upNextTitle.textContent = 'Open evening ahead';
    el.upNextMeta.textContent = 'No remaining scheduled events.';
    return;
  }

  const evt = upNext.event;
  if (upNext.status === 'now') {
    el.upNextLabel.textContent = 'HAPPENING NOW';
    el.upNextCountdown.textContent = `${formatDuration(upNext.minutesRemaining)} LEFT`;
  } else if (upNext.status === 'upcoming') {
    el.upNextLabel.textContent = 'UP NEXT';
    el.upNextCountdown.textContent = `IN ${formatDuration(upNext.minutesUntil)}`;
  } else {
    el.upNextLabel.textContent = 'FIRST UP TOMORROW';
    el.upNextCountdown.textContent = evt.allDay ? 'ALL DAY' : formatTime(evt.start, tz);
  }

  el.upNextTitle.textContent = evt.title;

  const metaBits = [
    evt.allDay ? 'All day' : `${formatTime(evt.start, tz)} – ${formatTime(evt.end, tz)}`,
    evt.location || null,
    evt.calendar || null,
  ].filter(Boolean);
  el.upNextMeta.textContent = metaBits.join('  ·  ');
}

function renderDayRhythm(rhythm) {
  el.rhythmTrack.innerHTML = '';

  // Draw 2-hour tick guides (9a, 11a, 1p, 3p, 5p, 7p)
  for (let i = 1; i < 7; i++) {
    const tick = document.createElement('div');
    tick.className = 'rhythm-tick';
    tick.style.left = `${(i / 7) * 100}%`;
    el.rhythmTrack.appendChild(tick);
  }

  if (!rhythm) {
    el.rhythmStats.textContent = '—';
    return;
  }

  for (const block of rhythm.blocks || []) {
    const bar = document.createElement('div');
    bar.className = 'rhythm-event';
    bar.style.left = `${block.startPct}%`;
    bar.style.width = `${Math.max(0.8, block.widthPct)}%`;
    bar.title = block.title;
    el.rhythmTrack.appendChild(bar);
  }

  if (rhythm.nowPct !== null && rhythm.nowPct !== undefined) {
    const nowMarker = document.createElement('div');
    nowMarker.className = 'rhythm-now';
    nowMarker.style.left = `${rhythm.nowPct}%`;
    el.rhythmTrack.appendChild(nowMarker);
  }

  const busyStr = formatDuration(rhythm.busyMinutes || 0);
  const freeStr = formatDuration(rhythm.freeMinutes || 0);
  const openStr = rhythm.longestOpenWindow
    ? ` · Best open: ${rhythm.longestOpenWindow.label}`
    : '';
  el.rhythmStats.textContent = `${busyStr} booked · ${freeStr} open${openStr}`;
}

function renderTodaySchedule(events, tz) {
  const allDay = events.filter((e) => e.allDay);
  const timed = events.filter((e) => !e.allDay);

  el.todayCount.textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;

  // All-day chips
  el.alldayStrip.innerHTML = '';
  if (allDay.length > 0) {
    el.alldayStrip.classList.remove('hidden');
    for (const evt of allDay) {
      const chip = document.createElement('span');
      chip.className = 'allday-chip';
      chip.textContent = `ALL DAY · ${evt.title}`;
      el.alldayStrip.appendChild(chip);
    }
  } else {
    el.alldayStrip.classList.add('hidden');
  }

  // Timed events list
  el.todayList.innerHTML = '';
  if (timed.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent =
      allDay.length > 0
        ? 'No timed events today — enjoy the open schedule.'
        : 'Your schedule is completely clear today.';
    el.todayList.appendChild(li);
    return;
  }

  const nowMs = Date.now();
  for (const evt of timed) {
    const startMs = new Date(evt.start).getTime();
    const endMs = new Date(evt.end).getTime();
    const isPast = endMs <= nowMs;
    const isActive = startMs <= nowMs && endMs > nowMs;

    const li = document.createElement('li');
    li.className = 'event-item';
    if (isPast) li.classList.add('is-past');
    if (isActive) li.classList.add('is-active');

    const timeEl = document.createElement('div');
    timeEl.className = 'event-time';
    timeEl.textContent = formatTime(evt.start, tz);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'event-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'event-title';
    titleEl.textContent = evt.title;

    const subEl = document.createElement('div');
    subEl.className = 'event-sub';

    const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));
    const rangeSpan = document.createElement('span');
    rangeSpan.textContent = `${formatTime(evt.start, tz)}–${formatTime(evt.end, tz)} (${formatDuration(durationMin)})`;
    subEl.appendChild(rangeSpan);

    if (evt.location) {
      const locSpan = document.createElement('span');
      locSpan.textContent = `· ${evt.location}`;
      subEl.appendChild(locSpan);
    }

    if (evt.calendar) {
      const calTag = document.createElement('span');
      calTag.className = 'cal-tag';
      calTag.textContent = evt.calendar;
      subEl.appendChild(calTag);
    }

    bodyEl.appendChild(titleEl);
    bodyEl.appendChild(subEl);
    li.appendChild(timeEl);
    li.appendChild(bodyEl);
    el.todayList.appendChild(li);
  }
}

function renderTomorrowPreview(events, weather, tz) {
  const weatherPart =
    weather?.available && weather.tomorrowHigh !== null
      ? ` · ${weather.tomorrowCondition} ${weather.tomorrowHigh}°/${weather.tomorrowLow}°`
      : '';
  el.tomorrowMeta.textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}${weatherPart}`;

  el.tomorrowList.innerHTML = '';
  if (events.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Clear calendar tomorrow.';
    el.tomorrowList.appendChild(li);
    return;
  }

  for (const evt of events.slice(0, 4)) {
    const li = document.createElement('li');
    li.className = 'tomorrow-item';

    const timeEl = document.createElement('span');
    timeEl.className = 'tomorrow-time';
    timeEl.textContent = evt.allDay ? 'All day' : formatTime(evt.start, tz);

    const titleEl = document.createElement('span');
    titleEl.className = 'tomorrow-title';
    titleEl.textContent = evt.title;

    li.appendChild(timeEl);
    li.appendChild(titleEl);
    el.tomorrowList.appendChild(li);
  }
}

/* ============================================================================
   API Data Fetching
   ============================================================================ */
function buildBriefingUrl() {
  const params = new URLSearchParams();
  if (prefs.name) params.set('name', prefs.name);
  if (prefs.note !== null) params.set('note', prefs.note);
  if (prefs.city) params.set('city', prefs.city);
  if (prefs.lat !== null && prefs.lon !== null) {
    params.set('lat', String(prefs.lat));
    params.set('lon', String(prefs.lon));
  }
  if (prefs.tz) params.set('tz', prefs.tz);
  if (prefs.units) params.set('units', prefs.units);
  if (prefs.demo) params.set('demo', '1');

  const qs = params.toString();
  return qs ? `/api/briefing?${qs}` : '/api/briefing';
}

async function fetchBriefing() {
  try {
    const res = await fetch(buildBriefingUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderBriefing(data);
  } catch (err) {
    el.statusSync.textContent = `Sync retry pending (${err.message})`;
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const minutes = Math.max(1, Number(prefs.refreshMinutes) || 10);
  refreshTimer = setInterval(fetchBriefing, minutes * 60 * 1000);
}

/* ============================================================================
   Settings Drawer & Open-Meteo City Lookup
   ============================================================================ */
function openSettings() {
  pendingCitySelection =
    prefs.lat !== null && prefs.lon !== null
      ? { name: prefs.city, lat: prefs.lat, lon: prefs.lon, timezone: prefs.tz }
      : null;

  el.inputName.value = prefs.name || latestBriefing?.personName || '';
  el.selectTheme.value = prefs.themeMode;
  el.inputCitySearch.value = '';
  el.cityResults.classList.add('hidden');
  el.cityResults.innerHTML = '';

  const currentCity = prefs.city || latestBriefing?.location?.name || 'Default location';
  const currentTz = prefs.tz || latestBriefing?.timezone || '';
  el.citySelected.textContent = `Current: ${currentCity}${currentTz ? ` (${currentTz})` : ''}`;

  el.selectUnits.value = prefs.units || latestBriefing?.weather?.units || 'fahrenheit';
  el.selectRefresh.value = String(prefs.refreshMinutes || 10);
  el.inputNote.value = prefs.note !== null ? prefs.note : latestBriefing?.personalNote || '';
  el.togglePixelShift.checked = Boolean(prefs.pixelShift);
  el.toggleDemo.checked = Boolean(prefs.demo);

  el.backdrop.classList.remove('hidden');
  el.drawer.classList.remove('hidden');
  document.body.classList.remove('is-idle');
  if (idleTimer) clearTimeout(idleTimer);
  el.inputName.focus();
}

function closeSettings() {
  el.backdrop.classList.add('hidden');
  el.drawer.classList.add('hidden');
  resetIdleTimer();
}

async function performCityLookup() {
  const q = el.inputCitySearch.value.trim();
  if (q.length < 2) return;

  el.cityResults.innerHTML = '<div class="city-option">Searching…</div>';
  el.cityResults.classList.remove('hidden');

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const results = data.results || [];
    el.cityResults.innerHTML = '';

    if (results.length === 0) {
      el.cityResults.innerHTML = '<div class="city-option">No matching cities found.</div>';
      return;
    }

    for (const city of results) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'city-option';
      btn.innerHTML = `<span>${escapeHtml(city.name)}</span><span class="mono-sub">${escapeHtml(city.timezone)}</span>`;
      btn.addEventListener('click', () => {
        pendingCitySelection = {
          name: city.shortName || city.name,
          lat: city.lat,
          lon: city.lon,
          timezone: city.timezone,
        };
        el.citySelected.textContent = `Selected: ${pendingCitySelection.name} (${pendingCitySelection.timezone})`;
        el.cityResults.classList.add('hidden');
        el.inputCitySearch.value = pendingCitySelection.name;
      });
      el.cityResults.appendChild(btn);
    }
  } catch {
    el.cityResults.innerHTML = '<div class="city-option">City lookup unavailable offline.</div>';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================================
   Event Listeners & Initialization
   ============================================================================ */
el.btnTheme.addEventListener('click', cycleThemeMode);
el.btnRefresh.addEventListener('click', fetchBriefing);
el.btnSettings.addEventListener('click', openSettings);
el.btnCloseSettings.addEventListener('click', closeSettings);
el.backdrop.addEventListener('click', closeSettings);
el.btnCitySearch.addEventListener('click', performCityLookup);

el.inputCitySearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performCityLookup();
  }
});

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  prefs.name = el.inputName.value.trim();
  prefs.themeMode = el.selectTheme.value;
  prefs.units = el.selectUnits.value;
  prefs.refreshMinutes = Number(el.selectRefresh.value) || 10;
  prefs.note = el.inputNote.value.trim();
  prefs.pixelShift = el.togglePixelShift.checked;
  prefs.demo = el.toggleDemo.checked;

  if (pendingCitySelection) {
    prefs.city = pendingCitySelection.name;
    prefs.lat = pendingCitySelection.lat;
    prefs.lon = pendingCitySelection.lon;
    prefs.tz = pendingCitySelection.timezone;
  }

  savePrefs();
  applyTheme();
  startPixelShift();
  scheduleRefresh();
  closeSettings();
  fetchBriefing();
});

el.btnResetSettings.addEventListener('click', () => {
  prefs = { ...DEFAULT_PREFS };
  pendingCitySelection = null;
  savePrefs();
  applyTheme();
  startPixelShift();
  scheduleRefresh();
  closeSettings();
  fetchBriefing();
});

// Keyboard & Google TV Remote Shortcuts
document.addEventListener('keydown', (e) => {
  resetIdleTimer();
  const isTyping =
    document.activeElement &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

  if (e.key === 'Escape' && !el.drawer.classList.contains('hidden')) {
    closeSettings();
    return;
  }

  if (isTyping) return;

  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    if (el.drawer.classList.contains('hidden')) openSettings();
    else closeSettings();
  } else if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    cycleThemeMode();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    fetchBriefing();
  }
});

['mousemove', 'mousedown', 'touchstart', 'wheel'].forEach((evtName) => {
  document.addEventListener(evtName, resetIdleTimer, { passive: true });
});

// Boot
applyTheme();
updateClock();
setInterval(updateClock, 15000);
startPixelShift();
resetIdleTimer();
acquireWakeLock();
fetchBriefing();
scheduleRefresh();
