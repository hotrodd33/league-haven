const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for current weather
const FORECAST_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours for forecasts
const cache = new Map();

// Playability score for baseball based on weather conditions
function computePlayability(weather) {
  let score = 100;
  let reasons = [];

  // Precipitation / rain — biggest factor
  if (weather.precipitationProbability >= 80) { score -= 50; reasons.push('Very likely rain'); }
  else if (weather.precipitationProbability >= 60) { score -= 35; reasons.push('Likely rain'); }
  else if (weather.precipitationProbability >= 40) { score -= 20; reasons.push('Possible rain'); }
  else if (weather.precipitationProbability >= 20) { score -= 8; }

  if (weather.precipitation > 0.1) { score -= 30; reasons.push('Active precipitation'); }

  // Thunderstorms
  if (weather.weatherCode >= 95) { score -= 40; reasons.push('Thunderstorms'); }

  // Temperature extremes (feels-like)
  const feelsLike = weather.feelsLike ?? weather.temp;
  if (feelsLike > 105) { score -= 35; reasons.push('Extreme heat'); }
  else if (feelsLike > 95) { score -= 20; reasons.push('Very hot'); }
  else if (feelsLike > 90) { score -= 10; reasons.push('Hot'); }
  else if (feelsLike < 35) { score -= 25; reasons.push('Very cold'); }
  else if (feelsLike < 45) { score -= 10; reasons.push('Cold'); }

  // Wind gusts
  const gusts = weather.windGusts ?? weather.windSpeed;
  if (gusts >= 40) { score -= 25; reasons.push('Dangerous wind gusts'); }
  else if (gusts >= 30) { score -= 15; reasons.push('Strong wind gusts'); }
  else if (gusts >= 20) { score -= 5; }

  // Fog / visibility
  if (weather.weatherCode === 45 || weather.weatherCode === 48) { score -= 15; reasons.push('Fog'); }

  score = Math.max(0, Math.min(100, score));

  let rating;
  if (score >= 75) rating = 'good';
  else if (score >= 50) rating = 'fair';
  else if (score >= 25) rating = 'poor';
  else rating = 'unplayable';

  return { score, rating, reasons };
}

// Wind direction degrees → compass label
function degreesToCompass(deg) {
  if (deg == null) return null;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// GET /api/weather?lat=...&lon=...
// Returns current weather for a location
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

    const cacheKey = `current:${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return res.json(cached.data);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,relative_humidity_2m&hourly=precipitation_probability&forecast_days=1&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[WEATHER] Open-Meteo error:', response.status);
      return res.status(502).json({ error: 'Weather service unavailable' });
    }

    const data = await response.json();
    const c = data.current;

    // Get current hour's precipitation probability
    const currentHour = new Date().getHours();
    const precipProb = data.hourly?.precipitation_probability?.[currentHour] ?? null;

    const result = {
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      windSpeed: Math.round(c.wind_speed_10m),
      windDirection: degreesToCompass(c.wind_direction_10m),
      windDirectionDeg: c.wind_direction_10m,
      windGusts: Math.round(c.wind_gusts_10m),
      precipitation: c.precipitation,
      precipitationProbability: precipProb,
      weatherCode: c.weather_code,
      description: weatherCodeToDescription(c.weather_code),
      icon: weatherCodeToIcon(c.weather_code),
      isForecast: false,
    };
    result.playability = computePlayability(result);

    cache.set(cacheKey, { data: result, time: Date.now() });
    cleanCache();

    res.json(result);
  } catch (err) {
    console.error('Weather fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

// GET /api/weather/forecast?lat=...&lon=...&date=YYYY-MM-DD&time=HH:MM
// Returns forecast weather for a specific date/time (up to 16 days out)
router.get('/forecast', authMiddleware, async (req, res) => {
  try {
    const { lat, lon, date, time } = req.query;
    if (!lat || !lon || !date) return res.status(400).json({ error: 'lat, lon, and date are required' });

    // Validate date is in the future and within 16-day range
    const targetDate = new Date(date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 16);

    if (targetDate > maxDate) {
      return res.json({ unavailable: true, reason: 'Forecast only available up to 16 days ahead' });
    }

    const cacheKey = `forecast:${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}:${date}:${time || ''}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < FORECAST_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Request hourly data for the target date
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      hourly: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,relative_humidity_2m,uv_index',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max',
      start_date: date,
      end_date: date,
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      precipitation_unit: 'inch',
      timezone: 'auto',
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[WEATHER] Open-Meteo forecast error:', response.status);
      return res.status(502).json({ error: 'Weather service unavailable' });
    }

    const data = await response.json();
    let result;

    if (time && data.hourly?.time) {
      // Find the closest hour to the requested game time
      const targetHour = parseInt(time.split(':')[0], 10);
      const idx = Math.min(targetHour, data.hourly.time.length - 1);
      const h = data.hourly;

      result = {
        temp: Math.round(h.temperature_2m[idx]),
        feelsLike: Math.round(h.apparent_temperature[idx]),
        humidity: h.relative_humidity_2m[idx],
        windSpeed: Math.round(h.wind_speed_10m[idx]),
        windDirection: degreesToCompass(h.wind_direction_10m[idx]),
        windDirectionDeg: h.wind_direction_10m[idx],
        windGusts: Math.round(h.wind_gusts_10m[idx]),
        precipitation: h.precipitation[idx],
        precipitationProbability: h.precipitation_probability[idx],
        uvIndex: h.uv_index?.[idx] ?? null,
        weatherCode: h.weather_code[idx],
        description: weatherCodeToDescription(h.weather_code[idx]),
        icon: weatherCodeToIcon(h.weather_code[idx]),
        isForecast: true,
        forecastDate: date,
        forecastTime: time,
      };
    } else {
      // No specific time — use daily summary
      const d = data.daily;
      result = {
        tempHigh: Math.round(d.temperature_2m_max[0]),
        tempLow: Math.round(d.temperature_2m_min[0]),
        temp: Math.round((d.temperature_2m_max[0] + d.temperature_2m_min[0]) / 2),
        windSpeed: Math.round(d.wind_speed_10m_max[0]),
        windGusts: Math.round(d.wind_gusts_10m_max[0]),
        precipitationProbability: d.precipitation_probability_max[0],
        uvIndex: d.uv_index_max?.[0] ?? null,
        weatherCode: d.weather_code[0],
        description: weatherCodeToDescription(d.weather_code[0]),
        icon: weatherCodeToIcon(d.weather_code[0]),
        isForecast: true,
        forecastDate: date,
        isDailySummary: true,
      };
    }

    result.playability = computePlayability(result);

    cache.set(cacheKey, { data: result, time: Date.now() });
    cleanCache();

    res.json(result);
  } catch (err) {
    console.error('Weather forecast error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

function cleanCache() {
  if (cache.size > 200) {
    const now = Date.now();
    for (const [key, val] of cache) {
      const ttl = key.startsWith('forecast:') ? FORECAST_CACHE_TTL : CACHE_TTL;
      if (now - val.time > ttl) cache.delete(key);
    }
  }
}

// WMO Weather interpretation codes → description
function weatherCodeToDescription(code) {
  const map = {
    0: 'Clear sky',
    1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Heavy freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Light snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
  };
  return map[code] || 'Unknown';
}

// WMO codes → emoji icons
function weatherCodeToIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

module.exports = router;
