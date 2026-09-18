import { ServiceRate } from './types';

// After 8PM every order is +$60 — that is the whole night rule (Sultan, 2026-09-18). No
// separate night prices: every screen that shows one derives it from here.
export const NIGHT_SURCHARGE = 60;
export const nightPriceOf = (rate: Pick<ServiceRate, 'price'>): number => rate.price + NIGHT_SURCHARGE;

/** Night rate runs 8PM–7AM Arizona time (no DST) — wherever the person looking sits. */
export function isNightInArizona(now: Date = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Phoenix' }).format(now));
  return hour >= 20 || hour < 7;
}

// Seeded from trustkeyaz.com (approved by Sultan 2026-06-12). Editable in Settings → Service Rates.
export const PRICE_BOOK_SEED: ServiceRate[] = [
  // Lockout
  { id: 'r-car-lockout',   name: 'Car lockout',          category: 'Lockout',         price: 139, type: 'service_call' },
  { id: 'r-home-lockout',  name: 'Home lockout',         category: 'Lockout',         price: 159, type: 'service_call' },
  { id: 'r-comm-lockout',  name: 'Commercial lockout',   category: 'Lockout',         price: 199, type: 'service_call' },
  { id: 'r-key-extraction', name: 'Broken key extraction', category: 'Lockout',       price: 169, type: 'service_call', note: 'a new key, if needed, is extra' },
  // Rekey & Install
  { id: 'r-rekey',         name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor',        note: '+$49 each additional door (+$60 night)' },
  { id: 'r-lock-install',  name: 'Lock installation',     category: 'Rekey & Install', price: 149, type: 'installation', note: 'labor only; from $249 all-in with Schlage' },
  { id: 'r-lock-repair',   name: 'Lock repair',           category: 'Rekey & Install', price: 89,  type: 'labor',        note: 'from' },
  // Smart Locks
  { id: 'r-smart-install', name: 'Smart lock installation', category: 'Smart Locks',   price: 189, type: 'installation', note: 'labor; from $369 all-in (Schlage Encode)' },
  { id: 'r-master-key',    name: 'Master key system',     category: 'Smart Locks',     price: 299, type: 'installation', note: '$99 per cylinder' },
  // Car Keys
  { id: 'r-car-key',       name: 'Car key, no chip (cut only)', category: 'Car Keys',  price: 149, type: 'labor' },
  { id: 'r-transponder',   name: 'Transponder chip key',  category: 'Car Keys',        price: 149, type: 'labor',        note: 'all-in, from' },
  { id: 'r-remote-fob',    name: 'Remote / key fob',      category: 'Car Keys',        price: 199, type: 'labor',        note: 'all-in, from' },
  { id: 'r-smart-key',     name: 'Smart key (push-to-start)', category: 'Car Keys',    price: 279, type: 'labor',        note: 'all-in, from' },
  { id: 'r-all-keys-lost', name: 'All keys lost',         category: 'Car Keys',        price: 349, type: 'labor',        note: 'from; +$59 service call (credited)' },
  // Safes
  { id: 'r-safe-open',     name: 'Safe opening',          category: 'Safes',           price: 179, type: 'service_call', note: 'from' },
  // Bundles
  { id: 'r-movein',        name: 'Move-in security bundle', category: 'Bundles',       price: 247, type: 'service_call', note: '3-door rekey + audit + 90-day priority' },
];

// An install that already saved its own price book never sees the seed again, so a seed
// change that has to reach live data is shipped as an upgrade step and this goes up.
export const PRICE_BOOK_VERSION = 2;

export interface PriceBookUpgrade {
  add: ServiceRate[];
  update: ServiceRate[];
  remove: string[];
}

const seedRate = (id: string) => PRICE_BOOK_SEED.find(r => r.id === id)!;

/**
 * What a saved price book needs to reach PRICE_BOOK_VERSION. Touches only rates still
 * holding the old seeded value — anything the owner already edited is left as he set it.
 */
export function planPriceBookUpgrade(book: ServiceRate[], fromVersion: number): PriceBookUpgrade {
  const plan: PriceBookUpgrade = { add: [], update: [], remove: [] };
  if (fromVersion < 2) {
    const byId = new Map(book.map(r => [r.id, r]));
    // "Car key (standard)" $99 → the no-chip, cut-only key at $149.
    if (byId.get('r-car-key')?.price === 99) plan.update.push(seedRate('r-car-key'));
    if (!book.some(r => r.id === 'r-key-extraction' || /extract/i.test(r.name))) plan.add.push(seedRate('r-key-extraction'));
    // Programming a fob the customer bought — we don't do it (wrong part, locked to another car).
    if (byId.get('r-fob-program')?.price === 99) plan.remove.push('r-fob-program');
  }
  return plan;
}

/** The book after the plan — the same result the server reaches from the plan's deltas. */
export function applyPriceBookUpgrade(book: ServiceRate[], { add, update, remove }: PriceBookUpgrade): ServiceRate[] {
  const updated = new Map(update.map(r => [r.id, r]));
  const gone = new Set(remove);
  return [...book.filter(r => !gone.has(r.id)).map(r => updated.get(r.id) || r), ...add];
}

/**
 * The settings write that takes the server's copy to `next`: just the changes, as any edit
 * does — except when the server holds no price book yet. It unions a delta into ITS list,
 * so two changed rates would become the whole price book on every device; the full book goes.
 */
export function priceBookUpgradePatch(plan: PriceBookUpgrade, next: ServiceRate[], serverHasPriceBook: boolean): Record<string, unknown> {
  const changed = [...plan.update, ...plan.add];
  return {
    ...(!serverHasPriceBook ? { priceBook: next } : changed.length ? { priceBook: changed } : {}),
    ...(plan.remove.length ? { removedServiceRateIds: plan.remove } : {}),
    priceBookVersion: PRICE_BOOK_VERSION,
  };
}
