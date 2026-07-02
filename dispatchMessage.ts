import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { LatLng, haversineMiles, approxEtaMinutes } from './geoUtils';

export interface Weather { tempF?: number; code?: number; precipitation?: number; }

export type ClientLang = 'en' | 'es';

// One-time invite shown to English-speaking clients so they can switch to Spanish.
const SPANISH_INVITE = ' Para español, responda SÍ.';

// The client's opted-in SMS language (set server-side when they reply "SÍ"). Defaults to
// English on any failure so a message always sends.
export async function getClientLang(phone: string): Promise<ClientLang> {
  try {
    const res = await fetch(`${API_BASE}/api/openphone/client-lang?phone=${encodeURIComponent(phone)}`, { headers: { ...authHeaders() } });
    if (res.ok) { const d = await res.json(); return d.lang === 'es' ? 'es' : 'en'; }
  } catch { /* offline — default English */ }
  return 'en';
}

// Driving ETA in minutes: real road time via the backend (OSRM), falling back to a
// straight-line estimate so we always have something to tell the client.
export async function getDriveEta(from: LatLng, to: LatLng): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/api/dispatch/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`, { headers: { ...authHeaders() } });
    if (res.ok) {
      const d = await res.json();
      if (typeof d.minutes === 'number') return d.minutes;
    }
  } catch { /* fall through */ }
  try { return approxEtaMinutes(haversineMiles(from, to)); } catch { return null; }
}

// Driving distance + time (real road via OSRM, falling back to straight-line).
export async function getRouteInfo(from: LatLng, to: LatLng): Promise<{ minutes: number; miles: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/dispatch/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`, { headers: { ...authHeaders() } });
    if (res.ok) {
      const d = await res.json();
      if (typeof d.minutes === 'number' && typeof d.miles === 'number') return { minutes: d.minutes, miles: d.miles };
    }
  } catch { /* fall through */ }
  try { const miles = haversineMiles(from, to); return { miles: +miles.toFixed(1), minutes: approxEtaMinutes(miles) }; } catch { return null; }
}

export async function getWeather(at: LatLng): Promise<Weather | null> {
  try {
    const res = await fetch(`${API_BASE}/api/dispatch/weather?lat=${at.lat}&lng=${at.lng}`, { headers: { ...authHeaders() } });
    if (res.ok) return await res.json();
  } catch { /* no weather — tip falls back to mild */ }
  return null;
}

function etaPhrase(min: number | null): string {
  if (!min || min < 1) return 'shortly';
  if (min <= 5) return 'in about 5 minutes';
  const lo = Math.floor(min / 5) * 5;
  return `in about ${lo}–${lo + 5} minutes`;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// A polite, situation-aware tip that varies each send (car vs not, plus weather).
function tipFor(isCar: boolean, w: Weather | null): string {
  const t = w?.tempF;
  const rain = (w?.precipitation ?? 0) > 0.1;
  let cat: 'hot' | 'cold' | 'rain' | 'mild' = 'mild';
  if (typeof t === 'number' && t >= 85) cat = 'hot';
  else if (typeof t === 'number' && t <= 38) cat = 'cold';
  else if (rain) cat = 'rain';

  const tips: Record<string, string[]> = {
    hot_car: [
      "It's hot out today — please wait somewhere cool, and never leave children or pets inside the locked car.",
      "With this heat, find some shade and stay hydrated while you wait — and please keep kids and pets out of the hot vehicle.",
    ],
    hot: [
      "It's hot out — feel free to wait somewhere cool and shaded until I arrive.",
      "Stay cool and hydrated in this heat while you wait.",
    ],
    cold_car: ["It's cold out — please bundle up and stay warm while you wait."],
    cold: ["It's chilly today — wait somewhere warm and sheltered until I get there."],
    rain: [
      "It's wet out there — please stay dry and watch your step; I'll be quick.",
      "Looks like rain — keep dry, I'm on my way.",
    ],
    mild_car: ["Please stay near your vehicle with your ID handy so we can get you back on the road quickly."],
    mild: ["Hang tight — I'll have you taken care of shortly."],
  };

  const key = cat !== 'rain' && isCar ? `${cat}_car` : cat;
  return pick(tips[key] || tips[cat] || tips.mild);
}

// Build the full "on my way" SMS: greeting + ETA + a "reply to check ETA" invite, in the
// client's language. English messages also carry the one-time "responda SÍ" Spanish invite.
export function buildOnMyWayMessage(opts: {
  firstName?: string;
  techName: string;
  companyName: string;
  etaMinutes: number | null;
  isCar: boolean;
  weather: Weather | null;
  lang?: ClientLang;
}): string {
  const lang: ClientLang = opts.lang === 'es' ? 'es' : 'en';
  const name = (opts.firstName || '').trim() || (lang === 'es' ? 'hola' : 'there');

  if (lang === 'es') {
    const arrival = opts.etaMinutes
      ? `Voy en camino — llegaré en unos ${opts.etaMinutes} min.`
      : `Voy en camino y llegaré pronto.`;
    return `Hola ${name}, soy ${opts.techName} de ${opts.companyName}. ${arrival} Responda a este mensaje para saber cuánto falta. ¡Nos vemos pronto!`;
  }

  const arrival = opts.etaMinutes
    ? `I'm on my way and should arrive ${etaPhrase(opts.etaMinutes)}.`
    : `I'm on my way and will arrive shortly.`;
  const tip = tipFor(opts.isCar, opts.weather);
  return `Hi ${name}, this is ${opts.techName} from ${opts.companyName}. ${arrival} ${tip} Reply anytime to check my ETA.${SPANISH_INVITE} See you soon!`;
}
