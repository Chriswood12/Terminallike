import { getConfig } from './env.js';
import { fetchAllCalendarEvents, getZonedParts, zonedToUtc } from './ics.js';
import { buildDemoEvents } from './demo.js';
import { fetchWeather } from './weather.js';
import { generateDailySummary, generateWeeklySummary } from './ai.js';

const RHYTHM_START_MIN = 7 * 60; // 07:00
const RHYTHM_END_MIN = 21 * 60; // 21:00
const RHYTHM_SPAN_MIN = RHYTHM_END_MIN - RHYTHM_START_MIN; // 840 min

function formatMinutesOfDay(totalMin) {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = Math.round(totalMin % 60);
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isStudyCalendar(calendarName = '') {
  const lower = String(calendarName).toLowerCase();
  return (
    lower.includes('studie') ||
    lower.includes('via') ||
    lower.includes('itslearning') ||
    lower.includes('skole') ||
    lower.includes('undervisning') ||
    lower.includes('uni')
  );
}

/**
 * Computes the Day Rhythm bar (07:00 – 21:00) segments, merged busy minutes,
 * and longest open stretch.
 */
export function computeDayRhythm(todayEvents, now, timeZone, dayStartUtc) {
  const dayStartMs = dayStartUtc.getTime();
  const toMinOfDay = (iso) => (new Date(iso).getTime() - dayStartMs) / 60000;

  const timed = todayEvents.filter((e) => !e.allDay);
  const rawIntervals = [];
  const blocks = [];

  for (const evt of timed) {
    const s = Math.max(RHYTHM_START_MIN, Math.min(RHYTHM_END_MIN, toMinOfDay(evt.start)));
    const e = Math.max(RHYTHM_START_MIN, Math.min(RHYTHM_END_MIN, toMinOfDay(evt.end)));
    if (e <= s) continue;

    rawIntervals.push([s, e]);
    blocks.push({
      id: evt.id,
      title: evt.title,
      calendar: evt.calendar,
      startMin: s,
      endMin: e,
      startPct: Number((((s - RHYTHM_START_MIN) / RHYTHM_SPAN_MIN) * 100).toFixed(2)),
      widthPct: Number((((e - s) / RHYTHM_SPAN_MIN) * 100).toFixed(2)),
    });
  }

  rawIntervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of rawIntervals) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  const busyMinutes = Math.round(merged.reduce((acc, [s, e]) => acc + (e - s), 0));
  const freeMinutes = Math.max(0, RHYTHM_SPAN_MIN - busyMinutes);

  const openWindows = [];
  let cursor = RHYTHM_START_MIN;
  for (const [s, e] of merged) {
    if (s - cursor >= 45) {
      openWindows.push({
        startMin: cursor,
        endMin: s,
        minutes: Math.round(s - cursor),
        label: `${formatMinutesOfDay(cursor)}–${formatMinutesOfDay(s)}`,
      });
    }
    cursor = Math.max(cursor, e);
  }
  if (RHYTHM_END_MIN - cursor >= 45) {
    openWindows.push({
      startMin: cursor,
      endMin: RHYTHM_END_MIN,
      minutes: Math.round(RHYTHM_END_MIN - cursor),
      label: `${formatMinutesOfDay(cursor)}–${formatMinutesOfDay(RHYTHM_END_MIN)}`,
    });
  }

  const longestOpenWindow =
    openWindows.length > 0
      ? [...openWindows].sort((a, b) => b.minutes - a.minutes)[0]
      : null;

  const nowMin = (now.getTime() - dayStartMs) / 60000;
  const nowPct =
    nowMin >= RHYTHM_START_MIN && nowMin <= RHYTHM_END_MIN
      ? Number((((nowMin - RHYTHM_START_MIN) / RHYTHM_SPAN_MIN) * 100).toFixed(2))
      : null;

  return {
    startHour: 7,
    endHour: 21,
    nowPct,
    busyMinutes,
    freeMinutes,
    blocks,
    longestOpenWindow,
  };
}

/**
 * Selects the "Up Next" spotlight event (currently active, next today, or first tomorrow).
 */
export function selectUpNext(todayEvents, tomorrowEvents, now) {
  const nowMs = now.getTime();
  const timedToday = todayEvents.filter((e) => !e.allDay);

  const active = timedToday.find(
    (e) => new Date(e.start).getTime() <= nowMs && new Date(e.end).getTime() > nowMs,
  );
  if (active) {
    const minutesRemaining = Math.max(1, Math.round((new Date(active.end).getTime() - nowMs) / 60000));
    return {
      status: 'now',
      minutesRemaining,
      minutesUntil: 0,
      event: active,
    };
  }

  const nextToday = timedToday.find((e) => new Date(e.start).getTime() > nowMs);
  if (nextToday) {
    const minutesUntil = Math.max(1, Math.round((new Date(nextToday.start).getTime() - nowMs) / 60000));
    return {
      status: 'upcoming',
      minutesUntil,
      minutesRemaining: 0,
      event: nextToday,
    };
  }

  const firstTomorrow =
    tomorrowEvents.find((e) => !e.allDay) || tomorrowEvents[0] || null;
  if (firstTomorrow) {
    return {
      status: 'tomorrow',
      minutesUntil: Math.max(1, Math.round((new Date(firstTomorrow.start).getTime() - nowMs) / 60000)),
      minutesRemaining: 0,
      event: firstTomorrow,
    };
  }

  return null;
}

/**
 * Builds the 7-day weekly overview starting from today.
 */
export function buildWeekOverview(allEvents, dayWindows, timeZone) {
  let totalEvents = 0;
  let studieEvents = 0;
  let privatEvents = 0;

  const days = dayWindows.map((win, index) => {
    const startMs = win.start.getTime();
    const endMs = win.end.getTime();

    const dayEvents = allEvents
      .filter((evt) => {
        const s = new Date(evt.start).getTime();
        const e = new Date(evt.end).getTime();
        return e > startMs && s < endMs;
      })
      .map((evt) => ({
        ...evt,
        category: isStudyCalendar(evt.calendar) ? 'studie' : 'privat',
      }));

    const studieCount = dayEvents.filter((e) => e.category === 'studie').length;
    const privatCount = dayEvents.length - studieCount;

    totalEvents += dayEvents.length;
    studieEvents += studieCount;
    privatEvents += privatCount;

    const weekdayShort = new Intl.DateTimeFormat('da-DK', {
      timeZone,
      weekday: 'short',
    })
      .format(win.noon)
      .replace('.', '')
      .toUpperCase();

    const weekdayLong = new Intl.DateTimeFormat('da-DK', {
      timeZone,
      weekday: 'long',
    }).format(win.noon);

    const dateShort = new Intl.DateTimeFormat('da-DK', {
      timeZone,
      day: 'numeric',
      month: 'short',
    }).format(win.noon);

    return {
      index,
      isToday: index === 0,
      isTomorrow: index === 1,
      dateIso: win.start.toISOString(),
      weekdayShort,
      weekdayLong: weekdayLong.charAt(0).toUpperCase() + weekdayLong.slice(1),
      dateShort,
      count: dayEvents.length,
      studieCount,
      privatCount,
      events: dayEvents,
    };
  });

  const busiestDay =
    [...days].sort((a, b) => b.count - a.count)[0] || null;

  return {
    days,
    totals: {
      totalEvents,
      studieEvents,
      privatEvents,
      busiestDay: busiestDay && busiestDay.count > 0 ? busiestDay.weekdayLong : null,
    },
  };
}

/**
 * Builds the complete /api/briefing JSON payload (today, tomorrow, and 7-day week overview).
 */
export async function buildBriefing({
  query = {},
  now = new Date(),
  weatherFetcher = fetchWeather,
  calendarFetcher = fetchAllCalendarEvents,
  summaryGenerator = generateDailySummary,
  weeklySummaryGenerator = generateWeeklySummary,
} = {}) {
  const config = getConfig(query);
  const tz = config.timezone;

  const todayParts = getZonedParts(now, tz);
  const todayStart = zonedToUtc(
    { year: todayParts.year, month: todayParts.month, day: todayParts.day, hour: 0, minute: 0, second: 0 },
    tz,
  );
  const todayNoon = zonedToUtc(
    { year: todayParts.year, month: todayParts.month, day: todayParts.day, hour: 12, minute: 0, second: 0 },
    tz,
  );

  // Build 7 consecutive local day windows (handles DST transitions safely via noon anchor)
  const dayWindows = [];
  for (let i = 0; i < 7; i++) {
    const noon = new Date(todayNoon.getTime() + i * 24 * 60 * 60 * 1000);
    const p = getZonedParts(noon, tz);
    const start = zonedToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0 }, tz);

    const nextNoon = new Date(todayNoon.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const np = getZonedParts(nextNoon, tz);
    const end = zonedToUtc({ year: np.year, month: np.month, day: np.day, hour: 0, minute: 0, second: 0 }, tz);

    dayWindows.push({ start, end, noon });
  }

  const weekEnd = dayWindows[6].end;
  const isDemo = config.forceDemo || config.feeds.length === 0;
  let allEvents = [];
  let warnings = [];

  if (isDemo) {
    const demo = buildDemoEvents(now, tz);
    allEvents = demo.allEvents;
  } else {
    const calResult = await calendarFetcher(config.feeds, {
      rangeStart: todayStart,
      rangeEnd: weekEnd,
      timeZone: tz,
      cacheMinutes: config.cache.icsMinutes,
    });
    warnings = calResult.warnings || [];
    allEvents = calResult.events;
  }

  const week = buildWeekOverview(allEvents, dayWindows, tz);
  const todayEvents = week.days[0]?.events || [];
  const tomorrowEvents = week.days[1]?.events || [];

  const dayRhythm = computeDayRhythm(todayEvents, now, tz, todayStart);
  const upNext = selectUpNext(todayEvents, tomorrowEvents, now);

  const weather = await weatherFetcher({
    lat: config.location.lat,
    lon: config.location.lon,
    locationName: config.location.name,
    units: config.weatherUnits,
    timeZone: tz,
    cacheMinutes: config.cache.weatherMinutes,
  });

  const [summary, weekSummary] = await Promise.all([
    summaryGenerator(
      {
        personName: config.personName,
        now,
        timeZone: tz,
        todayEvents,
        tomorrowEvents,
        weather,
        dayRhythm,
      },
      config.ai,
    ),
    weeklySummaryGenerator(
      {
        personName: config.personName,
        now,
        timeZone: tz,
        week,
      },
      config.ai,
    ),
  ]);

  week.summary = weekSummary;

  const greeting =
    todayParts.hour < 10
      ? 'Godmorgen'
      : todayParts.hour < 12
        ? 'God formiddag'
        : todayParts.hour < 18
          ? 'God eftermiddag'
          : 'Godaften';

  return {
    generatedAt: now.toISOString(),
    locale: 'da-DK',
    demoMode: isDemo,
    personName: config.personName,
    greeting: `${greeting}, ${config.personName}`,
    personalNote: config.personalNote,
    timezone: tz,
    location: config.location,
    weather,
    summary,
    upNext,
    dayRhythm,
    today: {
      dateIso: dayWindows[0].start.toISOString(),
      count: todayEvents.length,
      events: todayEvents,
    },
    tomorrow: {
      dateIso: dayWindows[1].start.toISOString(),
      count: tomorrowEvents.length,
      events: tomorrowEvents,
    },
    week,
    meta: {
      feedCount: config.feeds.length,
      warnings,
    },
  };
}
