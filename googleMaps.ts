import { LatLng } from './geoUtils';

// Maps JS API key — public by design, restrict it by HTTP referrer in Google Cloud.
// Set VITE_GOOGLE_MAPS_API_KEY in .env.local and in the Vercel project env.
const KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function googleMapsKeyPresent(): boolean {
  return !!KEY;
}

let loadPromise: Promise<any> | null = null;

// Load the Google Maps JS API once and resolve with the `google.maps` namespace.
export function loadGoogleMaps(): Promise<any> {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (!KEY) return Promise.reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY'));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const cb = '__initGoogleMaps';
    w[cb] = () => resolve(w.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=geometry&callback=${cb}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => { loadPromise = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

// Persistent address→coords cache so we never re-geocode (and to keep API usage low).
const CACHE_KEY = 'geocode-cache-v1';
const readCache = (): Record<string, LatLng> => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};
const writeCache = (c: Record<string, LatLng>) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
};

// Geocode an address to coordinates. Returns cached results without any network/API call,
// and null if the key is missing or the lookup fails — callers degrade gracefully.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = (address || '').trim().toLowerCase();
  if (!key) return null;
  const cache = readCache();
  if (cache[key]) return cache[key];
  try {
    const maps = await loadGoogleMaps();
    const geocoder = new maps.Geocoder();
    const { results } = await geocoder.geocode({ address });
    if (results && results[0]) {
      const loc = results[0].geometry.location;
      const ll: LatLng = { lat: loc.lat(), lng: loc.lng() };
      cache[key] = ll;
      writeCache(cache);
      return ll;
    }
  } catch { /* missing key / failed lookup — no distance ranking */ }
  return null;
}
