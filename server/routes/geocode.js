import { Router } from 'express';

export const geocodeRouter = Router();

// Free geocoding via OpenStreetMap Nominatim. No API key / billing required.
// We proxy server-side to set a proper User-Agent (Nominatim policy) and to cache
// results so repeated addresses don't hit the public service.
const cache = new Map(); // normalized address -> {lat,lng} | null
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

geocodeRouter.get('/', async (req, res) => {
  const address = req.query.address;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'address required' });
  }
  const key = norm(address);
  if (cache.has(key)) {
    const v = cache.get(key);
    return v ? res.json(v) : res.status(404).json({ error: 'not found' });
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch; contact: owner@trustkey.az)' },
    });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    if (Array.isArray(data) && data[0]) {
      const ll = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      cache.set(key, ll);
      return res.json(ll);
    }
    cache.set(key, null); // remember the miss
    return res.status(404).json({ error: 'not found' });
  } catch (err) {
    console.error('[geocode] lookup failed:', err.message);
    return res.status(502).json({ error: 'geocode failed' });
  }
});
