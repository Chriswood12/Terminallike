/**
 * Generates a self-contained iOS Scriptable widget script pre-configured
 * with the user's live Terminallike URL.
 *
 * Supports: Small, Medium, Large Home Screen widgets + Lock Screen (accessoryRectangular).
 */
export function buildScriptableSource(baseUrl = 'https://terminallike.vercel.app') {
  const safeBase = String(baseUrl || 'https://terminallike.vercel.app').replace(/\/+$/, '');

  return `// ============================================================================
// Terminallike — iOS Scriptable Widget (Small, Medium, Large & Lock Screen)
// Henter live data fra din Terminallike Vercel-app (/api/briefing)
//
// Valgfri Widget Parameter i Scriptable:
//   "auto"  (standard — følger solnedgang ligesom TV'et)
//   "oled"  (altid ren sort mørk tilstand)
//   "paper" (altid varm TRMNL papir-tilstand)
// ============================================================================

const BASE_URL = ${JSON.stringify(safeBase)};
const THEME_PARAM = (args.widgetParameter || 'auto').trim().toLowerCase();
const CACHE_FILE = 'terminallike_briefing_cache.json';

const THEMES = {
  paper: {
    bg: new Color('#F4F1EA'),
    card: new Color('#EAE5DA'),
    ink: new Color('#141413'),
    soft: new Color('#4A4741'),
    muted: new Color('#6E6A62'),
    rule: new Color('#D5D0C5'),
    accentBg: new Color('#141413'),
    accentInk: new Color('#F4F1EA'),
  },
  oled: {
    bg: new Color('#000000'),
    card: new Color('#141413'),
    ink: new Color('#E8E4DC'),
    soft: new Color('#B5AFA5'),
    muted: new Color('#888278'),
    rule: new Color('#262522'),
    accentBg: new Color('#E8E4DC'),
    accentInk: new Color('#000000'),
  },
};

function parseLocalMinutes(isoLocal) {
  if (!isoLocal) return null;
  const m = /T(\\d{2}):(\\d{2})/.exec(String(isoLocal));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function resolveTheme(briefing) {
  if (THEME_PARAM === 'oled' || THEME_PARAM === 'dark') return THEMES.oled;
  if (THEME_PARAM === 'paper' || THEME_PARAM === 'light') return THEMES.paper;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sunrise = parseLocalMinutes(briefing?.weather?.sunrise) ?? 7 * 60;
  const sunset = parseLocalMinutes(briefing?.weather?.sunset) ?? 20 * 60;
  return nowMin < sunrise || nowMin >= sunset ? THEMES.oled : THEMES.paper;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function fmtDuration(min) {
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? h + ' t' : h + ' t ' + m + ' m';
}

function fmtDateHeading(iso) {
  const d = new Date(iso || Date.now());
  const days = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
  const months = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
  return days[d.getDay()] + ' ' + d.getDate() + '. ' + months[d.getMonth()];
}

function fmtShortDate(iso) {
  const d = new Date(iso || Date.now());
  const days = ['SØN', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR'];
  return days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

async function fetchBriefingWithCache() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  try {
    const req = new Request(BASE_URL + '/api/briefing');
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    try {
      fm.writeString(cachePath, JSON.stringify(data));
    } catch (_) {}
    return { data, stale: false };
  } catch (err) {
    if (fm.fileExists(cachePath)) {
      try {
        return { data: JSON.parse(fm.readString(cachePath)), stale: true };
      } catch (_) {}
    }
    throw err;
  }
}

function addText(parent, text, { size = 13, weight = 'regular', mono = false, color, lines = 0, opacity = 1 } = {}) {
  const el = parent.addText(String(text || ''));
  if (mono) {
    el.font = weight === 'bold' ? Font.boldMonospacedSystemFont(size) : Font.regularMonospacedSystemFont(size);
  } else if (weight === 'bold') {
    el.font = Font.boldSystemFont(size);
  } else if (weight === 'semibold') {
    el.font = Font.semiboldSystemFont(size);
  } else {
    el.font = Font.systemFont(size);
  }
  if (color) el.textColor = color;
  if (lines > 0) el.lineLimit = lines;
  el.textOpacity = opacity;
  return el;
}

function addRule(parent, color) {
  const stack = parent.addStack();
  stack.size = new Size(0, 1);
  stack.backgroundColor = color;
  stack.addSpacer();
}

function upNextInfo(briefing) {
  const u = briefing?.upNext;
  if (!u || !u.event) {
    return {
      kicker: 'I DAG',
      badge: 'FRI',
      title: 'Fri kalender',
      meta: 'Ingen flere aftaler i dag',
    };
  }
  const ev = u.event;
  const timeStr = ev.allDay ? 'Heldag' : fmtTime(ev.start) + '–' + fmtTime(ev.end);
  const meta = ev.location ? timeStr + ' · ' + ev.location : timeStr;
  if (u.status === 'now') {
    return { kicker: 'NU', badge: fmtDuration(u.minutesRemaining) + ' igen', title: ev.title, meta };
  }
  if (u.status === 'upcoming') {
    return { kicker: 'NÆSTE', badge: 'Om ' + fmtDuration(u.minutesUntil), title: ev.title, meta };
  }
  return { kicker: 'I MORGEN', badge: 'Næste', title: ev.title, meta };
}

function getUpcomingToday(briefing, limit) {
  const nowMs = Date.now();
  const events = briefing?.today?.events || [];
  const remaining = events.filter((e) => e.allDay || new Date(e.end).getTime() > nowMs);
  return (remaining.length > 0 ? remaining : events).slice(0, limit);
}

function buildLockScreenWidget(briefing) {
  const w = new ListWidget();
  const info = upNextInfo(briefing);
  const temp = Number.isFinite(briefing?.weather?.temperature)
    ? ' · ' + Math.round(briefing.weather.temperature) + '°'
    : '';
  addText(w, info.kicker + ' · ' + info.badge.toUpperCase() + temp, { size: 10, weight: 'bold', mono: true, lines: 1 });
  addText(w, info.title, { size: 14, weight: 'bold', lines: 1 });
  addText(w, info.meta, { size: 11, lines: 1, opacity: 0.8 });
  return w;
}

function buildSmallWidget(briefing, c) {
  const w = new ListWidget();
  w.backgroundColor = c.bg;
  w.setPadding(14, 14, 12, 14);
  w.url = BASE_URL;

  const top = w.addStack();
  top.centerAlignContent();
  addText(top, fmtShortDate(briefing?.today?.dateIso), { size: 10, weight: 'bold', mono: true, color: c.muted });
  top.addSpacer();
  if (Number.isFinite(briefing?.weather?.temperature)) {
    addText(top, Math.round(briefing.weather.temperature) + '°', { size: 12, weight: 'bold', mono: true, color: c.ink });
  }

  w.addSpacer(8);
  const info = upNextInfo(briefing);

  const badgeRow = w.addStack();
  badgeRow.centerAlignContent();
  addText(badgeRow, info.kicker, { size: 9, weight: 'bold', mono: true, color: c.muted });
  badgeRow.addSpacer();
  const pill = badgeRow.addStack();
  pill.backgroundColor = c.accentBg;
  pill.cornerRadius = 4;
  pill.setPadding(2, 5, 2, 5);
  addText(pill, info.badge, { size: 9, weight: 'bold', mono: true, color: c.accentInk });

  w.addSpacer(6);
  addText(w, info.title, { size: 16, weight: 'bold', color: c.ink, lines: 2 });
  w.addSpacer(4);
  addText(w, info.meta, { size: 11, color: c.soft, lines: 2 });

  w.addSpacer();
  const count = briefing?.today?.count || 0;
  addText(w, count + (count === 1 ? ' aftale i dag' : ' aftaler i dag'), { size: 10, mono: true, color: c.muted });
  return w;
}

function buildMediumWidget(briefing, c) {
  const w = new ListWidget();
  w.backgroundColor = c.bg;
  w.setPadding(14, 16, 12, 16);
  w.url = BASE_URL;

  // Header
  const header = w.addStack();
  header.centerAlignContent();
  addText(header, fmtDateHeading(briefing?.today?.dateIso), { size: 14, weight: 'bold', color: c.ink, lines: 1 });
  header.addSpacer();
  const wt = briefing?.weather;
  if (Number.isFinite(wt?.temperature)) {
    addText(header, Math.round(wt.temperature) + '° ' + (wt.condition || ''), { size: 11, mono: true, color: c.soft, lines: 1 });
  }

  w.addSpacer(6);
  addRule(w, c.rule);
  w.addSpacer(8);

  const cols = w.addStack();
  cols.spacing = 14;

  // Left: Up Next Spotlight
  const left = cols.addStack();
  left.layoutVertically();
  left.size = new Size(145, 0);

  const info = upNextInfo(briefing);
  const badge = left.addStack();
  badge.backgroundColor = c.accentBg;
  badge.cornerRadius = 4;
  badge.setPadding(2, 6, 2, 6);
  addText(badge, info.kicker + ' · ' + info.badge, { size: 9, weight: 'bold', mono: true, color: c.accentInk, lines: 1 });

  left.addSpacer(6);
  addText(left, info.title, { size: 15, weight: 'bold', color: c.ink, lines: 2 });
  left.addSpacer(3);
  addText(left, info.meta, { size: 11, color: c.soft, lines: 2 });

  // Right: Today's Schedule
  const right = cols.addStack();
  right.layoutVertically();

  const items = getUpcomingToday(briefing, 4);
  if (items.length === 0) {
    addText(right, 'Ingen aftaler i dag', { size: 12, color: c.muted });
  } else {
    for (let i = 0; i < items.length; i++) {
      const ev = items[i];
      const row = right.addStack();
      row.centerAlignContent();
      row.spacing = 6;
      const tStr = ev.allDay ? 'Dag ' : fmtTime(ev.start);
      addText(row, tStr, { size: 11, mono: true, color: c.muted, lines: 1 });
      addText(row, ev.title, { size: 12, weight: 'semibold', color: c.ink, lines: 1 });
      if (i < items.length - 1) right.addSpacer(5);
    }
  }

  w.addSpacer();
  return w;
}

function buildLargeWidget(briefing, c, stale) {
  const w = new ListWidget();
  w.backgroundColor = c.bg;
  w.setPadding(16, 18, 14, 18);
  w.url = BASE_URL;

  // Masthead
  const kicker = w.addStack();
  kicker.centerAlignContent();
  addText(kicker, (briefing?.greeting || 'GODDAG').toUpperCase(), { size: 10, weight: 'bold', mono: true, color: c.muted });
  kicker.addSpacer();
  const wt = briefing?.weather;
  if (Number.isFinite(wt?.temperature)) {
    addText(kicker, Math.round(wt.temperature) + '° · ' + (wt.condition || ''), { size: 10, mono: true, color: c.soft });
  }

  w.addSpacer(2);
  addText(w, fmtDateHeading(briefing?.today?.dateIso), { size: 20, weight: 'bold', color: c.ink, lines: 1 });

  w.addSpacer(8);
  addRule(w, c.rule);
  w.addSpacer(10);

  // AI Summary
  if (briefing?.summary?.text) {
    addText(w, briefing.summary.text, { size: 12.5, color: c.soft, lines: 3 });
    w.addSpacer(10);
  }

  // Up Next Card
  const info = upNextInfo(briefing);
  const card = w.addStack();
  card.layoutVertically();
  card.backgroundColor = c.card;
  card.cornerRadius = 8;
  card.setPadding(9, 11, 9, 11);

  const cardTop = card.addStack();
  cardTop.centerAlignContent();
  addText(cardTop, info.kicker, { size: 9, weight: 'bold', mono: true, color: c.muted });
  cardTop.addSpacer();
  addText(cardTop, info.badge, { size: 9, weight: 'bold', mono: true, color: c.ink });
  card.addSpacer(3);
  addText(card, info.title, { size: 15, weight: 'bold', color: c.ink, lines: 1 });
  addText(card, info.meta, { size: 11, color: c.soft, lines: 1 });

  w.addSpacer(10);

  // Today's Schedule
  addText(w, 'DAGENS PROGRAM', { size: 9, weight: 'bold', mono: true, color: c.muted });
  w.addSpacer(5);

  const items = getUpcomingToday(briefing, 5);
  if (items.length === 0) {
    addText(w, 'Ingen aftaler i dag — nyd en rolig dag.', { size: 12, color: c.muted });
  } else {
    for (let i = 0; i < items.length; i++) {
      const ev = items[i];
      const row = w.addStack();
      row.centerAlignContent();
      row.spacing = 8;
      const tStr = ev.allDay ? 'Heldag' : fmtTime(ev.start);
      addText(row, tStr, { size: 11, mono: true, color: c.muted, lines: 1 });
      addText(row, ev.title, { size: 12.5, weight: 'semibold', color: c.ink, lines: 1 });
      row.addSpacer();
      if (ev.location) {
        addText(row, ev.location, { size: 10, color: c.muted, lines: 1 });
      }
      if (i < items.length - 1) w.addSpacer(4);
    }
  }

  w.addSpacer();
  const foot = w.addStack();
  addText(
    foot,
    (stale ? 'Offline-cache · ' : 'Opdateret ') + fmtTime(briefing?.generatedAt || new Date().toISOString()),
    { size: 9, mono: true, color: c.muted },
  );
  foot.addSpacer();
  addText(foot, briefing?.location?.name || 'Aarhus, DK', { size: 9, mono: true, color: c.muted });

  return w;
}

async function run() {
  let widget;
  try {
    const { data, stale } = await fetchBriefingWithCache();
    const theme = resolveTheme(data);
    const family = config.widgetFamily || 'medium';

    if (family === 'accessoryRectangular') {
      widget = buildLockScreenWidget(data);
    } else if (family === 'small') {
      widget = buildSmallWidget(data, theme);
    } else if (family === 'large') {
      widget = buildLargeWidget(data, theme, stale);
    } else {
      widget = buildMediumWidget(data, theme);
    }
  } catch (err) {
    widget = new ListWidget();
    widget.backgroundColor = THEMES.oled.bg;
    addText(widget, 'TERMINALLIKE', { size: 10, weight: 'bold', mono: true, color: THEMES.oled.muted });
    widget.addSpacer(4);
    addText(widget, 'Kunne ikke hente kalender', { size: 13, weight: 'bold', color: THEMES.oled.ink });
    addText(widget, String(err.message || err), { size: 10, color: THEMES.oled.muted, lines: 2 });
  }

  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
  Script.complete();
}

await run();
`;
}
