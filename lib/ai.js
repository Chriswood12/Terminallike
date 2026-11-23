import crypto from 'node:crypto';
import { getZonedParts } from './ics.js';

const summaryCache = new Map();

export function clearAiCache() {
  summaryCache.clear();
}

const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

/**
 * Resolves which AI provider & credentials should be used.
 */
export function resolveAiProvider(aiConfig = {}) {
  const requested = (aiConfig.provider || 'auto').toLowerCase();
  if (requested === 'none' || requested === 'off' || requested === 'local') {
    return { provider: 'local', apiKey: '', model: 'local' };
  }

  const candidates = {
    gemini: aiConfig.geminiKey || '',
    openai: aiConfig.openaiKey || '',
    anthropic: aiConfig.anthropicKey || '',
  };

  if (requested !== 'auto') {
    const key = candidates[requested];
    if (key) {
      return {
        provider: requested,
        apiKey: key,
        model: aiConfig.model || DEFAULT_MODELS[requested],
      };
    }
    return { provider: 'local', apiKey: '', model: 'local' };
  }

  for (const name of ['gemini', 'openai', 'anthropic']) {
    if (candidates[name]) {
      return {
        provider: name,
        apiKey: candidates[name],
        model: aiConfig.model || DEFAULT_MODELS[name],
      };
    }
  }

  return { provider: 'local', apiKey: '', model: 'local' };
}

function formatTimeShort(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Builds a concise prompt for Gemini, OpenAI, or Anthropic.
 */
export function buildSummaryPrompt({ personName, now, timeZone, todayEvents, tomorrowEvents, weather, dayRhythm }) {
  const zoned = getZonedParts(now, timeZone);
  const period =
    zoned.hour < 12 ? 'morning' : zoned.hour < 17 ? 'afternoon' : 'evening';

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const timeLabel = formatTimeShort(now.toISOString(), timeZone);

  const formatList = (list) =>
    list.length === 0
      ? 'No events scheduled.'
      : list
          .map((e) => {
            const when = e.allDay
              ? 'All day'
              : `${formatTimeShort(e.start, timeZone)}–${formatTimeShort(e.end, timeZone)}`;
            const loc = e.location ? ` @ ${e.location}` : '';
            return `- ${when}: ${e.title}${loc} (${e.calendar})`;
          })
          .join('\n');

  const weatherLine = weather?.available
    ? `${weather.temperature}${weather.unitSymbol} (${weather.condition}), high ${weather.high}${weather.unitSymbol}, low ${weather.low}${weather.unitSymbol}${
        weather.precipChance >= 30 ? `, ${weather.precipChance}% chance of rain` : ''
      }.`
    : 'Weather unavailable.';

  const openNote =
    dayRhythm?.longestOpenWindow
      ? `Longest open stretch between 7 AM and 9 PM: ${dayRhythm.longestOpenWindow.label}.`
      : '';

  return [
    `You are writing a calm, warm, editorial daily briefing displayed on a living-room 4K TV e-ink screen for ${personName}.`,
    `Current local time: ${dateLabel}, ${timeLabel} (${period}).`,
    `Weather: ${weatherLine}`,
    openNote,
    '',
    "Today's calendar:",
    formatList(todayEvents),
    '',
    "Tomorrow's calendar (for evening glance only if relevant):",
    formatList(tomorrowEvents.slice(0, 3)),
    '',
    'Instructions:',
    '- Write 2 to 3 concise, natural sentences (45–75 words total).',
    '- Sound thoughtful, human, and grounded — like a calm personal assistant, never robotic or overly cheesy.',
    '- Highlight the rhythm of the day (key anchor events, any back-to-back stretch or nice open window, and a quick weather nod if helpful).',
    '- Do not use bullet points, markdown, emojis, or quotation marks.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Smart zero-dependency local summary generator used when no AI key is configured
 * or if an AI provider is temporarily unreachable.
 */
export function generateLocalSummary({
  personName,
  now,
  timeZone,
  todayEvents,
  tomorrowEvents,
  weather,
  dayRhythm,
}) {
  const zoned = getZonedParts(now, timeZone);
  const timed = todayEvents.filter((e) => !e.allDay);
  const allDay = todayEvents.filter((e) => e.allDay);
  const upcoming = timed.filter((e) => new Date(e.end).getTime() > now.getTime());

  const parts = [];

  // 1. Opening cadence based on schedule density
  if (timed.length === 0) {
    if (allDay.length > 0) {
      parts.push(
        `Today is wide open for ${personName} with ${allDay[0].title} on the calendar and no timed commitments.`,
      );
    } else {
      parts.push(
        `Your calendar is completely clear today, ${personName} — plenty of room to move at your own pace.`,
      );
    }
  } else if (upcoming.length === 0) {
    const tomorrowCount = tomorrowEvents.length;
    parts.push(
      `Today's ${timed.length} scheduled ${timed.length === 1 ? 'event is' : 'events are'} all wrapped up for the evening.`,
    );
    if (tomorrowCount > 0) {
      const firstTomorrow = tomorrowEvents.find((e) => !e.allDay) || tomorrowEvents[0];
      const tomorrowTime = firstTomorrow.allDay
        ? 'all day'
        : `at ${formatTimeShort(firstTomorrow.start, timeZone)}`;
      parts.push(
        `Tomorrow brings ${tomorrowCount} ${tomorrowCount === 1 ? 'item' : 'items'}, starting with ${firstTomorrow.title} ${tomorrowTime}.`,
      );
    }
  } else {
    const busyHours = dayRhythm ? Math.round((dayRhythm.busyMinutes / 60) * 10) / 10 : 0;
    const pace =
      timed.length >= 5 || busyHours >= 5.5
        ? 'a full, lively day'
        : timed.length >= 3
          ? 'a nicely paced day'
          : 'a light, breathable day';

    const next = upcoming[0];
    const isNow = new Date(next.start).getTime() <= now.getTime();
    const nextPhrase = isNow
      ? `${next.title} is underway now until ${formatTimeShort(next.end, timeZone)}`
      : `${next.title} comes up at ${formatTimeShort(next.start, timeZone)}`;

    parts.push(`Looks like ${pace} ahead with ${timed.length} timed ${timed.length === 1 ? 'event' : 'events'} — ${nextPhrase}.`);

    // Mention open window or evening anchor
    const eveningEvent = upcoming.find((e) => getZonedParts(new Date(e.start), timeZone).hour >= 17);
    if (dayRhythm?.longestOpenWindow && dayRhythm.longestOpenWindow.minutes >= 90 && zoned.hour < 16) {
      parts.push(
        `You have a generous open stretch from ${dayRhythm.longestOpenWindow.label} to recharge or focus${
          eveningEvent && eveningEvent.id !== next.id
            ? `, before ${eveningEvent.title} at ${formatTimeShort(eveningEvent.start, timeZone)}`
            : ''
        }.`,
      );
    } else if (eveningEvent && eveningEvent.id !== next.id) {
      parts.push(
        `The evening wraps up with ${eveningEvent.title} at ${formatTimeShort(eveningEvent.start, timeZone)}${
          eveningEvent.location ? ` at ${eveningEvent.location}` : ''
        }.`,
      );
    }
  }

  // 2. Concise weather note
  if (weather?.available && weather.high !== null) {
    const rainNote =
      weather.precipChance >= 40
        ? ` and a ${weather.precipChance}% chance of rain, so keep a layer handy`
        : '';
    parts.push(
      `Expect ${weather.condition.toLowerCase()} skies with a high of ${weather.high}${weather.unitSymbol}${rainNote}.`,
    );
  }

  return parts.join(' ');
}

async function callGemini(apiKey, model, prompt, fetchImpl) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 220,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini returned empty text');
  return text;
}

async function callOpenAI(apiKey, model, prompt, fetchImpl) {
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: 'You write calm, concise, editorial daily briefings for a living-room e-ink display.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned empty text');
  return text;
}

async function callAnthropic(apiKey, model, prompt, fetchImpl) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      temperature: 0.65,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.content
    ?.filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) throw new Error('Anthropic returned empty text');
  return text;
}

/**
 * Generates (or returns cached) AI daily summary with automatic local fallback.
 */
export async function generateDailySummary(context, aiConfig = {}, fetchImpl = fetch) {
  const resolved = resolveAiProvider(aiConfig);
  const zoned = getZonedParts(context.now, context.timeZone);
  const periodBucket =
    zoned.hour < 11 ? 'morning' : zoned.hour < 16 ? 'midday' : 'evening';

  const digestSource = JSON.stringify({
    provider: resolved.provider,
    model: resolved.model,
    person: context.personName,
    date: `${zoned.year}-${zoned.month}-${zoned.day}`,
    periodBucket,
    today: context.todayEvents.map((e) => [e.title, e.start, e.end, e.allDay]),
    tomorrow: context.tomorrowEvents.slice(0, 3).map((e) => [e.title, e.start]),
    weather: context.weather?.available
      ? [context.weather.high, context.weather.condition, context.weather.precipChance]
      : null,
  });

  const cacheKey = crypto.createHash('sha256').update(digestSource).digest('hex');
  const ttlMs = (aiConfig.cacheMinutes || 45) * 60 * 1000;
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < ttlMs) {
    return { ...cached.result, cached: true };
  }

  if (resolved.provider === 'local') {
    const result = {
      text: generateLocalSummary(context),
      provider: 'local',
      model: 'smart-local',
      cached: false,
      generatedAt: context.now.toISOString(),
    };
    summaryCache.set(cacheKey, { result, createdAt: Date.now() });
    return result;
  }

  const prompt = buildSummaryPrompt(context);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const timedFetch = (url, opts) => fetchImpl(url, { ...opts, signal: controller.signal });

  try {
    let text;
    if (resolved.provider === 'gemini') {
      text = await callGemini(resolved.apiKey, resolved.model, prompt, timedFetch);
    } else if (resolved.provider === 'openai') {
      text = await callOpenAI(resolved.apiKey, resolved.model, prompt, timedFetch);
    } else if (resolved.provider === 'anthropic') {
      text = await callAnthropic(resolved.apiKey, resolved.model, prompt, timedFetch);
    }

    const cleaned = String(text || '')
      .replace(/^["“]|["”]$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const result = {
      text: cleaned || generateLocalSummary(context),
      provider: cleaned ? resolved.provider : 'local',
      model: cleaned ? resolved.model : 'smart-local',
      cached: false,
      generatedAt: context.now.toISOString(),
    };
    summaryCache.set(cacheKey, { result, createdAt: Date.now() });
    return result;
  } catch (err) {
    return {
      text: generateLocalSummary(context),
      provider: 'local',
      model: 'smart-local',
      fallbackReason: err.message || 'AI provider unavailable',
      cached: false,
      generatedAt: context.now.toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}
