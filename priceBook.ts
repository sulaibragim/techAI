import { ServiceRate } from './types';

// Seeded from trustkeyaz.com (approved by Sultan 2026-06-12). Editable in Settings → Service Rates.
export const PRICE_BOOK_SEED: ServiceRate[] = [
  // Lockout
  { id: 'r-car-lockout',   name: 'Car lockout',          category: 'Lockout',         price: 139, nightPrice: 199, type: 'service_call' },
  { id: 'r-home-lockout',  name: 'Home lockout',         category: 'Lockout',         price: 159, nightPrice: 219, type: 'service_call' },
  { id: 'r-comm-lockout',  name: 'Commercial lockout',   category: 'Lockout',         price: 199, nightPrice: 269, type: 'service_call' },
  // Rekey & Install
  { id: 'r-rekey',         name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor',        note: '+$49 each additional door (+$60 night)' },
  { id: 'r-lock-install',  name: 'Lock installation',     category: 'Rekey & Install', price: 149, type: 'installation', note: 'labor only; from $249 all-in with Schlage' },
  { id: 'r-lock-repair',   name: 'Lock repair',           category: 'Rekey & Install', price: 89,  type: 'labor',        note: 'from' },
  // Smart Locks
  { id: 'r-smart-install', name: 'Smart lock installation', category: 'Smart Locks',   price: 189, type: 'installation', note: 'labor; from $369 all-in (Schlage Encode)' },
  { id: 'r-master-key',    name: 'Master key system',     category: 'Smart Locks',     price: 299, type: 'installation', note: '$99 per cylinder' },
  // Car Keys
  { id: 'r-car-key',       name: 'Car key (standard)',    category: 'Car Keys',        price: 99,  type: 'labor',        note: 'from' },
  { id: 'r-transponder',   name: 'Transponder chip key',  category: 'Car Keys',        price: 149, type: 'labor',        note: 'all-in, from' },
  { id: 'r-remote-fob',    name: 'Remote / key fob',      category: 'Car Keys',        price: 199, type: 'labor',        note: 'all-in, from' },
  { id: 'r-smart-key',     name: 'Smart key (push-to-start)', category: 'Car Keys',    price: 279, type: 'labor',        note: 'all-in, from' },
  { id: 'r-fob-program',   name: 'Key fob programming (OEM)', category: 'Car Keys',    price: 99,  nightPrice: 159, type: 'labor', note: 'customer-supplied' },
  { id: 'r-all-keys-lost', name: 'All keys lost',         category: 'Car Keys',        price: 349, type: 'labor',        note: 'from; +$59 service call (credited)' },
  // Safes
  { id: 'r-safe-open',     name: 'Safe opening',          category: 'Safes',           price: 179, nightPrice: 239, type: 'service_call', note: 'from' },
  // Bundles
  { id: 'r-movein',        name: 'Move-in security bundle', category: 'Bundles',       price: 247, type: 'service_call', note: '3-door rekey + audit + 90-day priority' },
];
