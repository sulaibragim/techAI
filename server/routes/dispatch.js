import { Router } from 'express';
import { drivingRoute } from '../services/geo.js';
import { requireAuth } from '../middleware/auth.js';

export const dispatchRouter = Router();

// Every dispatch helper requires a login: /route can hit the PAID Google Distance
// Matrix, so leaving it open lets anyone on the internet spend our Maps budget.
dispatchRouter.use(requireAuth);

// Driving ETA (Google traffic-aware when keyed, free OSRM otherwise). GET /route?from=lat,lng&to=lat,lng
dispatchRouter.get('/route', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const [flat, flng] = String(from).split(',').map(Number);
  const [tlat, tlng] = String(to).split(',').map(Number);
  if ([flat, flng, tlat, tlng].some(n => Number.isNaN(n))) return res.status(400).json({ error: 'bad coords' });
  const route = await drivingRoute({ lat: flat, lng: flng }, { lat: tlat, lng: tlng });
  if (!route) return res.status(502).json({ error: 'route failed' });
  return res.json(route);
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
