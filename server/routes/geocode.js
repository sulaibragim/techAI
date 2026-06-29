import { Router } from 'express';
import { geocode } from '../services/geo.js';

export const geocodeRouter = Router();

// Free geocoding via OpenStreetMap Nominatim (no API key / billing). The actual lookup
// and caching live in services/geo.js so the OpenPhone webhook can reuse them.
geocodeRouter.get('/', async (req, res) => {
  const address = req.query.address;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'address required' });
  }
  const ll = await geocode(address);
  return ll ? res.json(ll) : res.status(404).json({ error: 'not found' });
});
