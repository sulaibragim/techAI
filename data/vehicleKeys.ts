import type { VehicleKeyProfile } from '../types';

// Live-verified car-key reference. Data lives per-brand under ./keys/*.json — each row
// is grouped by key generation and carries its own `sources` + `confidence`, built by
// cross-checking 2+ live catalogs (transpondery, UHS, Ilco, keyless2go, keyfobDB, …).
// Rows that couldn't be double-confirmed stay 'single-source'. Bundled into the app so
// lookups are instant and work offline. Sultan's real-job confirmations upgrade rows to
// the 'owner' tier over time.
//
// import.meta.glob auto-includes every brand file — drop a new ./keys/<brand>.json and
// it's picked up on the next build. No central list to maintain.
const modules = import.meta.glob('./keys/*.json', { eager: true }) as Record<
  string,
  { default: VehicleKeyProfile[] }
>;

export const VEHICLE_KEYS: VehicleKeyProfile[] = Object.values(modules)
  .flatMap((m) => (m.default ?? (m as unknown as VehicleKeyProfile[])))
  .filter((r) => r && r.make && r.model);
