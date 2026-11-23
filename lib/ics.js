import { isValidTimeZone } from './env.js';

/**
 * Common Windows / Exchange / Apple TZID aliases mapped to IANA identifiers.
 */
const WINDOWS_TZ_MAP = {
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pacific Daylight Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/New_York',
  'Atlantic Standard Time': 'America/Halifax',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Etc/UTC',
  'UTC': 'Etc/UTC',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'India Standard Time': 'Asia/Kolkata',
};

const DAY_TO_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const feedCache = new Map();

export function clearIcsCache() {
  feedCache.clear();
}

/**
 * Resolves an ICS TZID string (including quoted or Windows names) to a valid IANA zone.
 */
export function resolveTimeZone(tzid, fallbackTz = 'UTC') {
  if (!tzid) return fallbackTz;
  const cleaned = String(tzid).replace(/^["']|["']$/g, '').trim();
  if (isValidTimeZone(cleaned)) return cleaned;
  if (WINDOWS_TZ_MAP[cleaned] && isValidTimeZone(WINDOWS_TZ_MAP[cleaned])) {
    return WINDOWS_TZ_MAP[cleaned];
  }
  // Handle /mozilla.org/... or /freeassociation.sourceforge.net/America/New_York
  const slashParts = cleaned.split('/');
  if (slashParts.length >= 2) {
    const tailTwo = slashParts.slice(-2).join('/');
    if (isValidTimeZone(tailTwo)) return tailTwo;
    const tailThree = slashParts.slice(-3).join('/');
    if (isValidTimeZone(tailThree)) return tailThree;
  }
  return fallbackTz;
}

/**
 * Returns local calendar parts { year, month, day, hour, minute, second, weekday }
 * for a given Date in an IANA time zone.
 */
export function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const map = {};
  for (const part of formatter.formatToParts(date)) {
    map[part.type] = part.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

/**
 * Converts wall-clock date/time components in a target IANA timeZone to a UTC Date.
 * Uses iterative offset refinement so DST boundaries resolve accurately.
 */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const targetUtcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcMs = targetUtcGuess;

  for (let i = 0; i < 3; i++) {
    const zoned = getZonedParts(new Date(utcMs), timeZone);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const diff = targetUtcGuess - zonedAsUtc;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
}

/**
 * Formats a YYYY-MM-DD key from parts.
 */
export function toDateKey(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Unfolds RFC 5545 folded lines (CRLF/LF followed by a single space or tab).
 */
export function unfoldIcsLines(rawText) {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  const lines = [];

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Unescapes RFC 5545 TEXT values.
 */
export function unescapeIcsText(value = '') {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Parses a single content line into { name, params, value }.
 */
export function parseContentLine(line) {
  let inQuotes = false;
  let colonIdx = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx === -1) return null;

  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);

  // Split left by ';' outside quotes
  const segments = [];
  let current = '';
  inQuotes = false;
  for (let i = 0; i < left.length; i++) {
    const ch = left[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ';' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);

  const name = segments[0].toUpperCase();
  const params = {};
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const eq = seg.indexOf('=');
    if (eq > 0) {
      const pKey = seg.slice(0, eq).toUpperCase();
      const pVal = seg.slice(eq + 1).replace(/^"|"$/g, '');
      params[pKey] = pVal;
    }
  }
  return { name, params, value };
}

/**
 * Parses an ICS DATE or DATE-TIME value into a rich object:
 * { date: Date, allDay: boolean, parts, timeZone, isUtc }
 */
export function parseIcsDateValue(value, params = {}, defaultTz = 'UTC') {
  const trimmed = String(value || '').trim();
  const isDateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(trimmed);

  if (isDateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
    if (!m) return null;
    const parts = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: 0,
      minute: 0,
      second: 0,
    };
    return {
      date: zonedToUtc(parts, defaultTz),
      allDay: true,
      parts,
      timeZone: defaultTz,
      isUtc: false,
    };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(trimmed);
  if (!m) return null;

  const parts = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6]),
  };
  const isUtc = Boolean(m[7]);
  const timeZone = isUtc ? 'UTC' : resolveTimeZone(params.TZID, defaultTz);
  const date = isUtc
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
    : zonedToUtc(parts, timeZone);

  return { date, allDay: false, parts, timeZone, isUtc };
}

/**
 * Parses an ISO 8601 / RFC 5545 DURATION (e.g. PT1H30M, P1D) into milliseconds.
 */
export function parseDurationMs(raw) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
    String(raw || '').trim(),
  );
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const weeks = Number(m[2] || 0);
  const days = Number(m[3] || 0);
  const hours = Number(m[4] || 0);
  const minutes = Number(m[5] || 0);
  const seconds = Number(m[6] || 0);
  return sign * ((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

/**
 * Parses an RRULE string into structured parts.
 */
export function parseRRule(rruleStr, defaultTz = 'UTC') {
  const rule = {
    freq: null,
    interval: 1,
    count: null,
    until: null,
    byDay: null,
    byMonthDay: null,
    byMonth: null,
    wkst: 1, // MO
  };

  for (const token of String(rruleStr || '').split(';')) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq).toUpperCase().trim();
    const val = token.slice(eq + 1).trim();

    switch (key) {
      case 'FREQ':
        rule.freq = val.toUpperCase();
        break;
      case 'INTERVAL':
        rule.interval = Math.max(1, Number(val) || 1);
        break;
      case 'COUNT':
        rule.count = Math.max(1, Number(val) || 0) || null;
        break;
      case 'UNTIL': {
        const parsed = parseIcsDateValue(val, {}, defaultTz);
        if (parsed) {
          // If UNTIL is a DATE-only value, include the entire end day
          rule.until = parsed.allDay
            ? new Date(parsed.date.getTime() + 24 * 60 * 60 * 1000 - 1)
            : parsed.date;
        }
        break;
      }
      case 'BYDAY':
        rule.byDay = val
          .split(',')
          .map((item) => {
            const match = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(item.trim());
            if (!match) return null;
            return {
              ord: match[1] ? Number(match[1]) : null,
              day: DAY_TO_INDEX[match[2].toUpperCase()],
            };
          })
          .filter(Boolean);
        break;
      case 'BYMONTHDAY':
        rule.byMonthDay = val
          .split(',')
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n !== 0);
        break;
      case 'BYMONTH':
        rule.byMonth = val
          .split(',')
          .map((n) => Number(n))
          .filter((n) => n >= 1 && n <= 12);
        break;
      case 'WKST':
        if (DAY_TO_INDEX[val.toUpperCase()] !== undefined) {
          rule.wkst = DAY_TO_INDEX[val.toUpperCase()];
        }
        break;
    }
  }
  return rule;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDaysWall({ year, month, day, hour, minute, second }, deltaDays) {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour,
    minute,
    second,
  };
}

function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Expands a recurring VEVENT's start timestamps within [rangeStart, rangeEnd].
 * Preserves local wall-clock time across DST changes using the event's TZID.
 */
function expandRRuleOccurrences(rawEvent, rangeStart, rangeEnd) {
  const rule = parseRRule(rawEvent.rrule, rawEvent.start.timeZone);
  if (!rule.freq) return [rawEvent.start.date];

  const startParts = rawEvent.start.parts;
  const tz = rawEvent.start.timeZone;
  const isUtc = rawEvent.start.isUtc;
  const durationMs = Math.max(0, rawEvent.durationMs);

  const toDate = (parts) =>
    isUtc
      ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
      : zonedToUtc(parts, tz);

  const hardStop = rule.until && rule.until < rangeEnd ? rule.until : rangeEnd;
  const results = [];
  let emittedCount = 0;
  const MAX_ITERATIONS = 5000;

  const tryEmit = (parts) => {
    const dt = toDate(parts);
    if (dt < rawEvent.start.date) return 'before';
    if (rule.until && dt > rule.until) return 'stop';
    if (dt > hardStop) return 'stop';

    emittedCount += 1;
    if (rule.count && emittedCount > rule.count) return 'stop';

    const endDt = new Date(dt.getTime() + durationMs);
    if (endDt > rangeStart && dt < rangeEnd) {
      results.push(dt);
    }
    if (rule.count && emittedCount >= rule.count) return 'stop';
    return 'ok';
  };

  if (rule.freq === 'DAILY') {
    let cursor = { ...startParts };
    // Fast-forward when no COUNT is set and start is far before rangeStart
    if (!rule.count) {
      const approxDays = Math.floor(
        (rangeStart.getTime() - durationMs - rawEvent.start.date.getTime()) / (86400000 * rule.interval),
      );
      if (approxDays > 2) {
        cursor = addDaysWall(startParts, (approxDays - 2) * rule.interval);
      }
    }
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const wd = weekdayOf(cursor.year, cursor.month, cursor.day);
      const dayAllowed = !rule.byDay || rule.byDay.some((b) => b.day === wd);
      const monthAllowed = !rule.byMonth || rule.byMonth.includes(cursor.month);
      if (dayAllowed && monthAllowed) {
        if (tryEmit(cursor) === 'stop') break;
      }
      cursor = addDaysWall(cursor, rule.interval);
      if (toDate(cursor) > hardStop) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const startWd = weekdayOf(startParts.year, startParts.month, startParts.day);
    const targetDays = (
      rule.byDay && rule.byDay.length > 0 ? rule.byDay.map((b) => b.day) : [startWd]
    ).sort((a, b) => ((a - rule.wkst + 7) % 7) - ((b - rule.wkst + 7) % 7));

    // Align to start of the week containing startParts (according to WKST)
    const offsetToWeekStart = (startWd - rule.wkst + 7) % 7;
    let weekStart = addDaysWall(startParts, -offsetToWeekStart);

    if (!rule.count) {
      const approxWeeks = Math.floor(
        (rangeStart.getTime() - durationMs - rawEvent.start.date.getTime()) /
          (7 * 86400000 * rule.interval),
      );
      if (approxWeeks > 2) {
        weekStart = addDaysWall(weekStart, (approxWeeks - 2) * 7 * rule.interval);
      }
    }

    let stopped = false;
    for (let w = 0; w < MAX_ITERATIONS && !stopped; w++) {
      for (const dayIdx of targetDays) {
        const delta = (dayIdx - rule.wkst + 7) % 7;
        const candidate = addDaysWall(weekStart, delta);
        if (rule.byMonth && !rule.byMonth.includes(candidate.month)) continue;
        if (tryEmit(candidate) === 'stop') {
          stopped = true;
          break;
        }
      }
      weekStart = addDaysWall(weekStart, 7 * rule.interval);
      if (toDate(weekStart) > hardStop) break;
    }
  } else if (rule.freq === 'MONTHLY') {
    let year = startParts.year;
    let month = startParts.month;

    if (!rule.count) {
      const startTotalMonths = year * 12 + (month - 1);
      const rangeParts = getZonedParts(rangeStart, tz);
      const rangeTotalMonths = rangeParts.year * 12 + (rangeParts.month - 1);
      const diffSteps = Math.floor((rangeTotalMonths - startTotalMonths) / rule.interval);
      if (diffSteps > 2) {
        const jumped = startTotalMonths + (diffSteps - 2) * rule.interval;
        year = Math.floor(jumped / 12);
        month = (jumped % 12) + 1;
      }
    }

    let stopped = false;
    for (let m = 0; m < MAX_ITERATIONS && !stopped; m++) {
      if (!rule.byMonth || rule.byMonth.includes(month)) {
        const dim = daysInMonth(year, month);
        const daysSet = new Set();

        if (rule.byDay && rule.byDay.length > 0) {
          for (const spec of rule.byDay) {
            const matching = [];
            for (let d = 1; d <= dim; d++) {
              if (weekdayOf(year, month, d) === spec.day) matching.push(d);
            }
            if (spec.ord === null) {
              matching.forEach((d) => daysSet.add(d));
            } else if (spec.ord > 0 && matching[spec.ord - 1]) {
              daysSet.add(matching[spec.ord - 1]);
            } else if (spec.ord < 0 && matching[matching.length + spec.ord]) {
              daysSet.add(matching[matching.length + spec.ord]);
            }
          }
        } else {
          const monthDays = rule.byMonthDay && rule.byMonthDay.length > 0
            ? rule.byMonthDay
            : [startParts.day];
          for (const md of monthDays) {
            const resolved = md > 0 ? md : dim + md + 1;
            if (resolved >= 1 && resolved <= dim) daysSet.add(resolved);
          }
        }

        const sortedDays = [...daysSet].sort((a, b) => a - b);
        for (const day of sortedDays) {
          const candidate = { ...startParts, year, month, day };
          if (tryEmit(candidate) === 'stop') {
            stopped = true;
            break;
          }
        }
      }

      const nextTotal = year * 12 + (month - 1) + rule.interval;
      year = Math.floor(nextTotal / 12);
      month = (nextTotal % 12) + 1;
      if (toDate({ ...startParts, year, month, day: 1 }) > hardStop) break;
    }
  } else if (rule.freq === 'YEARLY') {
    let year = startParts.year;
    if (!rule.count) {
      const rangeParts = getZonedParts(rangeStart, tz);
      const diffSteps = Math.floor((rangeParts.year - year) / rule.interval);
      if (diffSteps > 1) {
        year += (diffSteps - 1) * rule.interval;
      }
    }

    let stopped = false;
    for (let y = 0; y < MAX_ITERATIONS && !stopped; y++) {
      const months = rule.byMonth && rule.byMonth.length > 0 ? rule.byMonth : [startParts.month];
      for (const month of months) {
        const dim = daysInMonth(year, month);
        const daysSet = new Set();

        if (rule.byDay && rule.byDay.length > 0) {
          for (const spec of rule.byDay) {
            const matching = [];
            for (let d = 1; d <= dim; d++) {
              if (weekdayOf(year, month, d) === spec.day) matching.push(d);
            }
            if (spec.ord === null) matching.forEach((d) => daysSet.add(d));
            else if (spec.ord > 0 && matching[spec.ord - 1]) daysSet.add(matching[spec.ord - 1]);
            else if (spec.ord < 0 && matching[matching.length + spec.ord]) {
              daysSet.add(matching[matching.length + spec.ord]);
            }
          }
        } else {
          const monthDays = rule.byMonthDay && rule.byMonthDay.length > 0
            ? rule.byMonthDay
            : [startParts.day];
          for (const md of monthDays) {
            const resolved = md > 0 ? md : dim + md + 1;
            if (resolved >= 1 && resolved <= dim) daysSet.add(resolved);
          }
        }

        for (const day of [...daysSet].sort((a, b) => a - b)) {
          if (tryEmit({ ...startParts, year, month, day }) === 'stop') {
            stopped = true;
            break;
          }
        }
        if (stopped) break;
      }

      year += rule.interval;
      if (toDate({ ...startParts, year, month: 1, day: 1 }) > hardStop) break;
    }
  } else {
    return [rawEvent.start.date];
  }

  return results;
}

/**
 * Parses raw .ics text into normalized event instances overlapping [rangeStart, rangeEnd].
 */
export function parseIcs(icsText, { rangeStart, rangeEnd, timeZone = 'UTC', calendarName = '' }) {
  const lines = unfoldIcsLines(icsText);
  let detectedCalName = calendarName;

  const rawEvents = [];
  let current = null;
  let inAlarm = false;

  for (const line of lines) {
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') {
      current = {
        uid: '',
        summary: '',
        description: '',
        location: '',
        status: '',
        start: null,
        end: null,
        durationMs: null,
        rrule: null,
        exdates: [],
        recurrenceId: null,
      };
      inAlarm = false;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.start) {
        rawEvents.push(current);
      }
      current = null;
      inAlarm = false;
      continue;
    }
    if (line === 'BEGIN:VALARM') {
      inAlarm = true;
      continue;
    }
    if (line === 'END:VALARM') {
      inAlarm = false;
      continue;
    }

    const parsed = parseContentLine(line);
    if (!parsed) continue;

    if (!current) {
      if (parsed.name === 'X-WR-CALNAME' && !detectedCalName) {
        detectedCalName = unescapeIcsText(parsed.value);
      }
      continue;
    }

    if (inAlarm) continue;

    switch (parsed.name) {
      case 'UID':
        current.uid = parsed.value.trim();
        break;
      case 'SUMMARY':
        current.summary = unescapeIcsText(parsed.value);
        break;
      case 'DESCRIPTION':
        current.description = unescapeIcsText(parsed.value);
        break;
      case 'LOCATION':
        current.location = unescapeIcsText(parsed.value);
        break;
      case 'STATUS':
        current.status = parsed.value.trim().toUpperCase();
        break;
      case 'DTSTART':
        current.start = parseIcsDateValue(parsed.value, parsed.params, timeZone);
        break;
      case 'DTEND':
        current.end = parseIcsDateValue(parsed.value, parsed.params, timeZone);
        break;
      case 'DURATION':
        current.durationMs = parseDurationMs(parsed.value);
        break;
      case 'RRULE':
        current.rrule = parsed.value.trim();
        break;
      case 'EXDATE':
        for (const item of parsed.value.split(',')) {
          const ex = parseIcsDateValue(item, parsed.params, timeZone);
          if (ex) current.exdates.push(ex);
        }
        break;
      case 'RECURRENCE-ID':
        current.recurrenceId = parseIcsDateValue(parsed.value, parsed.params, timeZone);
        break;
    }
  }

  // Group RECURRENCE-ID overrides by UID so master series skip overridden slots
  const overridesByUid = new Map();
  for (const ev of rawEvents) {
    if (ev.recurrenceId && ev.uid) {
      if (!overridesByUid.has(ev.uid)) overridesByUid.set(ev.uid, []);
      overridesByUid.get(ev.uid).push(ev);
    }
  }

  const instances = [];

  for (const ev of rawEvents) {
    if (ev.status === 'CANCELLED') continue;

    // Determine event duration
    let durationMs = ev.durationMs;
    if (durationMs === null || durationMs === undefined) {
      if (ev.end) {
        durationMs = Math.max(0, ev.end.date.getTime() - ev.start.date.getTime());
      } else {
        durationMs = ev.start.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
      }
    }
    if (ev.start.allDay && durationMs < 24 * 60 * 60 * 1000) {
      durationMs = 24 * 60 * 60 * 1000;
    }
    ev.durationMs = durationMs;

    if (ev.rrule && !ev.recurrenceId) {
      const exTimestamps = new Set(ev.exdates.map((ex) => ex.date.getTime()));
      const exDateKeys = new Set(
        ev.exdates
          .filter((ex) => ex.allDay)
          .map((ex) => toDateKey(ex.parts.year, ex.parts.month, ex.parts.day)),
      );

      const overrideList = overridesByUid.get(ev.uid) || [];
      const overrideTimestamps = new Set(overrideList.map((o) => o.recurrenceId.date.getTime()));
      const overrideDateKeys = new Set(
        overrideList
          .filter((o) => o.recurrenceId.allDay)
          .map((o) =>
            toDateKey(
              o.recurrenceId.parts.year,
              o.recurrenceId.parts.month,
              o.recurrenceId.parts.day,
            ),
          ),
      );

      const occStarts = expandRRuleOccurrences(ev, rangeStart, rangeEnd);
      for (const occStart of occStarts) {
        const ts = occStart.getTime();
        const zoned = getZonedParts(occStart, ev.start.timeZone);
        const dateKey = toDateKey(zoned.year, zoned.month, zoned.day);

        if (exTimestamps.has(ts) || (ev.start.allDay && exDateKeys.has(dateKey))) continue;
        if (overrideTimestamps.has(ts) || (ev.start.allDay && overrideDateKeys.has(dateKey))) {
          continue;
        }

        const occEnd = new Date(ts + durationMs);
        instances.push(formatEventInstance(ev, occStart, occEnd, detectedCalName));
      }
    } else {
      const start = ev.start.date;
      const end = new Date(start.getTime() + durationMs);
      if (end > rangeStart && start < rangeEnd) {
        instances.push(formatEventInstance(ev, start, end, detectedCalName));
      }
    }
  }

  return instances;
}

function formatEventInstance(raw, startDate, endDate, calendarName) {
  return {
    id: `${raw.uid || 'evt'}_${startDate.toISOString()}`,
    uid: raw.uid || '',
    title: raw.summary || 'Untitled Event',
    description: raw.description || '',
    location: raw.location || '',
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    allDay: Boolean(raw.start.allDay),
    calendar: calendarName || 'Calendar',
  };
}

/**
 * Fetches and merges multiple .ics feeds in parallel with TTL caching.
 */
export async function fetchAllCalendarEvents(feeds, { rangeStart, rangeEnd, timeZone, cacheMinutes = 5 }) {
  const ttlMs = cacheMinutes * 60 * 1000;
  const now = Date.now();
  const warnings = [];

  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        let icsText;
        const cached = feedCache.get(feed.url);
        if (cached && now - cached.fetchedAt < ttlMs) {
          icsText = cached.text;
        } else {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          try {
            const response = await fetch(feed.url, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Terminallike-TV/1.0 (iCalendar Sync)',
                Accept: 'text/calendar, text/plain, */*',
              },
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            icsText = await response.text();
            feedCache.set(feed.url, { text: icsText, fetchedAt: now });
          } finally {
            clearTimeout(timer);
          }
        }

        return parseIcs(icsText, {
          rangeStart,
          rangeEnd,
          timeZone,
          calendarName: feed.label,
        });
      } catch (err) {
        warnings.push(`${feed.label}: ${err.message || 'fetch failed'}`);
        return [];
      }
    }),
  );

  // Merge and deduplicate identical events across shared feeds
  const deduped = new Map();
  for (const list of results) {
    for (const evt of list) {
      const key = evt.uid
        ? `${evt.uid}|${evt.start}`
        : `${evt.title}|${evt.start}|${evt.end}`;
      if (!deduped.has(key)) {
        deduped.set(key, evt);
      }
    }
  }

  const events = [...deduped.values()].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  return { events, warnings };
}
