import { Router } from 'express';
import { geocode } from '../services/geo.js';
import { requireAuth } from '../middleware/auth.js';

export const geocodeRouter = Router();

// Address → coordinates via the shared engine in services/geo.js (Google when keyed,
// free OSM otherwise). Auth required: this can hit the PAID Google Geocoding API, so an
// open endpoint would let anyone on the internet burn our Maps budget.
geocodeRouter.get('/', requireAuth, async (req, res) => {
  const address = req.query.address;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'address required' });
  }
  const ll = await geocode(address);
  return ll ? res.json(ll) : res.status(404).json({ error: 'not found' });
});
