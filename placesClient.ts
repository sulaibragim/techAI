import { API_BASE } from './backendUrl';

// Address autocomplete + verification via the backend Places proxy (Google when a key is
// set, free OpenStreetMap otherwise). The browser never sees the Maps key.

export type GeoPrecision = 'exact' | 'approx' | 'none';

export interface AddressSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  lat: number | null;
  lng: number | null;
  zip: string | null;
  precision: GeoPrecision | null;
}

export interface ResolvedAddress {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  zip: string | null;
  precision: GeoPrecision;
}

// A Places "session" groups the keystroke autocomplete calls + the final details call so
// Google bills them as one cheap session. Generate one per address-entry session.
export function newSessionToken(): string {
  return (crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function autocompleteAddress(q: string, zip: string, sessiontoken: string): Promise<AddressSuggestion[]> {
  if (!q || q.trim().length < 3) return [];
  const params = new URLSearchParams({ q: q.trim(), sessiontoken });
  if (zip.trim()) params.set('zip', zip.trim());
  try {
    const res = await fetch(`${API_BASE}/api/places/autocomplete?${params}`);
    if (!res.ok) return [];
    return (await res.json()) as AddressSuggestion[];
  } catch { return []; }
}

export async function resolveAddress(placeId: string, sessiontoken: string): Promise<ResolvedAddress | null> {
  if (!placeId) return null;
  const params = new URLSearchParams({ placeId, sessiontoken });
  try {
    const res = await fetch(`${API_BASE}/api/places/details?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as ResolvedAddress;
  } catch { return null; }
}
