import { Router } from 'express';

export const dispatchRouter = Router();

// Driving ETA via free OSRM (no API key). GET /route?from=lat,lng&to=lat,lng
dispatchRouter.get('/route', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const [flat, flng] = String(from).split(',').map(Number);
    const [tlat, tlng] = String(to).split(',').map(Number);
    if ([flat, flng, tlat, tlng].some(n => Number.isNaN(n))) return res.status(400).json({ error: 'bad coords' });
    const url = `https://router.project-osrm.org/route/v1/driving/${flng},${flat};${tlng},${tlat}?overview=false`;
    const r = await fetch(url, { headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch)' } });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const route = data.routes && data.routes[0];
    if (!route) return res.status(404).json({ error: 'no route' });
    return res.json({ minutes: Math.round(route.duration / 60), miles: +(route.distance / 1609.34).toFixed(1) });
  } catch (err) {
    console.error('[dispatch] route failed:', err.message);
    return res.status(502).json({ error: 'route failed' });
  }
});

// Current weather via free Open-Meteo (no API key). GET /weather?lat=&lng=
dispatchRouter.get('/weather', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,precipitation,weather_code&temperature_unit=fahrenheit`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const c = data.current || {};
    return res.json({ tempF: c.temperature_2m, code: c.weather_code, precipitation: c.precipitation });
  } catch (err) {
    console.error('[dispatch] weather failed:', err.message);
    return res.status(502).json({ error: 'weather failed' });
  }
});
