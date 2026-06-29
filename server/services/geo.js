import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Shared geo helpers: address → coordinates and driving ETA. The engine is chosen at
// runtime by whether GOOGLE_MAPS_API_KEY is set on the server:
//   • key present  → Google Maps Platform (best US address matching + traffic-aware ETA)
//   • key absent   → FREE OpenStreetMap Nominatim + OSRM (no key, $0)
// Google falls back to the free engine on any error, so a quota/outage never breaks
// dispatch. The key is SERVER-ONLY — clients reach this via /api/geocode + /api/dispatch.
// Results are cached in memory so a repeated address/route is only fetched once.

const GKEY = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
console.log(`[geo] engine: ${GKEY ? 'Google Maps (traffic-aware)' : 'free OSM/OSRM'}`);

const geoCache = new Map(); // normalized address -> {lat,lng} | null
const normAddr = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// ─── Geocoding ───────────────────────────────────────────────────────────────

async function googleGeocode(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GKEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`geocode http ${r.status}`);
  const data = await r.json();
  if (data.status === 'OK' && data.results?.[0]) {
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  }
  if (data.status === 'ZERO_RESULTS') return null; // valid "not found"
  throw new Error(`geocode status ${data.status}`); // OVER_QUERY_LIMIT etc → let caller fall back
}

async function osmGeocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch; contact: owner@trustkey.az)' },
  });
  if (!r.ok) throw new Error(String(r.status));
  const data = await r.json();
  if (Array.isArray(data) && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  return null;
}

// Address → {lat,lng} | null. Caches both hits and misses. Prefers Google, falls back to OSM.
export async function geocode(address) {
  if (!address || typeof address !== 'string') return null;
  const key = normAddr(address);
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    let ll = null;
    if (GKEY) {
      try { ll = await googleGeocode(address); }
      catch (e) { console.warn('[geo] Google geocode failed, trying OSM:', e.message); ll = await osmGeocode(address); }
    } else {
      ll = await osmGeocode(address);
    }
    geoCache.set(key, ll); // cache hit OR confirmed miss (null) so we don't retry a bad address
    return ll;
  } catch (err) {
    console.error('[geo] geocode failed:', err.message);
    return null; // transient — don't cache, allow a later retry
  }
}

// ─── Distance / ETA ──────────────────────────────────────────────────────────

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

// Google Distance Matrix with live traffic. departure_time=now → duration_in_traffic.
async function googleRoute(from, to) {
  const origins = `${from.lat},${from.lng}`;
  const dest = `${to.lat},${to.lng}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${dest}`
    + `&departure_time=now&units=imperial&key=${GKEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`matrix http ${r.status}`);
  const data = await r.json();
  const el = data.rows?.[0]?.elements?.[0];
  if (data.status !== 'OK' || !el || el.status !== 'OK') throw new Error(`matrix status ${data.status}/${el?.status}`);
  const seconds = el.duration_in_traffic?.value ?? el.duration?.value;
  const meters = el.distance?.value;
  if (typeof seconds !== 'number' || typeof meters !== 'number') throw new Error('matrix missing values');
  return { minutes: Math.round(seconds / 60), miles: +(meters / 1609.34).toFixed(1) };
}

async function osrmRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const r = await fetch(url, { headers: { 'User-Agent': 'TrustKey-CRM/1.0 (locksmith dispatch)' } });
  if (!r.ok) throw new Error(String(r.status));
  const data = await r.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return { minutes: Math.round(route.duration / 60), miles: +(route.distance / 1609.34).toFixed(1) };
}

// Driving {minutes, miles}. Prefers Google (traffic-aware), then OSRM, then a straight-line
// estimate, so a caller always gets something usable. Null only if coords are unusable.
export async function drivingRoute(from, to) {
  if (!from || !to || [from.lat, from.lng, to.lat, to.lng].some((n) => typeof n !== 'number' || Number.isNaN(n))) {
    return null;
  }
  if (GKEY) {
    try { return await googleRoute(from, to); }
    catch (e) { console.warn('[geo] Google route failed, trying OSRM:', e.message); }
  }
  try {
    const r = await osrmRoute(from, to);
    if (r) return r;
  } catch (e) {
    console.error('[geo] OSRM route failed:', e.message);
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
