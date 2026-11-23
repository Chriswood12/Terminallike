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
  return new Intl.DateTimeFormat('da-DK', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace('.', ':');
}

/**
 * Builds a concise Danish editorial prompt for Gemini, OpenAI, or Anthropic.
 */
export function buildSummaryPrompt({ personName, now, timeZone, todayEvents, tomorrowEvents, weather, dayRhythm }) {
  const zoned = getZonedParts(now, timeZone);
  const period =
    zoned.hour < 12 ? 'morgen' : zoned.hour < 17 ? 'eftermiddag' : 'aften';

  const dateLabel = new Intl.DateTimeFormat('da-DK', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const timeLabel = formatTimeShort(now.toISOString(), timeZone);

  const formatList = (list) =>
    list.length === 0
      ? 'Ingen aftaler i kalenderen.'
      : list
          .map((e) => {
            const when = e.allDay
              ? 'Hele dagen'
              : `${formatTimeShort(e.start, timeZone)}–${formatTimeShort(e.end, timeZone)}`;
            const loc = e.location ? ` (${e.location})` : '';
            return `- ${when}: ${e.title}${loc} [${e.calendar}]`;
          })
          .join('\n');

  const weatherLine = weather?.available
    ? `${weather.temperature}${weather.unitSymbol} (${weather.condition}), maks ${weather.high}${weather.unitSymbol}, min ${weather.low}${weather.unitSymbol}${
        weather.precipChance >= 30 ? `, ${weather.precipChance}% risiko for nedbør` : ''
      }.`
    : 'Vejrdata er ikke tilgængelige.';

  const openNote =
    dayRhythm?.longestOpenWindow
      ? `Længste frie tidsrum mellem kl. 07 og 21: ${dayRhythm.longestOpenWindow.label}.`
      : '';

  return [
    `Du skriver et roligt, varmt og redaktionelt dagsoverblik på DANSK til en 4K TV-skærm i stuen for ${personName}.`,
    `Aktuel lokal tid: ${dateLabel} kl. ${timeLabel} (${period}).`,
    `Vejr: ${weatherLine}`,
    openNote,
    '',
    'Dagens kalender:',
    formatList(todayEvents),
    '',
    'Morgendagens kalender (nævn kun kort om aftenen hvis relevant):',
    formatList(tomorrowEvents.slice(0, 3)),
    '',
    'Instruktioner:',
    '- Skriv 2 til 3 korte, naturlige sætninger på flydende dansk (ca. 45–75 ord i alt).',
    '- Brug 24-timers tid (f.eks. kl. 14:30).',
    '- Tonen skal være rolig, varm og hjælpsom — aldrig robotagtig eller overdrevet klichéfyldt.',
    '- Fremhæv dagens rytme (vigtigste aftaler, eventuelle travle blokke eller gode pauser, og en kort bemærkning om vejret).',
    '- Ingen punkttegn, ingen markdown, ingen emojis og ingen anførselstegn.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Smart zero-dependency Danish local summary generator used when no AI key is configured
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

  if (timed.length === 0) {
    if (allDay.length > 0) {
      parts.push(
        `Dagen er helt åben for ${personName} med ${allDay[0].title} på kalenderen og ingen faste tidsbestemte aftaler.`,
      );
    } else {
      parts.push(
        `Kalenderen er helt fri i dag, ${personName} — god plads til at tage dagen i dit eget tempo.`,
      );
    }
  } else if (upcoming.length === 0) {
    const tomorrowCount = tomorrowEvents.length;
    parts.push(
      `Alle dagens ${timed.length} ${timed.length === 1 ? 'aftale er' : 'aftaler er'} nu overstået for i dag.`,
    );
    if (tomorrowCount > 0) {
      const firstTomorrow = tomorrowEvents.find((e) => !e.allDay) || tomorrowEvents[0];
      const tomorrowTime = firstTomorrow.allDay
        ? 'hele dagen'
        : `kl. ${formatTimeShort(firstTomorrow.start, timeZone)}`;
      parts.push(
        `I morgen byder på ${tomorrowCount} ${tomorrowCount === 1 ? 'punkt' : 'punkter'}, og starter med ${firstTomorrow.title} ${tomorrowTime}.`,
      );
    }
  } else {
    const busyHours = dayRhythm ? Math.round((dayRhythm.busyMinutes / 60) * 10) / 10 : 0;
    const pace =
      timed.length >= 5 || busyHours >= 5.5
        ? 'en fuld og aktiv dag'
        : timed.length >= 3
          ? 'en velafbalanceret dag'
          : 'en rolig og luftig dag';

    const next = upcoming[0];
    const isNow = new Date(next.start).getTime() <= now.getTime();
    const nextPhrase = isNow
      ? `${next.title} er i gang nu frem til kl. ${formatTimeShort(next.end, timeZone)}`
      : `${next.title} starter kl. ${formatTimeShort(next.start, timeZone)}`;

    parts.push(
      `Der venter ${pace} med ${timed.length} ${timed.length === 1 ? 'aftale' : 'aftaler'} — ${nextPhrase}.`,
    );

    const eveningEvent = upcoming.find((e) => getZonedParts(new Date(e.start), timeZone).hour >= 17);
    if (dayRhythm?.longestOpenWindow && dayRhythm.longestOpenWindow.minutes >= 90 && zoned.hour < 16) {
      parts.push(
        `Du har et godt pusterum fra ${dayRhythm.longestOpenWindow.label}${
          eveningEvent && eveningEvent.id !== next.id
            ? `, inden ${eveningEvent.title} kl. ${formatTimeShort(eveningEvent.start, timeZone)}`
            : ''
        }.`,
      );
    } else if (eveningEvent && eveningEvent.id !== next.id) {
      parts.push(
        `Aftenen rundes af med ${eveningEvent.title} kl. ${formatTimeShort(eveningEvent.start, timeZone)}${
          eveningEvent.location ? ` ved ${eveningEvent.location}` : ''
        }.`,
      );
    }
  }

  if (weather?.available && weather.high !== null) {
    const rainNote =
      weather.precipChance >= 40
        ? ` og ${weather.precipChance}% risiko for regn, så tag en jakke eller paraply med`
        : '';
    parts.push(
      `Vejret byder på ${weather.condition.toLowerCase()} med op til ${weather.high}${weather.unitSymbol}${rainNote}.`,
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
        maxOutputTokens: 240,
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
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: 'Du skriver rolige, varme og kortfattede dagsoverblik på dansk til en e-ink TV-skærm.',
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
      max_tokens: 240,
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
    lang: 'da-DK',
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
      fallbackReason: err.message || 'AI-tjeneste utilgængelig',
      cached: false,
      generatedAt: context.now.toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}
