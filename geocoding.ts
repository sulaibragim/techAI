import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { LatLng } from './geoUtils';

// Free address→coordinates lookup via the backend OpenStreetMap proxy.
// No API key, no billing. Results (including "not found") are cached in
// localStorage so each address is only ever looked up once.
const CACHE_KEY = 'geocode-cache-v1';

const readCache = (): Record<string, LatLng | null> => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};
const writeCache = (c: Record<string, LatLng | null>) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
};

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = (address || '').trim().toLowerCase();
  if (!key) return null;

  const cache = readCache();
  if (key in cache) return cache[key]; // cached hit (coords) or miss (null)

  try {
    const res = await fetch(`${API_BASE}/api/geocode?address=${encodeURIComponent(address)}`, { headers: { ...authHeaders() } });
    if (res.ok) {
      const ll = await res.json() as LatLng;
      cache[key] = ll;
      writeCache(cache);
      return ll;
    }
    if (res.status === 404) {
      cache[key] = null; // remember the miss so we don't retry a bad address
      writeCache(cache);
    }
  } catch { /* backend offline / transient — don't cache, allow retry */ }
  return null;
}
