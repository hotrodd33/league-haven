const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const cache = new Map();

// GET /api/weather?lat=...&lon=...
// Returns current weather for a location using Open-Meteo (free, no API key required)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

    const cacheKey = `${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return res.json(cached.data);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[WEATHER] Open-Meteo error:', response.status);
      return res.status(502).json({ error: 'Weather service unavailable' });
    }

    const data = await response.json();
    const current = data.current;

    const result = {
      temp: Math.round(current.temperature_2m),
      windSpeed: Math.round(current.wind_speed_10m),
      precipitation: current.precipitation,
      weatherCode: current.weather_code,
      description: weatherCodeToDescription(current.weather_code),
      icon: weatherCodeToIcon(current.weather_code),
    };

    cache.set(cacheKey, { data: result, time: Date.now() });

    // Clean old cache entries periodically
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, val] of cache) {
        if (now - val.time > CACHE_TTL) cache.delete(key);
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Weather fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

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
