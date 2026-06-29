// Shared, FREE geo helpers (no API key / no billing): OpenStreetMap Nominatim for
// geocoding and public OSRM for driving routes. Used by the geocode + dispatch routes
// and by the OpenPhone webhook's "where's my tech?" auto-reply. Results are cached in
// memory so a repeated address/route is only ever fetched once per server lifetime.

const geoCache = new Map(); // normalized address -> {lat,lng} | null
const normAddr = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Address → {lat,lng} | null. Caches both hits and misses.
export async function geocode(address) {
  if (!address || typeof address !== 'string') return null;
  const key = normAddr(address);
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch; contact: owner@trustkey.az)' },
    });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    if (Array.isArray(data) && data[0]) {
      const ll = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geoCache.set(key, ll);
      return ll;
    }
    geoCache.set(key, null); // remember the miss so we don't retry a bad address
    return null;
  } catch (err) {
    console.error('[geo] geocode failed:', err.message);
    return null; // transient — don't cache, allow a later retry
  }
}

const toRad = (d) => (d * Math.PI) / 180;

// Great-circle (straight-line) distance in miles.
export function haversineMiles(a, b) {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Rough city-drive ETA in minutes from straight-line miles (~22 mph effective + buffer).
export function approxEtaMinutes(miles) {
  return Math.max(1, Math.round((miles / 22) * 60) + 3);
}

// Real driving {minutes, miles} via OSRM, falling back to a straight-line estimate so a
// caller always gets something. Returns null only if neither coord is usable.
export async function drivingRoute(from, to) {
  if (!from || !to || [from.lat, from.lng, to.lat, to.lng].some((n) => typeof n !== 'number' || Number.isNaN(n))) {
    return null;
  }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const r = await fetch(url, { headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch)' } });
    if (r.ok) {
      const data = await r.json();
      const route = data.routes && data.routes[0];
      if (route) return { minutes: Math.round(route.duration / 60), miles: +(route.distance / 1609.34).toFixed(1) };
    }
  } catch (err) {
    console.error('[geo] OSRM route failed:', err.message);
  }
  const miles = haversineMiles(from, to);
  return { miles: +miles.toFixed(1), minutes: approxEtaMinutes(miles) };
}

// Friendly arrival phrase from a minute estimate, rounded to a soft 5-minute window.
export function etaPhrase(min) {
  if (!min || min < 1) return 'shortly';
  if (min <= 5) return 'in about 5 minutes';
  const lo = Math.floor(min / 5) * 5;
  return `in about ${lo}–${lo + 5} minutes`;
}
