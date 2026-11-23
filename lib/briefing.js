import { getConfig } from './env.js';
import { fetchAllCalendarEvents, getZonedParts, zonedToUtc } from './ics.js';
import { buildDemoEvents } from './demo.js';
import { fetchWeather } from './weather.js';
import { generateDailySummary } from './ai.js';

const RHYTHM_START_MIN = 7 * 60; // 7:00 AM
const RHYTHM_END_MIN = 21 * 60; // 9:00 PM
const RHYTHM_SPAN_MIN = RHYTHM_END_MIN - RHYTHM_START_MIN; // 840 min

/**
 * Formats minute-of-day (e.g. 870 -> "2:30 PM").
 */
function formatMinutesOfDay(totalMin) {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = Math.round(totalMin % 60);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Computes the Day Rhythm bar (7 AM – 9 PM) segments, merged busy minutes,
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

  // Merge overlapping intervals to calculate accurate busy/free time & open windows
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

  // Find open windows inside 8 AM – 8 PM (or 7 AM – 9 PM)
  const openWindows = [];
  let cursor = RHYTHM_START_MIN;
  for (const [s, e] of merged) {
    if (s - cursor >= 45) {
      openWindows.push({
        startMin: cursor,
        endMin: s,
        minutes: Math.round(s - cursor),
        label: `${formatMinutesOfDay(cursor)} – ${formatMinutesOfDay(s)}`,
      });
    }
    cursor = Math.max(cursor, e);
  }
  if (RHYTHM_END_MIN - cursor >= 45) {
    openWindows.push({
      startMin: cursor,
      endMin: RHYTHM_END_MIN,
      minutes: Math.round(RHYTHM_END_MIN - cursor),
      label: `${formatMinutesOfDay(cursor)} – ${formatMinutesOfDay(RHYTHM_END_MIN)}`,
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
 * Builds the complete /api/briefing JSON payload.
 */
export async function buildBriefing({
  query = {},
  now = new Date(),
  weatherFetcher = fetchWeather,
  calendarFetcher = fetchAllCalendarEvents,
  summaryGenerator = generateDailySummary,
} = {}) {
  const config = getConfig(query);
  const tz = config.timezone;

  const todayParts = getZonedParts(now, tz);
  const todayStart = zonedToUtc(
    { year: todayParts.year, month: todayParts.month, day: todayParts.day, hour: 0, minute: 0, second: 0 },
    tz,
  );
  const tomorrowNoon = new Date(todayStart.getTime() + 36 * 60 * 60 * 1000);
  const tomorrowParts = getZonedParts(tomorrowNoon, tz);
  const tomorrowStart = zonedToUtc(
    {
      year: tomorrowParts.year,
      month: tomorrowParts.month,
      day: tomorrowParts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    tz,
  );
  const dayAfterNoon = new Date(tomorrowStart.getTime() + 36 * 60 * 60 * 1000);
  const dayAfterParts = getZonedParts(dayAfterNoon, tz);
  const tomorrowEnd = zonedToUtc(
    {
      year: dayAfterParts.year,
      month: dayAfterParts.month,
      day: dayAfterParts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    tz,
  );

  const isDemo = config.forceDemo || config.feeds.length === 0;
  let todayEvents = [];
  let tomorrowEvents = [];
  let warnings = [];

  if (isDemo) {
    const demo = buildDemoEvents(now, tz);
    todayEvents = demo.todayEvents;
    tomorrowEvents = demo.tomorrowEvents;
  } else {
    const calResult = await calendarFetcher(config.feeds, {
      rangeStart: todayStart,
      rangeEnd: tomorrowEnd,
      timeZone: tz,
      cacheMinutes: config.cache.icsMinutes,
    });
    warnings = calResult.warnings || [];

    const todayStartMs = todayStart.getTime();
    const tomorrowStartMs = tomorrowStart.getTime();
    const tomorrowEndMs = tomorrowEnd.getTime();

    for (const evt of calResult.events) {
      const s = new Date(evt.start).getTime();
      const e = new Date(evt.end).getTime();
      if (e > todayStartMs && s < tomorrowStartMs) {
        todayEvents.push(evt);
      }
      if (e > tomorrowStartMs && s < tomorrowEndMs) {
        tomorrowEvents.push(evt);
      }
    }
  }

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

  const summary = await summaryGenerator(
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
  );

  const greeting =
    todayParts.hour < 12
      ? 'Good morning'
      : todayParts.hour < 17
        ? 'Good afternoon'
        : 'Good evening';

  return {
    generatedAt: now.toISOString(),
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
      dateIso: todayStart.toISOString(),
      count: todayEvents.length,
      events: todayEvents,
    },
    tomorrow: {
      dateIso: tomorrowStart.toISOString(),
      count: tomorrowEvents.length,
      events: tomorrowEvents,
    },
    meta: {
      feedCount: config.feeds.length,
      warnings,
    },
  };
}
