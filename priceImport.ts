import { ServiceRate, ServiceCategory, SERVICE_CATEGORIES } from './types';

// Bulk price-list import: turn whatever the owner already has — a text list, a
// spreadsheet, a copy-paste from the company website — into service rates, so nobody
// types 60 prices into the settings form one at a time.
//
// Everything here is pure (no React, no DOM, no network) so the messy real-world formats
// can be unit-tested. The UI only renders the rows and lets the owner fix them.

export interface DraftRate {
  name: string;
  category: ServiceCategory;
  price: number;
  nightPrice?: number;
  type: ServiceRate['type'];
  note?: string;
}

export interface PriceImportRow extends DraftRate {
  key: string;          // stable React key
  include: boolean;
  existingId?: string;  // matched an existing rate → update it instead of adding a twin
  oldPrice?: number;    // its current price, so the preview can show 149 → 169
  similarTo?: string;   // a near-miss name already in the book, so the owner can spot a twin
}

const NBSP = /[\u00a0\u202f]/g;

// A money token: "$149", "149", "1,299.50", "149$". Ranked so an explicit $ wins.
const MONEY_RE = /(\$\s*\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?\s*\$)|(\d[\d,]*(?:\.\d{1,2})?)/g;

// A currency mark anywhere on the line means its numbers are money, years included.
const CURRENCY_HINT = /[$€]|\busd\b|руб|грн/i;

interface MoneyToken { value: number; start: number; end: number; explicit: boolean }

function findMoney(line: string): MoneyToken[] {
  const out: MoneyToken[] = [];
  MONEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONEY_RE.exec(line)) !== null) {
    const raw = m[0];
    const value = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(value) || value <= 0 || value > 100000) continue;
    // "%", "mm", "min" right after a number mean it is not a price.
    if (/^\s*(%|mm|мм|min|мин|шт)/i.test(line.slice(m.index + raw.length))) continue;
    // "Price list 2026", "2018 Camry key 249" — a bare year is a year. An actual price
    // written with a currency mark is never dropped, so only the ambiguous case suffers.
    if (!raw.includes('$') && /^(19|20)\d{2}$/.test(raw) && !CURRENCY_HINT.test(line)) continue;
    out.push({ value, start: m.index, end: m.index + raw.length, explicit: raw.includes('$') });
  }
  // "2018 Camry key $249" has a year AND a price — when any token is written with a $,
  // the bare numbers belong to the name, not to the money.
  const explicit = out.filter(t => t.explicit);
  return explicit.length > 0 ? explicit : out;
}

const isMoneyCell = (s: string) => /^\$?\s*\d[\d,]*(?:\.\d{1,2})?\s*\$?$/.test(s.trim());
const moneyValue = (s: string) => Number(s.replace(/[^\d.]/g, ''));

const norm = (s: string) => s.toLowerCase().replace(NBSP, ' ').replace(/[^a-zа-я0-9]+/gi, ' ').trim();

const CATEGORY_HINTS: { cat: ServiceCategory; re: RegExp }[] = [
  { cat: 'Car Keys', re: /(car key|auto key|key fob|fob|transponder|chip key|ignition|push[- ]to[- ]start|smart key|remote|vin|all keys lost|ключ авто|автоключ|чип|иммобилайзер|брелок)/i },
  { cat: 'Safes', re: /(safe|vault|gun box|сейф)/i },
  { cat: 'Smart Locks', re: /(smart lock|keypad|electronic|wi-?fi|bluetooth|august|encode|yale assure|master key|мастер[- ]?ключ|умный замок)/i },
  { cat: 'Lockout', re: /(lockout|locked out|lock out|unlock|opening|open door|вскрыт|открыт|аварийн)/i },
  { cat: 'Rekey & Install', re: /(rekey|re-key|install|replace|deadbolt|cylinder|repair|mortise|door closer|hardware|перекодир|установк|замена|ремонт|цилиндр)/i },
  { cat: 'Bundles', re: /(bundle|package|combo|plan|special|пакет|комплекс)/i },
];

export function guessCategory(name: string): ServiceCategory {
  for (const { cat, re } of CATEGORY_HINTS) if (re.test(name)) return cat;
  return 'Other';
}

export function guessType(name: string): ServiceRate['type'] {
  if (/(install|mount|replace|установ|монтаж|замена)/i.test(name)) return 'installation';
  if (/(lockout|locked out|service call|trip charge|dispatch|unlock|opening|вскрыт|выезд)/i.test(name)) return 'service_call';
  if (/(maintenance|tune[- ]?up|lubricat|adjust|inspection|audit|обслуживан|профилакт)/i.test(name)) return 'maintenance';
  if (/(hardware|blank|заготовк|фурнитур)/i.test(name)) return 'part';
  return 'labor';
}

// Does a bare line name one of our categories ("CAR KEYS", "Автоключи:")?
function asCategoryHeader(line: string): ServiceCategory | null {
  const n = norm(line.replace(/[:：]+$/, ''));
  if (!n || n.length > 40) return null;
  for (const cat of SERVICE_CATEGORIES) if (norm(cat) === n) return cat;
  const looksLikeHeader = /[:：]\s*$/.test(line) || (line === line.toUpperCase() && /[a-zа-я]/i.test(line));
  if (!looksLikeHeader) return null;
  for (const { cat, re } of CATEGORY_HINTS) if (re.test(line)) return cat;
  return null;
}

function cleanName(raw: string): { name: string; note?: string } {
  let name = raw.replace(NBSP, ' ')
    .replace(/^[\s\-–—•*·>»]+/, '')
    .replace(/[\s\-–—:.·…|,;]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let note: string | undefined;
  // "Car key from $99" / "от 99" — the "from" belongs in the note, not in the name.
  const from = name.match(/[\s(]*\b(from|starting at|starts at|от)\b[\s)]*$/i);
  if (from && from.index != null) {
    name = name.slice(0, from.index).replace(/[\s\-–—:.·…]+$/, '').trim();
    note = 'from';
  }
  return { name: name.slice(0, 80), note };
}

function cleanNote(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const note = raw.replace(NBSP, ' ')
    .replace(/^[\s\-–—:.·…|,;/]+/, '')
    .replace(/[\s\-–—:.·…|,;]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return note ? note.slice(0, 120) : undefined;
}

const NIGHT_RE = /(night|after[- ]?hours|evening|ночь|ночн|нерабоч)/i;

export type LineResult =
  | { kind: 'rate'; rate: DraftRate }
  | { kind: 'category'; category: ServiceCategory }
  | { kind: 'skip' };

// A tab/pipe separated row (spreadsheet paste, CSV, Excel grid): the cells are already
// split for us, so the name is the first text cell and the price the first money cell.
function parseCells(cells: string[], fallback: ServiceCategory | null): LineResult {
  const text = cells.filter(c => !isMoneyCell(c));
  const money = cells.filter(isMoneyCell).map(moneyValue).filter(v => v > 0 && v <= 100000);
  if (money.length === 0 || text.length === 0) {
    const header = cells.length === 1 ? asCategoryHeader(cells[0]) : null;
    return header ? { kind: 'category', category: header } : { kind: 'skip' };
  }
  const { name, note: fromNote } = cleanName(text[0]);
  if (!name) return { kind: 'skip' };

  let category: ServiceCategory | null = null;
  const extras: string[] = [];
  for (const cell of text.slice(1)) {
    const asCat = SERVICE_CATEGORIES.find(c => norm(c) === norm(cell));
    if (!category && asCat) { category = asCat; continue; }
    extras.push(cell.trim());
  }
  const price = money[0];
  // A second, higher number in a price row is the after-hours rate in every price list
  // we have seen; a lower one is a cost/discount column and is ignored.
  const nightPrice = money[1] != null && money[1] > price ? money[1] : undefined;

  return {
    kind: 'rate',
    rate: {
      name,
      category: category || fallback || guessCategory(name),
      price,
      nightPrice,
      type: guessType(name),
      note: cleanNote([fromNote, ...extras].filter(Boolean).join(' · ')),
    },
  };
}

export function parseLine(rawLine: string, fallback: ServiceCategory | null = null): LineResult {
  const line = rawLine.replace(NBSP, ' ').replace(/\r/g, '').trim();
  if (!line || /^[-=_*~.\s]{2,}$/.test(line)) return { kind: 'skip' };

  if (/\t|\|/.test(line)) {
    const cells = line.split(/\t|\|/).map(c => c.trim()).filter(Boolean);
    if (cells.length > 1) return parseCells(cells, fallback);
  }

  // Strip bullets and list numbering ("1. ", "2) ") so the number isn't read as a price.
  const body = line.replace(/^[\s\-–—•*·>»]+/, '').replace(/^\d{1,2}[.)]\s+/, '');
  const money = findMoney(body);
  if (money.length === 0) {
    const header = asCategoryHeader(body);
    return header ? { kind: 'category', category: header } : { kind: 'skip' };
  }

  const first = money[0];
  const head = cleanName(body.slice(0, first.start));
  let name = head.name;
  let fromNote = head.note;
  let tail = body.slice(money[money.length - 1].end);
  // "$149 — lock rekey": the price leads and the name follows.
  if (!name) {
    const flipped = cleanName(tail);
    name = flipped.name;
    fromNote = fromNote || flipped.note;
    tail = '';
  }
  if (!name) return { kind: 'skip' };

  const second = money[1];
  const between = second ? body.slice(first.end, second.start) : '';
  const nightPrice = second && second.value > first.value && (NIGHT_RE.test(body) || /^\s*[/\\]\s*\$?\s*$/.test(between))
    ? second.value
    : undefined;
  // "Rekey $149-$199" — a range, so the low number is the price and the span is a note.
  const range = second && !nightPrice && second.value > first.value && /^\s*[-–—]\s*\$?\s*$/.test(between)
    ? `$${first.value}–$${second.value}`
    : undefined;

  return {
    kind: 'rate',
    rate: {
      name,
      category: fallback || guessCategory(name),
      price: first.value,
      nightPrice,
      type: guessType(name),
      note: cleanNote([fromNote, range, tail].filter(Boolean).join(' · ')),
    },
  };
}

export function parsePriceList(text: string): DraftRate[] {
  const out: DraftRate[] = [];
  let current: ServiceCategory | null = null;
  for (const line of (text || '').split(/\r?\n/)) {
    const res = parseLine(line, current);
    if (res.kind === 'category') current = res.category;
    else if (res.kind === 'rate') out.push(res.rate);
  }
  return out;
}

// A parsed spreadsheet (SheetJS grid) becomes tab-separated lines and goes through the
// same parser — one code path to keep correct.
export function gridToText(rows: unknown[][]): string {
  return (rows || [])
    .map(row => (row || []).map(cell => (cell == null ? '' : String(cell).trim())).join('\t'))
    .filter(line => line.replace(/\t/g, '').trim().length > 0)
    .join('\n');
}

export function buildImportRows(drafts: DraftRate[], existing: ServiceRate[]): PriceImportRow[] {
  const byName = new Map(existing.map(r => [norm(r.name), r]));
  const seen = new Set<string>();
  const rows: PriceImportRow[] = [];
  drafts.forEach((d, i) => {
    const key = norm(d.name);
    if (!key || seen.has(key)) return; // the same service listed twice — the first wins
    seen.add(key);
    const match = byName.get(key);
    // "Lock rekey" against our "Lock rekey (1st door)" is almost certainly the same
    // service, but merging on a guess would silently rename the owner's rate. Flag it
    // in the preview instead and let them decide.
    const similar = !match && key.length >= 6
      ? existing.find(r => {
          const other = norm(r.name);
          return other.length >= 6 && (other.startsWith(key) || key.startsWith(other));
        })
      : undefined;
    rows.push({
      ...d,
      // Re-pricing an existing service keeps the category and line type the owner chose.
      category: match ? match.category : d.category,
      type: match ? match.type : d.type,
      key: `${key}-${i}`,
      // A rate already at this price has nothing to import — leave it off by default so
      // "Импортировать 40" means forty real changes.
      include: !(match && match.price === d.price && !d.nightPrice),
      existingId: match?.id,
      oldPrice: match?.price,
      similarTo: similar?.name,
    });
  });
  return rows;
}

export interface ImportPlan {
  add: Omit<ServiceRate, 'id'>[];
  update: ServiceRate[];
}

export function buildPlan(rows: PriceImportRow[], existing: ServiceRate[]): ImportPlan {
  const plan: ImportPlan = { add: [], update: [] };
  for (const r of rows) {
    if (!r.include || !r.name.trim() || !(r.price >= 0)) continue;
    const base = {
      name: r.name.trim(),
      category: r.category,
      price: r.price,
      type: r.type,
      nightPrice: r.nightPrice,
      note: r.note,
    };
    const current = r.existingId ? existing.find(e => e.id === r.existingId) : undefined;
    if (current) plan.update.push({ ...current, ...base });
    else plan.add.push(base);
  }
  return plan;
}
