import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

/**
 * Loads key=value pairs from a local .env file into process.env without
 * overriding variables that are already defined in the environment.
 */
export function loadDotEnv(cwd = process.cwd()) {
  if (loaded) return;
  loaded = true;

  const envPath = path.join(cwd, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Parses ICS_URLS into normalized feed descriptors: { label, url }.
 * Supports comma or newline separated entries, optional "Label|URL" syntax,
 * and Apple iCloud webcal:// links.
 */
export function parseIcsFeeds(raw = '') {
  if (!raw || typeof raw !== 'string') return [];

  const entries = raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const feeds = [];
  entries.forEach((entry, index) => {
    let label = '';
    let url = entry;

    const pipeIndex = entry.indexOf('|');
    if (pipeIndex > 0) {
      const candidateLabel = entry.slice(0, pipeIndex).trim();
      const candidateUrl = entry.slice(pipeIndex + 1).trim();
      if (/^(https?|webcal):\/\//i.test(candidateUrl)) {
        label = candidateLabel;
        url = candidateUrl;
      }
    }

    if (/^webcal:\/\//i.test(url)) {
      url = 'https://' + url.slice('webcal://'.length);
    }

    if (!/^https?:\/\//i.test(url)) return;

    feeds.push({
      label: label || inferFeedLabel(url, index),
      url,
    });
  });

  return feeds;
}

function inferFeedLabel(url, index) {
  const lower = url.toLowerCase();
  if (lower.includes('icloud.com')) return 'iCloud';
  if (lower.includes('google.com')) return 'Google';
  if (lower.includes('outlook') || lower.includes('office365')) return 'Outlook';
  return `Calendar ${index + 1}`;
}

/**
 * Builds runtime configuration from process.env with safe defaults and
 * optional per-request query overrides from the TV settings drawer.
 */
export function getConfig(query = {}) {
  const env = process.env;

  const parseNumber = (val, fallback) => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const unitsRaw = (query.units || env.WEATHER_UNITS || 'fahrenheit').toLowerCase();
  const weatherUnits = unitsRaw === 'celsius' || unitsRaw === 'c' ? 'celsius' : 'fahrenheit';

  const timezone = isValidTimeZone(query.tz)
    ? query.tz
    : isValidTimeZone(env.TIMEZONE)
      ? env.TIMEZONE
      : 'America/Los_Angeles';

  const feeds = parseIcsFeeds(env.ICS_URLS || '');
  const forceDemo = query.demo === '1' || query.demo === 'true';

  return {
    port: parseNumber(env.PORT, 3000),
    personName: (query.name ?? env.PERSON_NAME ?? 'Maya').trim() || 'Maya',
    personalNote: (query.note !== undefined ? query.note : env.PERSONAL_NOTE ?? '').trim(),
    feeds,
    forceDemo,
    location: {
      name: (query.city || env.LOCATION_NAME || 'San Francisco, CA').trim(),
      lat: parseNumber(query.lat ?? env.LOCATION_LAT, 37.7749),
      lon: parseNumber(query.lon ?? env.LOCATION_LON, -122.4194),
    },
    timezone,
    weatherUnits,
    ai: {
      provider: (env.AI_PROVIDER || 'auto').toLowerCase(),
      model: (env.AI_MODEL || '').trim(),
      geminiKey: (env.GEMINI_API_KEY || '').trim(),
      openaiKey: (env.OPENAI_API_KEY || '').trim(),
      anthropicKey: (env.ANTHROPIC_API_KEY || '').trim(),
      cacheMinutes: Math.max(1, parseNumber(env.AI_CACHE_MINUTES, 45)),
    },
    cache: {
      icsMinutes: Math.max(1, parseNumber(env.ICS_CACHE_MINUTES, 5)),
      weatherMinutes: Math.max(1, parseNumber(env.WEATHER_CACHE_MINUTES, 15)),
    },
  };
}

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
