import { VEHICLE_KEYS } from './data/vehicleKeys';
import { PROCEDURES, type KeyProcedure } from './data/procedures';
import type { VehicleKeyProfile, Part } from './types';

// Free, no-key VIN decoder (US gov). Returns make/model/year — NOT key data
// (no VIN encodes that). We join the decode to our own key dataset by make+model+year.
const NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

export interface DecodedVin {
  vin: string;
  make: string;
  model: string;
  year: number | null;
  bodyClass?: string;
  vehicleType?: string;
  trim?: string;
  plantCountry?: string;
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Decode a 17-char VIN via NHTSA. Returns null on a bad VIN or network failure
// (the UI then falls back to manual make/year entry — important offline in a garage).
export async function decodeVin(vin: string): Promise<DecodedVin | null> {
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17 || /[IOQ]/.test(clean)) return null;
  try {
    const res = await fetch(`${NHTSA}/${encodeURIComponent(clean)}?format=json`);
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.Results?.[0];
    if (!r || (!r.Make && !r.Model)) return null;
    const yr = r.ModelYear ? parseInt(r.ModelYear, 10) : NaN;
    return {
      vin: clean,
      make: r.Make ? titleCase(r.Make) : '',
      model: r.Model || '',
      year: Number.isFinite(yr) ? yr : null,
      bodyClass: r.BodyClass || undefined,
      vehicleType: r.VehicleType || undefined,
      trim: r.Trim || undefined,
      plantCountry: r.PlantCountry || undefined,
    };
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface KeyQuery {
  make: string;
  model?: string;
  year?: number | null;
}

// Find matching key profiles. Make must match; model is fuzzy (contains either way,
// so "Wrangler JL" matches "Wrangler"); year must fall in the row's span.
export function findKeyProfiles(q: KeyQuery): VehicleKeyProfile[] {
  const make = norm(q.make);
  const model = q.model ? norm(q.model) : '';
  const year = q.year ?? null;
  if (!make) return [];
  return VEHICLE_KEYS.filter((p) => {
    if (norm(p.make) !== make) return false;
    if (model) {
      const pm = norm(p.model);
      if (pm !== model && !pm.includes(model) && !model.includes(pm)) return false;
    }
    if (year != null) {
      const end = p.yearEnd ?? 9999;
      if (year < p.yearStart || year > end) return false;
    }
    return true;
  }).sort((a, b) => b.yearStart - a.yearStart);
}

// Dropdown/datalist helpers for manual entry.
export const KNOWN_MAKES = Array.from(new Set(VEHICLE_KEYS.map((p) => p.make))).sort();

export function modelsForMake(make: string): string[] {
  const m = norm(make);
  return Array.from(
    new Set(VEHICLE_KEYS.filter((p) => norm(p.make) === m).map((p) => p.model))
  ).sort();
}

// Stock cross-reference: does our inventory carry a blank for this keyway?
// Matches key-blank parts whose name or SKU contains the keyway code.
export function stockForKeyway(keyway: string | undefined, inventory: Part[]): Part[] {
  if (!keyway) return [];
  const k = norm(keyway);
  return inventory.filter(
    (p) =>
      p.category === 'Key Blanks' &&
      (norm(p.name).includes(k) || norm(p.sku).includes(k))
  );
}

// Reverse lookup: tech has a mystery fob / blank in hand — type its FCC ID, OEM part
// number, blade (Ilco/Silca/JMA) or keyway and find every car it fits. Great for using
// up old stock and for "what is this key I just found".
export function reverseLookup(query: string): VehicleKeyProfile[] {
  const q = norm(query);
  if (q.length < 3) return [];
  const hit = (s?: string) => (s ? norm(s).includes(q) : false);
  return VEHICLE_KEYS.filter((p) =>
    (p.variants || []).some(
      (v) =>
        hit(v.fccId) || hit(v.partNumber) || hit(v.bladeIlco) ||
        hit(v.bladeSilca) || hit(v.bladeJma) || hit(v.keyway) || hit(v.transponderChip)
    )
  ).slice(0, 40);
}

// Join a step-by-step programming procedure to a vehicle (make + model + year).
export function findProcedure(make: string, model?: string, year?: number | null): KeyProcedure | null {
  const m = norm(make);
  const md = model ? norm(model) : '';
  const y = year ?? null;
  if (!m) return null;
  const matches = PROCEDURES.filter((p) => {
    if (norm(p.make) !== m) return false;
    if (md) {
      const pm = norm(p.model);
      if (pm !== md && !pm.includes(md) && !md.includes(pm)) return false;
    }
    if (y != null) {
      const end = p.yearEnd ?? 9999;
      if (y < p.yearStart || y > end) return false;
    }
    return true;
  });
  return matches.sort((a, b) => b.yearStart - a.yearStart)[0] || null;
}
