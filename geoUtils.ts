export interface LatLng { lat: number; lng: number; }

const toRad = (d: number) => (d * Math.PI) / 180;

// Great-circle (straight-line) distance in miles between two coordinates.
export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Rough city-drive ETA in minutes from straight-line miles (~22 mph effective + small buffer).
// Good enough for ranking; precise drive time can come from the Distance Matrix later.
export function approxEtaMinutes(miles: number): number {
  return Math.max(1, Math.round((miles / 22) * 60) + 3);
}

export function formatMiles(miles: number): string {
  return miles < 10 ? miles.toFixed(1) : Math.round(miles).toString();
}
