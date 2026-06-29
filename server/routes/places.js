import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { geocode } from '../services/geo.js';

// Address autocomplete + verification. Same engine switch as services/geo.js:
//   • GOOGLE_MAPS_API_KEY present → Google Places API (New) — places.googleapis.com/v1
//   • absent                      → FREE OpenStreetMap Nominatim (no key, $0)
// The key is SERVER-ONLY; the browser reaches this via /api/places. Autocomplete is
// ZIP-biased so the dropdown narrows to the customer's postal area, and every result
// carries a precision flag so the UI can warn on a vague pin (a street/area, a forest)
// instead of silently accepting a bad address. We use the NEW Places API because that's
// what's enabled on the project; an enabled-but-unused API costs nothing — billing is
// strictly per request (autocomplete session + the one details call).

const GKEY = (process.env.GOOGLE_MAPS_API_KEY || '').trim();

export const placesRouter = Router();

// Protect the paid key from keystroke floods. Generous for a real dispatcher, hard cap on abuse.
placesRouter.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ─── Precision classification ──────────────────────────────────────────────────
// 'exact'  → a specific building/rooftop we can drive to.
// 'approx' → a street, area, postcode, or natural feature — needs a human double-check.

function precisionFromTypes(types = []) {
  const exact = ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest', 'room', 'floor'];
  return types.some((t) => exact.includes(t)) ? 'exact' : 'approx';
}

function osmPrecision(addresstype, type, cls) {
  const exact = ['building', 'house', 'address', 'amenity', 'shop', 'office'];
  if (exact.includes(addresstype) || exact.includes(type) || cls === 'building') return 'exact';
  return 'approx'; // road / suburb / natural / etc.
}

// ─── Google Places API (New) ───────────────────────────────────────────────────

async function googleAutocomplete(q, zip, sessiontoken) {
  const body = { input: q, includedRegionCodes: ['us'] };
  if (sessiontoken) body.sessionToken = sessiontoken;
  // ZIP bias: geocode the postcode (cached) and steer suggestions to a tight radius around it.
  if (zip) {
    const center = await geocode(`${zip}, USA`);
    if (center) body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 12000 } };
  }
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`autocomplete http ${r.status}`);
  const data = await r.json();
  return (data.suggestions || [])
    .filter((s) => s.placePrediction)
    .map((s) => {
      const p = s.placePrediction;
      return {
        placeId: p.placeId,
        description: p.text?.text || '',
        mainText: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondaryText: p.structuredFormat?.secondaryText?.text || '',
        // lat/lng/precision come from a follow-up details call (predictions carry no geometry).
        lat: null, lng: null, zip: null, precision: null,
      };
    });
}

async function googleDetails(placeId, sessiontoken) {
  const params = new URLSearchParams();
  if (sessiontoken) params.set('sessionToken', sessiontoken); // closes the billing session
  const qs = params.toString();
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${qs ? `?${qs}` : ''}`;
  const r = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GKEY,
      'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents,types',
    },
  });
  if (!r.ok) throw new Error(`details http ${r.status}`);
  const res = await r.json();
  const loc = res.location;
  if (!loc || typeof loc.latitude !== 'number') throw new Error('details missing location');
  const zipComp = (res.addressComponents || []).find((c) => (c.types || []).includes('postal_code'));
  return {
    placeId: res.id || placeId,
    formattedAddress: res.formattedAddress || '',
    lat: loc.latitude,
    lng: loc.longitude,
    zip: zipComp?.longText || null,
    precision: precisionFromTypes(res.types),
  };
}

// ─── OpenStreetMap (free fallback) ─────────────────────────────────────────────
// Nominatim returns geometry inline, so OSM autocomplete carries lat/lng/precision and
// the client never needs a details round-trip. We stash coords in the placeId (osm:lat,lng)
// so /details can resolve it without re-querying.

async function osmAutocomplete(q, zip) {
  const query = zip && !q.includes(zip) ? `${q}, ${zip}` : q;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=6&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch; contact: owner@trustkey.az)' } });
  if (!r.ok) throw new Error(String(r.status));
  const data = await r.json();
  if (!Array.isArray(data)) return [];
  return data.map((d) => {
    const lat = parseFloat(d.lat), lng = parseFloat(d.lon);
    const precision = osmPrecision(d.addresstype, d.type, d.class);
    const main = d.name || d.display_name.split(',')[0];
    return {
      placeId: `osm:${lat},${lng}`,
      description: d.display_name,
      mainText: main,
      secondaryText: d.display_name.split(',').slice(1).join(',').trim(),
      lat, lng,
      zip: d.address?.postcode || null,
      precision,
    };
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// GET /autocomplete?q=&zip=&sessiontoken=  → [{ placeId, mainText, secondaryText, lat?, lng?, zip?, precision? }]
placesRouter.get('/autocomplete', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const zip = String(req.query.zip || '').trim();
  const sessiontoken = String(req.query.sessiontoken || '').trim();
  if (q.length < 3) return res.json([]); // too short to be useful — don't spend a call
  try {
    const items = GKEY ? await googleAutocomplete(q, zip, sessiontoken) : await osmAutocomplete(q, zip);
    return res.json(items);
  } catch (err) {
    console.warn('[places] autocomplete failed, trying OSM:', err.message);
    try { return res.json(await osmAutocomplete(q, zip)); }
    catch (e2) { console.error('[places] OSM autocomplete failed:', e2.message); return res.json([]); }
  }
});

// GET /details?placeId=&sessiontoken=  → { placeId, formattedAddress, lat, lng, zip, precision }
placesRouter.get('/details', async (req, res) => {
  const placeId = String(req.query.placeId || '').trim();
  const sessiontoken = String(req.query.sessiontoken || '').trim();
  if (!placeId) return res.status(400).json({ error: 'placeId required' });

  // OSM ids already carry coordinates — no second lookup needed.
  if (placeId.startsWith('osm:')) {
    const [lat, lng] = placeId.slice(4).split(',').map(Number);
    if ([lat, lng].some(Number.isNaN)) return res.status(400).json({ error: 'bad osm id' });
    return res.json({ placeId, formattedAddress: '', lat, lng, zip: null, precision: 'approx' });
  }

  if (!GKEY) return res.status(404).json({ error: 'details unavailable without Google key' });
  try {
    return res.json(await googleDetails(placeId, sessiontoken));
  } catch (err) {
    console.error('[places] details failed:', err.message);
    return res.status(502).json({ error: 'details failed' });
  }
});
