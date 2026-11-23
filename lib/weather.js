const weatherCache = new Map();

export function clearWeatherCache() {
  weatherCache.clear();
}

/**
 * Maps WMO Weather Interpretation Codes to concise editorial descriptions and icon keys.
 */
export function describeWmoCode(code) {
  const table = {
    0: { label: 'Clear Sky', icon: 'sun' },
    1: { label: 'Mostly Clear', icon: 'sun-cloud' },
    2: { label: 'Partly Cloudy', icon: 'sun-cloud' },
    3: { label: 'Overcast', icon: 'cloud' },
    45: { label: 'Foggy', icon: 'fog' },
    48: { label: 'Freezing Fog', icon: 'fog' },
    51: { label: 'Light Drizzle', icon: 'drizzle' },
    53: { label: 'Drizzle', icon: 'drizzle' },
    55: { label: 'Dense Drizzle', icon: 'drizzle' },
    56: { label: 'Freezing Drizzle', icon: 'drizzle' },
    57: { label: 'Freezing Drizzle', icon: 'drizzle' },
    61: { label: 'Light Rain', icon: 'rain' },
    63: { label: 'Rain', icon: 'rain' },
    65: { label: 'Heavy Rain', icon: 'rain' },
    66: { label: 'Freezing Rain', icon: 'rain' },
    67: { label: 'Heavy Freezing Rain', icon: 'rain' },
    71: { label: 'Light Snow', icon: 'snow' },
    73: { label: 'Snow', icon: 'snow' },
    75: { label: 'Heavy Snow', icon: 'snow' },
    77: { label: 'Snow Grains', icon: 'snow' },
    80: { label: 'Rain Showers', icon: 'rain' },
    81: { label: 'Showers', icon: 'rain' },
    82: { label: 'Heavy Showers', icon: 'rain' },
    85: { label: 'Snow Showers', icon: 'snow' },
    86: { label: 'Heavy Snow Showers', icon: 'snow' },
    95: { label: 'Thunderstorm', icon: 'storm' },
    96: { label: 'Storm & Hail', icon: 'storm' },
    99: { label: 'Severe Storm', icon: 'storm' },
  };
  return table[code] || { label: 'Mild', icon: 'sun-cloud' };
}

/**
 * Fetches current weather, today's high/low, precipitation chance, and sunrise/sunset
 * from the free Open-Meteo API (no API key required).
 */
export async function fetchWeather({
  lat,
  lon,
  locationName,
  units = 'fahrenheit',
  timeZone = 'auto',
  cacheMinutes = 15,
}) {
  const key = `${lat.toFixed(3)}:${lon.toFixed(3)}:${units}:${timeZone}`;
  const cached = weatherCache.get(key);
  const ttlMs = cacheMinutes * 60 * 1000;
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.data;
  }

  const tempUnit = units === 'celsius' ? 'celsius' : 'fahrenheit';
  const windUnit = units === 'celsius' ? 'kmh' : 'mph';

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
      locationName: locationName || 'Local Weather',
      units: tempUnit,
      unitSymbol: tempUnit === 'celsius' ? '°C' : '°F',
      windUnit,
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
      error: err.message || 'Weather unavailable',
      locationName: locationName || 'Local Weather',
      units: tempUnit,
      unitSymbol: tempUnit === 'celsius' ? '°C' : '°F',
      windUnit,
      temperature: null,
      feelsLike: null,
      high: null,
      low: null,
      precipChance: null,
      windSpeed: null,
      isDay: true,
      condition: 'Weather offline',
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
    language: 'en',
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
        shortName: item.admin1 ? `${item.name}, ${item.admin1}` : `${item.name}, ${item.country_code || ''}`.replace(/,\s*$/, ''),
        lat: item.latitude,
        lon: item.longitude,
        timezone: item.timezone || 'UTC',
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
