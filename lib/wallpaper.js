import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.join(__dirname, 'fonts');

const FONT_FILES = [
  path.join(FONTS_DIR, 'AtkinsonHyperlegible-Regular.ttf'),
  path.join(FONTS_DIR, 'AtkinsonHyperlegible-Bold.ttf'),
  path.join(FONTS_DIR, 'JetBrainsMono-Regular.ttf'),
];

const LOCALE = 'da-DK';

const THEMES = {
  paper: {
    bg: '#F4F1EA',
    surface: '#ECE8DF',
    cardBg: '#FAF8F3',
    ink: '#141413',
    inkSoft: '#4A4741',
    inkMuted: '#6E6A62',
    rule: '#D8D3C8',
    ruleStrong: '#141413',
    accentBg: '#141413',
    accentInk: '#F4F1EA',
    blockFill: '#242320',
    nowLine: '#B3432A',
    pillBg: '#E4DFD4',
    pillInk: '#2B2A27',
    studyBg: '#141413',
    studyInk: '#F4F1EA',
    dotColor: '#D4CFC3',
  },
  oled: {
    bg: '#000000',
    surface: '#0C0C0B',
    cardBg: '#0E0E0D',
    ink: '#E8E4DC',
    inkSoft: '#B5AFA5',
    inkMuted: '#888278',
    rule: '#262522',
    ruleStrong: '#E8E4DC',
    accentBg: '#E8E4DC',
    accentInk: '#000000',
    blockFill: '#CFC9BE',
    nowLine: '#E2725B',
    pillBg: '#1A1917',
    pillInk: '#CFC9BE',
    studyBg: '#E8E4DC',
    studyInk: '#000000',
    dotColor: '#161614',
  },
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseLocalMinutes(isoLocal) {
  if (!isoLocal) return null;
  const m = /T(\d{2}):(\d{2})/.exec(String(isoLocal));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function getLocalMinutesNow(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

export function resolveWallpaperTheme(briefing, themeParam = 'auto') {
  const mode = String(themeParam || 'auto').toLowerCase();
  if (mode === 'paper' || mode === 'light') return 'paper';
  if (mode === 'oled' || mode === 'dark') return 'oled';

  const now = new Date(briefing.generatedAt || Date.now());
  const tz = briefing.timezone || 'Europe/Copenhagen';
  const nowMin = getLocalMinutesNow(now, tz);
  const sunriseMin = parseLocalMinutes(briefing.weather?.sunrise) ?? 7 * 60;
  const sunsetMin = parseLocalMinutes(briefing.weather?.sunset) ?? 20 * 60;
  return nowMin < sunriseMin || nowMin >= sunsetMin ? 'oled' : 'paper';
}

function formatTime(iso, tz) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace('.', ':');
}

function formatDateHeading(iso, tz) {
  const raw = new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatSunsetShort(isoLocal) {
  if (!isoLocal) return null;
  const m = /T(\d{2}):(\d{2})/.exec(String(isoLocal));
  return m ? `${m[1]}:${m[2]}` : null;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} t` : `${h} t ${m} m`;
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // Ellipsize last line if we truncated words
  const joined = lines.join(' ');
  const full = words.join(' ');
  if (joined.length < full.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last.endsWith('…')) {
      lines[lines.length - 1] =
        last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    }
  }
  return lines;
}

function truncate(str, maxChars) {
  const s = String(str || '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 1)}…`;
}

function renderWeatherIcon(iconKey, x, y, size, color) {
  const scale = size / 32;
  const common = `fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  let inner = `<circle cx="16" cy="16" r="5.5" ${common}/>`;
  switch (iconKey) {
    case 'sun':
      inner = `<circle cx="16" cy="16" r="5.5" ${common}/><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.2 2.2M23 23l2.2 2.2M25.2 6.8L23 9M9 23l-2.2 2.2" ${common}/>`;
      break;
    case 'sun-cloud':
      inner = `<path d="M12 13a4.5 4.5 0 1 1 7.6-2.5M15 4v2M7.5 7.5l1.5 1.5M22.5 7.5L21 9" ${common}/><path d="M9.5 24h13.5a4.5 4.5 0 0 0 .8-8.9A6 6 0 0 0 12.2 14a4.8 4.8 0 0 0-2.7 10z" ${common}/>`;
      break;
    case 'cloud':
      inner = `<path d="M8.5 24h15a5 5 0 0 0 .8-9.9A6.5 6.5 0 0 0 12 13a5.5 5.5 0 0 0-3.5 11z" ${common}/>`;
      break;
    case 'fog':
      inner = `<path d="M7 14h18M5 19h22M9 24h14M10 10a5 5 0 0 1 9.5-1.5" ${common}/>`;
      break;
    case 'drizzle':
    case 'rain':
      inner = `<path d="M8.5 19h15a4.5 4.5 0 0 0 .7-8.9A6 6 0 0 0 12.4 9.5 4.8 4.8 0 0 0 8.5 19z" ${common}/><path d="M11 23l-1.2 4M16.5 23l-1.2 4M22 23l-1.2 4" ${common}/>`;
      break;
    case 'snow':
      inner = `<path d="M8.5 19h15a4.5 4.5 0 0 0 .7-8.9A6 6 0 0 0 12.4 9.5 4.8 4.8 0 0 0 8.5 19z" ${common}/><circle cx="11.5" cy="24.5" r="1.2" fill="${color}"/><circle cx="16.5" cy="26" r="1.2" fill="${color}"/><circle cx="21.5" cy="24.5" r="1.2" fill="${color}"/>`;
      break;
    case 'storm':
      inner = `<path d="M8.5 18h15a4.5 4.5 0 0 0 .7-8.9A6 6 0 0 0 12.4 8.5 4.8 4.8 0 0 0 8.5 18z" ${common}/><path d="M16.5 18L13 24h4l-1.5 5" ${common}/>`;
      break;
  }
  return `<g transform="translate(${x}, ${y}) scale(${scale.toFixed(3)})">${inner}</g>`;
}

/**
 * Renders a 1920x1080 TRMNL-inspired SVG of the current Terminallike briefing.
 */
export function buildWallpaperSvg(briefing, { themeMode = 'auto' } = {}) {
  const activeTheme = resolveWallpaperTheme(briefing, themeMode);
  const c = THEMES[activeTheme];
  const tz = briefing.timezone || 'Europe/Copenhagen';
  const now = new Date(briefing.generatedAt || Date.now());

  const greetingText = String(briefing.greeting || 'GODDAG').toUpperCase();
  const dateHeading = formatDateHeading(briefing.today?.dateIso || now.toISOString(), tz);
  const clockText = formatTime(now.toISOString(), tz);

  // Weather
  const w = briefing.weather || {};
  const tempText = Number.isFinite(w.temperature) ? `${Math.round(w.temperature)}°` : '--°';
  const condText = truncate(w.condition || 'Lokalt vejr', 24);
  const sunsetShort = formatSunsetShort(w.sunset);
  const weatherMetaParts = [];
  if (w.locationName) weatherMetaParts.push(w.locationName);
  if (Number.isFinite(w.high) && Number.isFinite(w.low)) {
    weatherMetaParts.push(`H ${Math.round(w.high)}° · L ${Math.round(w.low)}°`);
  }
  if (sunsetShort) weatherMetaParts.push(`Sol ned ${sunsetShort}`);
  const weatherMetaText = weatherMetaParts.join(' · ') || 'Vejrudsigt utilgængelig';

  // AI Summary
  const summaryText = briefing.summary?.text || 'Ingen opsummering tilgængelig endnu.';
  const summaryLines = wrapText(summaryText, 52, 5);
  const summaryMeta =
    briefing.summary?.provider && briefing.summary.provider !== 'local'
      ? `${String(briefing.summary.provider).toUpperCase()} · OVERBLIK`
      : 'DAGENS OVERBLIK';

  // Up Next Spotlight
  const upNext = briefing.upNext;
  let upNextKicker = 'NÆSTE PÅ PROGRAMMET';
  let upNextCountdown = 'FRI DAG';
  let upNextTitle = 'Fri kalender';
  let upNextMeta = 'Ingen flere tidsbestemte aftaler i dag.';

  if (upNext && upNext.event) {
    const ev = upNext.event;
    upNextTitle = truncate(ev.title, 44);
    const timeRange = ev.allDay ? 'Heldag' : `${formatTime(ev.start, tz)} – ${formatTime(ev.end, tz)}`;
    const metaParts = [timeRange];
    if (ev.location) metaParts.push(truncate(ev.location, 30));
    if (ev.calendar) metaParts.push(ev.calendar);
    upNextMeta = metaParts.join(' · ');

    if (upNext.status === 'now') {
      upNextKicker = 'IGANGVÆRENDE';
      upNextCountdown = `${formatDuration(upNext.minutesRemaining)} tilbage`;
    } else if (upNext.status === 'upcoming') {
      upNextKicker = 'NÆSTE PÅ PROGRAMMET';
      upNextCountdown = `Om ${formatDuration(upNext.minutesUntil)}`;
    } else {
      upNextKicker = 'FØRSTE I MORGEN';
      upNextCountdown = 'I MORGEN';
    }
  }

  // Day Rhythm (07 - 21)
  const rhythm = briefing.dayRhythm || { blocks: [], busyMinutes: 0, freeMinutes: 840, nowPct: null };
  const rhythmStats = `${formatDuration(rhythm.busyMinutes || 0)} planlagt · ${formatDuration(rhythm.freeMinutes || 0)} fri`;
  const trackX = 80;
  const trackY = 744;
  const trackW = 820;
  const trackH = 38;

  const rhythmGridLines = [0, 2, 4, 6, 8, 10, 12, 14].map((offset) => {
    const gx = trackX + (offset / 14) * trackW;
    const hourLabel = String(7 + offset).padStart(2, '0');
    return `
      <line x1="${gx.toFixed(1)}" y1="${trackY}" x2="${gx.toFixed(1)}" y2="${trackY + trackH}" stroke="${c.rule}" stroke-width="1" />
      <text x="${gx.toFixed(1)}" y="${trackY + trackH + 22}" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="14" text-anchor="middle">${hourLabel}</text>
    `;
  });

  const rhythmBlocks = (rhythm.blocks || []).map((b) => {
    const bx = trackX + (b.startPct / 100) * trackW;
    const bw = Math.max(6, (b.widthPct / 100) * trackW);
    return `<rect x="${bx.toFixed(1)}" y="${trackY + 5}" width="${bw.toFixed(1)}" height="${trackH - 10}" rx="4" fill="${c.blockFill}" />`;
  });

  const rhythmNowMarker =
    typeof rhythm.nowPct === 'number'
      ? `<line x1="${(trackX + (rhythm.nowPct / 100) * trackW).toFixed(1)}" y1="${trackY - 6}" x2="${(trackX + (rhythm.nowPct / 100) * trackW).toFixed(1)}" y2="${trackY + trackH + 6}" stroke="${c.nowLine}" stroke-width="3" stroke-linecap="round" />`
      : '';

  // Personal Note
  const personalNote = briefing.personalNote ? wrapText(briefing.personalNote, 58, 2) : [];

  // Today's Events (Right Column)
  const todayEvents = briefing.today?.events || [];
  const allDayEvents = todayEvents.filter((e) => e.allDay);
  const timedEvents = todayEvents.filter((e) => !e.allDay);
  const todayCountLabel = `${todayEvents.length} ${todayEvents.length === 1 ? 'aftale' : 'aftaler'}`;

  let rightY = 278;
  const todaySvgParts = [];

  if (allDayEvents.length > 0) {
    const allDayLabel = allDayEvents.map((e) => truncate(e.title, 28)).slice(0, 3).join('  ·  ');
    todaySvgParts.push(`
      <rect x="980" y="${rightY}" width="860" height="42" rx="6" fill="${c.pillBg}" />
      <text x="998" y="${rightY + 26}" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="13" letter-spacing="1.2">HELDAG</text>
      <text x="1084" y="${rightY + 27}" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="18" font-weight="700">${esc(truncate(allDayLabel, 68))}</text>
    `);
    rightY += 56;
  }

  const maxTodayRows = allDayEvents.length > 0 ? 6 : 7;
  const shownToday = timedEvents.slice(0, maxTodayRows);

  if (shownToday.length === 0 && allDayEvents.length === 0) {
    todaySvgParts.push(`
      <text x="980" y="${rightY + 34}" fill="${c.inkMuted}" font-family="Atkinson Hyperlegible" font-size="22">Ingen aftaler i dag — nyd en rolig dag.</text>
    `);
  } else {
    for (let i = 0; i < shownToday.length; i++) {
      const ev = shownToday[i];
      const isPast = new Date(ev.end).getTime() <= now.getTime();
      const isNow = new Date(ev.start).getTime() <= now.getTime() && new Date(ev.end).getTime() > now.getTime();
      const rowOpacity = isPast ? '0.45' : '1';
      const timeStr = `${formatTime(ev.start, tz)}–${formatTime(ev.end, tz)}`;
      const subParts = [];
      if (ev.location) subParts.push(truncate(ev.location, 36));
      if (ev.calendar) subParts.push(ev.calendar);
      const subStr = subParts.join(' · ');

      if (isNow) {
        todaySvgParts.push(`
          <rect x="968" y="${rightY - 6}" width="884" height="${subStr ? 64 : 46}" rx="8" fill="${c.cardBg}" stroke="${c.ruleStrong}" stroke-width="1.5" />
        `);
      }

      todaySvgParts.push(`
        <g opacity="${rowOpacity}">
          <text x="984" y="${rightY + 24}" fill="${isNow ? c.ink : c.inkSoft}" font-family="JetBrains Mono" font-size="18">${esc(timeStr)}</text>
          <text x="1148" y="${rightY + 24}" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="23" font-weight="700">${esc(truncate(ev.title, 44))}</text>
          ${subStr ? `<text x="1148" y="${rightY + 48}" fill="${c.inkMuted}" font-family="Atkinson Hyperlegible" font-size="16">${esc(truncate(subStr, 62))}</text>` : ''}
        </g>
      `);
      rightY += subStr ? 74 : 56;
      if (i < shownToday.length - 1 && !isNow) {
        todaySvgParts.push(`<line x1="980" y1="${rightY - 12}" x2="1840" y2="${rightY - 12}" stroke="${c.rule}" stroke-width="1" />`);
      }
    }

    if (timedEvents.length > maxTodayRows) {
      const extra = timedEvents.length - maxTodayRows;
      todaySvgParts.push(`
        <text x="984" y="${rightY + 18}" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15">+ ${extra} flere aftaler i dag</text>
      `);
    }
  }

  // Tomorrow Preview (Bottom Right)
  const tomorrowEvents = briefing.tomorrow?.events || [];
  const tomorrowY = 804;
  const tomorrowParts = [];
  const shownTomorrow = tomorrowEvents.slice(0, 3);

  if (shownTomorrow.length === 0) {
    tomorrowParts.push(`
      <text x="980" y="${tomorrowY + 46}" fill="${c.inkMuted}" font-family="Atkinson Hyperlegible" font-size="20">Ingen aftaler i morgen.</text>
    `);
  } else {
    shownTomorrow.forEach((ev, idx) => {
      const y = tomorrowY + 42 + idx * 44;
      const tStr = ev.allDay ? 'Heldag' : formatTime(ev.start, tz);
      tomorrowParts.push(`
        <text x="980" y="${y}" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="17">${esc(tStr)}</text>
        <text x="1080" y="${y}" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="21" font-weight="700">${esc(truncate(ev.title, 48))}</text>
      `);
    });
  }

  // Footer
  const themeLabel = activeTheme === 'oled' ? 'OLED-sikker Blæk' : 'TRMNL Papir';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <pattern id="dotGrid" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="0.9" fill="${c.dotColor}" opacity="0.45" />
    </pattern>
  </defs>

  <!-- Canvas Background -->
  <rect width="1920" height="1080" fill="${c.bg}" />
  <rect width="1920" height="1080" fill="url(#dotGrid)" />

  <!-- Top Masthead -->
  <text x="80" y="90" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="16" letter-spacing="2.4">${esc(greetingText)}</text>
  ${briefing.demoMode ? `<rect x="380" y="70" width="142" height="26" rx="4" fill="${c.pillBg}" /><text x="451" y="88" fill="${c.pillInk}" font-family="JetBrains Mono" font-size="12" text-anchor="middle" letter-spacing="1.2">DEMO-TILSTAND</text>` : ''}
  <text x="80" y="156" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="56" font-weight="700">${esc(dateHeading)}</text>

  <!-- Weather Block -->
  ${renderWeatherIcon(w.icon, 1140, 80, 62, c.ink)}
  <text x="1218" y="122" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="40" font-weight="700">${esc(tempText)}</text>
  <text x="1306" y="120" fill="${c.inkSoft}" font-family="Atkinson Hyperlegible" font-size="24">${esc(condText)}</text>
  <text x="1218" y="152" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15">${esc(weatherMetaText)}</text>

  <!-- Clock Block -->
  <text x="1840" y="152" fill="${c.ink}" font-family="JetBrains Mono" font-size="76" text-anchor="end">${esc(clockText)}</text>

  <!-- Masthead Divider -->
  <line x1="80" y1="190" x2="1840" y2="190" stroke="${c.ruleStrong}" stroke-width="2" />

  <!-- Vertical Column Divider -->
  <line x1="940" y1="224" x2="940" y2="992" stroke="${c.rule}" stroke-width="1.5" />

  <!-- LEFT COLUMN: AI Daily Briefing -->
  <text x="80" y="250" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15" letter-spacing="2">${esc(summaryMeta)}</text>
  ${summaryLines
    .map(
      (line, idx) =>
        `<text x="80" y="${298 + idx * 40}" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="28">${esc(line)}</text>`,
    )
    .join('\n  ')}

  <!-- LEFT COLUMN: Up Next Spotlight Card -->
  <rect x="80" y="514" width="820" height="162" rx="12" fill="${c.cardBg}" stroke="${c.ruleStrong}" stroke-width="2" />
  <text x="110" y="552" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="14" letter-spacing="2">${esc(upNextKicker)}</text>
  <rect x="708" y="530" width="166" height="32" rx="6" fill="${c.accentBg}" />
  <text x="791" y="551" fill="${c.accentInk}" font-family="JetBrains Mono" font-size="14" text-anchor="middle">${esc(upNextCountdown)}</text>
  <text x="110" y="608" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="34" font-weight="700">${esc(upNextTitle)}</text>
  <text x="110" y="648" fill="${c.inkSoft}" font-family="Atkinson Hyperlegible" font-size="20">${esc(truncate(upNextMeta, 64))}</text>

  <!-- LEFT COLUMN: Day Rhythm (07 - 21) -->
  <text x="80" y="724" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="14" letter-spacing="2">DAGSRYTME · 07 – 21</text>
  <text x="900" y="724" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="14" text-anchor="end">${esc(rhythmStats)}</text>
  <rect x="${trackX}" y="${trackY}" width="${trackW}" height="${trackH}" rx="6" fill="${c.surface}" stroke="${c.rule}" stroke-width="1.5" />
  ${rhythmGridLines.join('\n  ')}
  ${rhythmBlocks.join('\n  ')}
  ${rhythmNowMarker}

  <!-- LEFT COLUMN: Optional Personal Note -->
  ${
    personalNote.length > 0
      ? `
  <rect x="80" y="844" width="820" height="126" rx="10" fill="${c.surface}" stroke="${c.rule}" stroke-width="1.5" />
  <text x="108" y="878" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="13" letter-spacing="2">HILSEN</text>
  ${personalNote
    .map(
      (line, idx) =>
        `<text x="108" y="${914 + idx * 32}" fill="${c.ink}" font-family="Atkinson Hyperlegible" font-size="22">${esc(line)}</text>`,
    )
    .join('\n  ')}`
      : ''
  }

  <!-- RIGHT COLUMN: Today's Schedule -->
  <text x="980" y="250" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15" letter-spacing="2">DAGENS PROGRAM</text>
  <text x="1840" y="250" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15" text-anchor="end">${esc(todayCountLabel)}</text>
  ${todaySvgParts.join('\n  ')}

  <!-- RIGHT COLUMN: Tomorrow Preview -->
  <line x1="980" y1="774" x2="1840" y2="774" stroke="${c.rule}" stroke-width="1.5" />
  <text x="980" y="804" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15" letter-spacing="2">I MORGEN</text>
  <text x="1840" y="804" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15" text-anchor="end">${esc(`${tomorrowEvents.length} ${tomorrowEvents.length === 1 ? 'aftale' : 'aftaler'}`)}</text>
  ${tomorrowParts.join('\n  ')}

  <!-- Footer Status Bar -->
  <line x1="80" y1="1012" x2="1840" y2="1012" stroke="${c.rule}" stroke-width="1.5" />
  <text x="80" y="1046" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15">Opdateret kl. ${esc(clockText)} · ${esc(briefing.location?.name || 'Aarhus, DK')} · Tema: ${esc(themeLabel)}</text>
  <text x="1840" y="1046" fill="${c.inkMuted}" font-family="JetBrains Mono" font-size="15" text-anchor="end">TERMINALLIKE · PROJECTIVY</text>
</svg>`;
}

/**
 * Renders the Terminallike briefing as a 1920x1080 PNG Buffer for Projectivy / Overflight.
 */
export function renderWallpaperPng(briefing, { themeMode = 'auto', width = 1920 } = {}) {
  const svg = buildWallpaperSvg(briefing, { themeMode });
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Atkinson Hyperlegible',
    },
  });
  return resvg.render().asPng();
}
