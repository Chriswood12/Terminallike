const weatherCache = new Map();

export function clearWeatherCache() {
  weatherCache.clear();
}

/**
 * Maps WMO Weather Interpretation Codes to concise Danish editorial descriptions and icon keys.
 */
export function describeWmoCode(code) {
  const table = {
    0: { label: 'Klar himmel', icon: 'sun' },
    1: { label: 'Mest klart', icon: 'sun-cloud' },
    2: { label: 'Delvist skyet', icon: 'sun-cloud' },
    3: { label: 'Overskyet', icon: 'cloud' },
    45: { label: 'Tåget', icon: 'fog' },
    48: { label: 'Rimtåge', icon: 'fog' },
    51: { label: 'Let finregn', icon: 'drizzle' },
    53: { label: 'Finregn', icon: 'drizzle' },
    55: { label: 'Tæt finregn', icon: 'drizzle' },
    56: { label: 'Islag', icon: 'drizzle' },
    57: { label: 'Kraftigt islag', icon: 'drizzle' },
    61: { label: 'Let regn', icon: 'rain' },
    63: { label: 'Regn', icon: 'rain' },
    65: { label: 'Kraftig regn', icon: 'rain' },
    66: { label: 'Isslag', icon: 'rain' },
    67: { label: 'Kraftigt isslag', icon: 'rain' },
    71: { label: 'Let sne', icon: 'snow' },
    73: { label: 'Sne', icon: 'snow' },
    75: { label: 'Kraftig sne', icon: 'snow' },
    77: { label: 'Snekorn', icon: 'snow' },
    80: { label: 'Regnbyger', icon: 'rain' },
    81: { label: 'Byger', icon: 'rain' },
    82: { label: 'Kraftige byger', icon: 'rain' },
    85: { label: 'Snebyger', icon: 'snow' },
    86: { label: 'Kraftige snebyger', icon: 'snow' },
    95: { label: 'Tordenvejr', icon: 'storm' },
    96: { label: 'Torden og hagl', icon: 'storm' },
    99: { label: 'Kraftigt tordenvejr', icon: 'storm' },
  };
  return table[code] || { label: 'Mildt vejr', icon: 'sun-cloud' };
}

/**
 * Fetches current weather, today's high/low, precipitation chance, and sunrise/sunset
 * from the free Open-Meteo API (no API key required).
 */
export async function fetchWeather({
  lat,
  lon,
  locationName,
  units = 'celsius',
  timeZone = 'auto',
  cacheMinutes = 15,
}) {
  const key = `${lat.toFixed(3)}:${lon.toFixed(3)}:${units}:${timeZone}`;
  const cached = weatherCache.get(key);
  const ttlMs = cacheMinutes * 60 * 1000;
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.data;
  }

  const tempUnit = units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const windUnit = tempUnit === 'celsius' ? 'ms' : 'mph';

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    temperature_unit: tempUnit,
    wind_speed_unit: windUnit,
    timezone: timeZone || 'auto',
    forecast_days: '2',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Terminallike-TV/1.0' },
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const json = await res.json();
    const current = json.current || {};
    const daily = json.daily || {};

    const code = Number(current.weather_code ?? daily.weather_code?.[0] ?? 1);
    const meta = describeWmoCode(code);

    const data = {
      available: true,
      locationName: locationName || 'Lokalt vejr',
      units: tempUnit,
      unitSymbol: tempUnit === 'celsius' ? '°C' : '°F',
      windUnit: windUnit === 'ms' ? 'm/s' : 'mph',
      temperature: roundOrNull(current.temperature_2m),
      feelsLike: roundOrNull(current.apparent_temperature),
      high: roundOrNull(daily.temperature_2m_max?.[0]),
      low: roundOrNull(daily.temperature_2m_min?.[0]),
      precipChance: roundOrNull(daily.precipitation_probability_max?.[0]),
      windSpeed: roundOrNull(current.wind_speed_10m),
      isDay: current.is_day !== 0,
      condition: meta.label,
      icon: meta.icon,
      weatherCode: code,
      sunrise: daily.sunrise?.[0] || null,
      sunset: daily.sunset?.[0] || null,
      tomorrowHigh: roundOrNull(daily.temperature_2m_max?.[1]),
      tomorrowLow: roundOrNull(daily.temperature_2m_min?.[1]),
      tomorrowCondition: describeWmoCode(Number(daily.weather_code?.[1] ?? 1)).label,
      timezone: json.timezone || timeZone,
    };

    weatherCache.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    return {
      available: false,
      error: err.message || 'Vejr utilgængeligt',
      locationName: locationName || 'Lokalt vejr',
      units: tempUnit,
      unitSymbol: tempUnit === 'celsius' ? '°C' : '°F',
      windUnit: windUnit === 'ms' ? 'm/s' : 'mph',
      temperature: null,
      feelsLike: null,
      high: null,
      low: null,
      precipChance: null,
      windSpeed: null,
      isDay: true,
      condition: 'Vejr offline',
      icon: 'sun-cloud',
      sunrise: null,
      sunset: null,
      timezone: timeZone,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches cities via Open-Meteo's free Geocoding API (no API key required).
 */
export async function searchCities(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    name: q,
    count: '6',
    language: 'da',
    format: 'json',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Terminallike-TV/1.0' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const results = Array.isArray(json.results) ? json.results : [];
    return results.map((item) => {
      const parts = [item.name, item.admin1, item.country_code].filter(Boolean);
      return {
        name: parts.join(', '),
        shortName: item.country_code
          ? `${item.name}, ${item.country_code}`
          : item.name,
        lat: item.latitude,
        lon: item.longitude,
        timezone: item.timezone || 'Europe/Copenhagen',
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function roundOrNull(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : null;
}
