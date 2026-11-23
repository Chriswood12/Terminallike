/* ============================================================================
   Terminallike — 4K TV Frontend Controller (Dansk / da-DK)
   ============================================================================ */

const STORAGE_KEY = 'terminallike_prefs_v1';
const LOCALE = 'da-DK';
const IDLE_MS = 5000;
const PIXEL_SHIFT_INTERVAL_MS = 2 * 60 * 1000;
const URL_PARAMS = new URLSearchParams(window.location.search);
const IS_SCREENSAVER = URL_PARAMS.get('screensaver') === '1';
const DIM_PARAM = Number(URL_PARAMS.get('dim'));
if (Number.isFinite(DIM_PARAM) && DIM_PARAM >= 0.2 && DIM_PARAM <= 1) {
  document.documentElement.style.setProperty('--screensaver-dim', String(DIM_PARAM));
}

const DEFAULT_PREFS = {
  themeMode: 'auto', // 'auto' | 'paper' | 'oled'
  fontMode: 'atkinson', // 'atkinson' | 'lexend' | 'classic'
  viewMode: 'day', // 'day' | 'week'
  weekFilter: 'all', // 'all' | 'studie' | 'privat'
  autoRotate: true,
  pixelShift: true,
  refreshMinutes: 10,
  name: '',
  note: null,
  icsUrls: '',
  aiProvider: 'auto',
  aiApiKey: '',
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
let rotateTimer = null;
let idleTimer = null;
let pixelShiftTimer = null;
let pixelShiftStep = 0;
let wakeLockSentinel = null;
let pendingCitySelection = null;

const el = {
  canvas: document.getElementById('canvas'),
  dayView: document.getElementById('day-view'),
  weekView: document.getElementById('week-view'),
  weekTotals: document.getElementById('week-totals'),
  weekAiMeta: document.getElementById('week-ai-meta'),
  weekAiHeadline: document.getElementById('week-ai-headline'),
  weekAiHighlights: document.getElementById('week-ai-highlights'),
  weekGrid: document.getElementById('week-grid'),
  greetingKicker: document.getElementById('greeting-kicker'),
  btnMastheadView: document.getElementById('btn-masthead-view'),
  demoBadge: document.getElementById('demo-badge'),
  warningBadge: document.getElementById('warning-badge'),
  dateHeading: document.getElementById('date-heading'),
  weatherIcon: document.getElementById('weather-icon'),
  weatherTemp: document.getElementById('weather-temp'),
  weatherCond: document.getElementById('weather-cond'),
  weatherMeta: document.getElementById('weather-meta'),
  clockTime: document.getElementById('clock-time'),
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
  btnView: document.getElementById('btn-view'),
  btnTheme: document.getElementById('btn-theme'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnSettings: document.getElementById('btn-settings'),
  backdrop: document.getElementById('drawer-backdrop'),
  drawer: document.getElementById('settings-drawer'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  form: document.getElementById('settings-form'),
  inputName: document.getElementById('input-name'),
  selectTheme: document.getElementById('select-theme'),
  selectFont: document.getElementById('select-font'),
  inputCitySearch: document.getElementById('input-city-search'),
  btnCitySearch: document.getElementById('btn-city-search'),
  cityResults: document.getElementById('city-results'),
  citySelected: document.getElementById('city-selected'),
  selectUnits: document.getElementById('select-units'),
  selectRefresh: document.getElementById('select-refresh'),
  inputIcsUrls: document.getElementById('input-ics-urls'),
  selectAiProvider: document.getElementById('select-ai-provider'),
  inputAiKey: document.getElementById('input-ai-key'),
  inputNote: document.getElementById('input-note'),
  toggleAutoRotate: document.getElementById('toggle-auto-rotate'),
  togglePixelShift: document.getElementById('toggle-pixel-shift'),
  toggleDemo: document.getElementById('toggle-demo'),
  wakelockStatus: document.getElementById('wakelock-status'),
  btnResetSettings: document.getElementById('btn-reset-settings'),
};

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
    // Ignore storage errors
  }
}

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

function activeTimeZone() {
  return latestBriefing?.timezone || prefs.tz || 'Europe/Copenhagen';
}

function formatTime(iso, tz = activeTimeZone()) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace('.', ':');
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} t` : `${h} t ${m} m`;
}

function formatSunsetShort(isoLocal) {
  if (!isoLocal) return null;
  const match = /T(\d{2}):(\d{2})/.exec(isoLocal);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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
  document.documentElement.setAttribute('data-font', prefs.fontMode || 'atkinson');

  const sunsetLabel = formatSunsetShort(latestBriefing?.weather?.sunset);
  if (prefs.themeMode === 'auto') {
    el.statusTheme.textContent = sunsetLabel
      ? `Tema: Auto (${resolved === 'paper' ? 'Papir' : 'OLED'} · Solnedgang ${sunsetLabel})`
      : `Tema: Auto (${resolved === 'paper' ? 'Papir' : 'OLED'})`;
  } else {
    el.statusTheme.textContent =
      resolved === 'paper' ? 'Tema: TRMNL Papir' : 'Tema: OLED-sikker Blæk';
  }
}

function cycleThemeMode() {
  const order = ['auto', 'paper', 'oled'];
  const next = order[(order.indexOf(prefs.themeMode) + 1) % order.length];
  prefs.themeMode = next;
  savePrefs();
  applyTheme();
}

function updatePixelShift() {
  if (!prefs.pixelShift) {
    document.documentElement.style.setProperty('--shift-x', '0px');
    document.documentElement.style.setProperty('--shift-y', '0px');
    el.statusProtection.textContent = 'OLED-forskydning: Fra';
    return;
  }

  pixelShiftStep = (pixelShiftStep + 1) % 24;
  const angle = (pixelShiftStep / 24) * Math.PI * 2;
  const x = Math.round(Math.sin(angle) * 6);
  const y = Math.round(Math.cos(angle * 2) * 4);
  document.documentElement.style.setProperty('--shift-x', `${x}px`);
  document.documentElement.style.setProperty('--shift-y', `${y}px`);
  el.statusProtection.textContent = 'OLED-forskydning: Til';
}

function startPixelShift() {
  if (pixelShiftTimer) clearInterval(pixelShiftTimer);
  el.statusProtection.textContent = prefs.pixelShift
    ? 'OLED-forskydning: Til'
    : 'OLED-forskydning: Fra';
  if (!prefs.pixelShift) {
    document.documentElement.style.setProperty('--shift-x', '0px');
    document.documentElement.style.setProperty('--shift-y', '0px');
    return;
  }
  pixelShiftTimer = setInterval(updatePixelShift, PIXEL_SHIFT_INTERVAL_MS);
}

function resetIdleTimer() {
  if (IS_SCREENSAVER) {
    document.body.classList.add('is-screensaver', 'is-idle');
    return;
  }
  document.body.classList.remove('is-idle');
  if (idleTimer) clearTimeout(idleTimer);
  if (!el.drawer.classList.contains('hidden')) return;
  idleTimer = setTimeout(() => {
    document.body.classList.add('is-idle');
  }, IDLE_MS);
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) {
    el.wakelockStatus.textContent = 'Skærmlås (Wake Lock): Ikke understøttet i denne browser';
    return;
  }
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    el.wakelockStatus.textContent = 'Skærmlås (Wake Lock): Aktiv (skærmen holdes vågen)';
    wakeLockSentinel.addEventListener('release', () => {
      el.wakelockStatus.textContent = 'Skærmlås (Wake Lock): Standby';
    });
  } catch {
    el.wakelockStatus.textContent = 'Skærmlås (Wake Lock): Afventer interaktion';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    acquireWakeLock();
  }
});

function updateClock() {
  const now = new Date();
  const tz = activeTimeZone();
  el.clockTime.textContent = formatTime(now.toISOString(), tz);

  const formattedDate = new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  el.dateHeading.textContent = capitalize(formattedDate);

  if (prefs.themeMode === 'auto' && latestBriefing) {
    applyTheme();
  }
}

function renderBriefing(data) {
  latestBriefing = data;
  const tz = data.timezone;

  el.greetingKicker.textContent = data.greeting.toUpperCase();
  el.demoBadge.classList.toggle('hidden', !data.demoMode);

  if (data.meta?.warnings?.length) {
    el.warningBadge.textContent = `${data.meta.warnings.length} KALENDER-ADVARSEL`;
    el.warningBadge.title = data.meta.warnings.join('\n');
    el.warningBadge.classList.remove('hidden');
  } else {
    el.warningBadge.classList.add('hidden');
  }

  const w = data.weather;
  el.weatherIcon.innerHTML = getWeatherSvg(w?.icon || 'sun-cloud');
  if (w && w.available && w.temperature !== null) {
    el.weatherTemp.textContent = `${w.temperature}${w.unitSymbol}`;
    el.weatherCond.textContent = w.condition;
    const sunsetText = formatSunsetShort(w.sunset);
    const metaParts = [
      w.locationName,
      `H ${w.high}° · L ${w.low}°`,
      sunsetText ? `Solnedgang ${sunsetText}` : null,
    ].filter(Boolean);
    el.weatherMeta.textContent = metaParts.join(' · ');
  } else {
    el.weatherTemp.textContent = '--°';
    el.weatherCond.textContent = 'Vejr offline';
    el.weatherMeta.textContent = w?.locationName || 'Tjek netværksforbindelsen';
  }

  el.aiSummary.textContent = data.summary?.text || 'Intet overblik tilgængeligt.';
  const providerLabel =
    data.summary?.provider && data.summary.provider !== 'local'
      ? `AI · ${data.summary.provider.toUpperCase()}`
      : 'SMART OVERBLIK';
  el.summaryMeta.textContent = `${providerLabel}${data.summary?.cached ? ' · GEMT' : ''}`;

  renderUpNext(data.upNext, tz);
  renderDayRhythm(data.dayRhythm);

  if (data.personalNote) {
    el.noteText.textContent = data.personalNote;
    el.noteBlock.classList.remove('hidden');
  } else {
    el.noteBlock.classList.add('hidden');
  }

  renderTodaySchedule(data.today?.events || [], tz);
  renderTomorrowPreview(data.tomorrow?.events || [], data.weather, tz);
  renderWeekOverview(data.week, tz);

  el.statusSync.textContent = `Opdateret ${formatTime(data.generatedAt, tz)}`;

  updateClock();
  applyTheme();
}

function renderUpNext(upNext, tz) {
  if (!upNext || !upNext.event) {
    el.upNextLabel.textContent = 'NÆSTE PÅ PROGRAMMET';
    el.upNextCountdown.textContent = 'HELT FRI';
    el.upNextTitle.textContent = 'Fri resten af dagen';
    el.upNextMeta.textContent = 'Ingen flere planlagte aftaler.';
    return;
  }

  const evt = upNext.event;
  if (upNext.status === 'now') {
    el.upNextLabel.textContent = 'I GANG NU';
    el.upNextCountdown.textContent = `${formatDuration(upNext.minutesRemaining)} TILBAGE`;
  } else if (upNext.status === 'upcoming') {
    el.upNextLabel.textContent = 'NÆSTE PÅ PROGRAMMET';
    el.upNextCountdown.textContent = `OM ${formatDuration(upNext.minutesUntil)}`;
  } else {
    el.upNextLabel.textContent = 'FØRST I MORGEN';
    el.upNextCountdown.textContent = evt.allDay ? 'HELE DAGEN' : `KL. ${formatTime(evt.start, tz)}`;
  }

  el.upNextTitle.textContent = evt.title;

  const metaBits = [
    evt.allDay ? 'Hele dagen' : `${formatTime(evt.start, tz)} – ${formatTime(evt.end, tz)}`,
    evt.location || null,
    evt.calendar || null,
  ].filter(Boolean);
  el.upNextMeta.textContent = metaBits.join('  ·  ');
}

function renderDayRhythm(rhythm) {
  el.rhythmTrack.innerHTML = '';

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
    ? ` · Bedste pause: ${rhythm.longestOpenWindow.label}`
    : '';
  el.rhythmStats.textContent = `${busyStr} optaget · ${freeStr} fri${openStr}`;
}

function renderTodaySchedule(events, tz) {
  const allDay = events.filter((e) => e.allDay);
  const timed = events.filter((e) => !e.allDay);

  el.todayCount.textContent = `${events.length} ${events.length === 1 ? 'aftale' : 'aftaler'}`;

  el.alldayStrip.innerHTML = '';
  if (allDay.length > 0) {
    el.alldayStrip.classList.remove('hidden');
    for (const evt of allDay) {
      const chip = document.createElement('span');
      chip.className = 'allday-chip';
      chip.textContent = `HELE DAGEN · ${evt.title}`;
      el.alldayStrip.appendChild(chip);
    }
  } else {
    el.alldayStrip.classList.add('hidden');
  }

  el.todayList.innerHTML = '';
  if (timed.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent =
      allDay.length > 0
        ? 'Ingen tidsbestemte aftaler i dag — nyd den frie dag.'
        : 'Din kalender er helt fri i dag.';
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
  el.tomorrowMeta.textContent = `${events.length} ${events.length === 1 ? 'aftale' : 'aftaler'}${weatherPart}`;

  el.tomorrowList.innerHTML = '';
  if (events.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Ingen aftaler i morgen.';
    el.tomorrowList.appendChild(li);
    return;
  }

  for (const evt of events.slice(0, 4)) {
    const li = document.createElement('li');
    li.className = 'tomorrow-item';

    const timeEl = document.createElement('span');
    timeEl.className = 'tomorrow-time';
    timeEl.textContent = evt.allDay ? 'Hele dagen' : formatTime(evt.start, tz);

    const titleEl = document.createElement('span');
    titleEl.className = 'tomorrow-title';
    titleEl.textContent = evt.title;

    li.appendChild(timeEl);
    li.appendChild(titleEl);
    el.tomorrowList.appendChild(li);
  }
}

function updateMastheadViewPill() {
  const isWeek = prefs.viewMode === 'week';
  if (isWeek) {
    el.btnMastheadView.textContent = '← TILBAGE TIL I DAG';
    return;
  }
  const t = latestBriefing?.week?.totals;
  if (t && t.totalEvents > 0) {
    el.btnMastheadView.textContent = `UGE · ${t.studieEvents} STUDIE · ${t.privatEvents} PRIVAT →`;
  } else {
    el.btnMastheadView.textContent = 'UGEOVERBLIK →';
  }
}

function applyViewMode() {
  const isWeek = prefs.viewMode === 'week';
  el.dayView.classList.toggle('hidden', isWeek);
  el.weekView.classList.toggle('hidden', !isWeek);
  el.btnView.textContent = isWeek ? 'Dag' : 'Uge';
  updateMastheadViewPill();
}

function toggleViewMode() {
  prefs.viewMode = prefs.viewMode === 'week' ? 'day' : 'week';
  savePrefs();
  applyViewMode();
}

function startAutoRotate() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = null;
  if (!prefs.autoRotate) return;
  rotateTimer = setInterval(() => {
    if (!el.drawer.classList.contains('hidden')) return;
    prefs.viewMode = prefs.viewMode === 'week' ? 'day' : 'week';
    applyViewMode();
  }, 45000);
}

function renderWeekOverview(week, tz) {
  updateMastheadViewPill();

  if (!week || !Array.isArray(week.days)) {
    el.weekTotals.textContent = 'Ingen ugedata';
    el.weekGrid.innerHTML = '';
    return;
  }

  // Render AI Weekly Study, Homework & Planning Summary
  const ws = week.summary;
  if (ws) {
    const providerLabel =
      ws.provider && ws.provider !== 'local'
        ? `AI · ${ws.provider.toUpperCase()}`
        : 'SMART OVERBLIK';
    el.weekAiMeta.textContent = `${providerLabel}${ws.cached ? ' · GEMT' : ''}`;
    el.weekAiMeta.title = ws.fallbackReason ? `Fallback: ${ws.fallbackReason}` : '';
    el.weekAiHeadline.textContent = ws.headline || 'Ingen ugeopsummering tilgængelig.';

    el.weekAiHighlights.innerHTML = '';
    const items = Array.isArray(ws.highlights) && ws.highlights.length > 0
      ? ws.highlights
      : ['Ingen særlige punkter at fremhæve i denne uge.'];
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      el.weekAiHighlights.appendChild(li);
    }
  }

  const filter = prefs.weekFilter || 'all';
  document.querySelectorAll('[data-week-filter]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.weekFilter === filter);
  });

  const t = week.totals || {};
  const parts = [
    `${t.totalEvents || 0} aftaler`,
    `${t.studieEvents || 0} Studie`,
    `${t.privatEvents || 0} Privat`,
  ];
  if (t.busiestDay) parts.push(`Travleste dag: ${t.busiestDay}`);
  el.weekTotals.textContent = parts.join(' · ');

  el.weekGrid.innerHTML = '';
  for (const day of week.days) {
    const col = document.createElement('article');
    col.className = 'week-day';
    if (day.isToday) col.classList.add('is-today');

    const head = document.createElement('div');
    head.className = 'week-day-head';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'week-day-name';
    nameSpan.textContent = day.isToday ? `I DAG · ${day.weekdayShort}` : day.weekdayShort;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'week-day-date';
    dateSpan.textContent = day.dateShort;

    head.appendChild(nameSpan);
    head.appendChild(dateSpan);

    const list = document.createElement('ol');
    list.className = 'week-day-events';

    const filteredEvents = (day.events || []).filter((evt) => {
      if (filter === 'all') return true;
      return (evt.category || 'privat') === filter;
    });

    if (filteredEvents.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'week-empty';
      empty.textContent = filter === 'studie' ? 'Ingen undervisning' : 'Fri dag';
      list.appendChild(empty);
    } else {
      for (const evt of filteredEvents) {
        const isStudie = (evt.category || 'privat') === 'studie';
        const li = document.createElement('li');
        li.className = `week-event ${isStudie ? 'is-studie' : 'is-privat'}`;

        const top = document.createElement('div');
        top.className = 'week-event-top';

        const timeEl = document.createElement('span');
        timeEl.className = 'week-event-time';
        timeEl.textContent = evt.allDay
          ? 'Hele dagen'
          : `${formatTime(evt.start, tz)}–${formatTime(evt.end, tz)}`;

        const pill = document.createElement('span');
        pill.className = `week-pill ${isStudie ? 'week-pill-studie' : 'week-pill-privat'}`;
        pill.textContent = evt.calendar || (isStudie ? 'Studie' : 'Privat');

        top.appendChild(timeEl);
        top.appendChild(pill);

        const titleEl = document.createElement('div');
        titleEl.className = 'week-event-title';
        titleEl.textContent = evt.title;

        li.appendChild(top);
        li.appendChild(titleEl);

        if (evt.location) {
          const locEl = document.createElement('div');
          locEl.className = 'week-event-loc';
          locEl.textContent = evt.location;
          li.appendChild(locEl);
        }

        if (isStudie && evt.description) {
          const cleanNote = String(evt.description)
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanNote) {
            const descEl = document.createElement('div');
            descEl.className = 'week-event-desc';
            descEl.textContent = cleanNote;
            li.appendChild(descEl);
          }
        }

        list.appendChild(li);
      }
    }

    col.appendChild(head);
    col.appendChild(list);
    el.weekGrid.appendChild(col);
  }
}

function buildRequestOptions() {
  const payload = {};
  if (prefs.name) payload.name = prefs.name;
  if (prefs.note !== null) payload.note = prefs.note;
  if (prefs.city) payload.city = prefs.city;
  if (prefs.lat !== null && prefs.lon !== null) {
    payload.lat = prefs.lat;
    payload.lon = prefs.lon;
  }
  if (prefs.tz) payload.tz = prefs.tz;
  if (prefs.units) payload.units = prefs.units;
  if (prefs.demo) payload.demo = '1';

  // Use POST when user entered private .ics URLs or an AI API key locally so secrets never appear in URL query logs
  const hasSecrets =
    (prefs.icsUrls && prefs.icsUrls.trim()) ||
    (prefs.aiApiKey && prefs.aiApiKey.trim()) ||
    (prefs.aiProvider && prefs.aiProvider !== 'auto');

  if (hasSecrets) {
    if (prefs.icsUrls && prefs.icsUrls.trim()) payload.icsUrls = prefs.icsUrls.trim();
    if (prefs.aiProvider) payload.aiProvider = prefs.aiProvider;
    if (prefs.aiApiKey && prefs.aiApiKey.trim()) payload.aiApiKey = prefs.aiApiKey.trim();
    return {
      url: '/api/briefing',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    };
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    params.set(k, String(v));
  }
  const qs = params.toString();
  return {
    url: qs ? `/api/briefing?${qs}` : '/api/briefing',
    init: { method: 'GET', cache: 'no-store' },
  };
}

async function fetchBriefing() {
  try {
    const { url, init } = buildRequestOptions();
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderBriefing(data);
  } catch (err) {
    el.statusSync.textContent = `Afventer opdatering (${err.message})`;
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const minutes = Math.max(1, Number(prefs.refreshMinutes) || 10);
  refreshTimer = setInterval(fetchBriefing, minutes * 60 * 1000);
}

function openSettings() {
  pendingCitySelection =
    prefs.lat !== null && prefs.lon !== null
      ? { name: prefs.city, lat: prefs.lat, lon: prefs.lon, timezone: prefs.tz }
      : null;

  el.inputName.value = prefs.name || latestBriefing?.personName || '';
  el.selectTheme.value = prefs.themeMode;
  el.selectFont.value = prefs.fontMode || 'atkinson';
  el.inputCitySearch.value = '';
  el.cityResults.classList.add('hidden');
  el.cityResults.innerHTML = '';

  const currentCity = prefs.city || latestBriefing?.location?.name || 'Aarhus, DK';
  const currentTz = prefs.tz || latestBriefing?.timezone || 'Europe/Copenhagen';
  el.citySelected.textContent = `Valgt: ${currentCity}${currentTz ? ` (${currentTz})` : ''}`;

  el.selectUnits.value = prefs.units || latestBriefing?.weather?.units || 'celsius';
  el.selectRefresh.value = String(prefs.refreshMinutes || 10);
  el.inputIcsUrls.value = prefs.icsUrls || '';
  el.selectAiProvider.value = prefs.aiProvider || 'auto';
  el.inputAiKey.value = prefs.aiApiKey || '';
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

  el.cityResults.innerHTML = '<div class="city-option">Søger…</div>';
  el.cityResults.classList.remove('hidden');

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const results = data.results || [];
    el.cityResults.innerHTML = '';

    if (results.length === 0) {
      el.cityResults.innerHTML = '<div class="city-option">Ingen byer fundet.</div>';
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
        el.citySelected.textContent = `Valgt: ${pendingCitySelection.name} (${pendingCitySelection.timezone})`;
        el.cityResults.classList.add('hidden');
        el.inputCitySearch.value = pendingCitySelection.name;
      });
      el.cityResults.appendChild(btn);
    }
  } catch {
    el.cityResults.innerHTML = '<div class="city-option">Bysøgning er offline.</div>';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

el.btnView.addEventListener('click', toggleViewMode);
el.btnMastheadView.addEventListener('click', toggleViewMode);
el.btnTheme.addEventListener('click', cycleThemeMode);
el.btnRefresh.addEventListener('click', fetchBriefing);
el.btnSettings.addEventListener('click', openSettings);
el.btnCloseSettings.addEventListener('click', closeSettings);
el.backdrop.addEventListener('click', closeSettings);
el.btnCitySearch.addEventListener('click', performCityLookup);

document.querySelectorAll('[data-week-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    prefs.weekFilter = btn.dataset.weekFilter || 'all';
    savePrefs();
    if (latestBriefing) {
      renderWeekOverview(latestBriefing.week, latestBriefing.timezone);
    }
  });
});

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
  prefs.fontMode = el.selectFont.value || 'atkinson';
  prefs.units = el.selectUnits.value;
  prefs.refreshMinutes = Number(el.selectRefresh.value) || 10;
  prefs.icsUrls = el.inputIcsUrls.value.trim();
  prefs.aiProvider = el.selectAiProvider.value || 'auto';
  prefs.aiApiKey = el.inputAiKey.value.trim();
  prefs.note = el.inputNote.value.trim();
  prefs.autoRotate = el.toggleAutoRotate.checked;
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
  applyViewMode();
  startAutoRotate();
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
  applyViewMode();
  startAutoRotate();
  startPixelShift();
  scheduleRefresh();
  closeSettings();
  fetchBriefing();
});

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

  if (e.key === 'u' || e.key === 'U') {
    e.preventDefault();
    toggleViewMode();
  } else if (e.key === 's' || e.key === 'S') {
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

applyTheme();
applyViewMode();
updateClock();
setInterval(updateClock, 15000);
startAutoRotate();
startPixelShift();
resetIdleTimer();
acquireWakeLock();
fetchBriefing();
scheduleRefresh();
