import type { Part } from './types';

// Pure Excel-import logic (no React, no DOM) so it can be unit-tested against a real
// spreadsheet. SheetJS is imported dynamically by the UI to keep it out of the main
// bundle; here we only take the already-parsed rows.

export type Grid = any[][];

export interface SheetData {
  name: string;
  rows: Grid;        // full sheet as a 2D array (header:1)
}

// Which spreadsheet column index feeds each Part field. -1 = not mapped.
export interface ColumnMap {
  name: number;
  sku: number;
  category: number;
  group: number;
  brand: number;
  stock: number;
  reorderPoint: number;
  cost: number;
  price: number;
  supplier: number;
  barcode: number;
  date: number;      // purchase date (tools sheet / purchase log)
  warranty: number;  // tools only
  owned: number;     // tools only — 'Куплено?' Да/план
  note: number;
}

export type MapField = keyof ColumnMap;

// What the sheet being imported actually is. Each target reads a different set of columns
// and has different consequences, so the user picks it explicitly.
export type ImportTarget = 'stock' | 'tools' | 'expenses';

const COMMON_FIELDS: { key: MapField; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Название', required: true },
  { key: 'sku', label: 'Артикул / SKU' },
  { key: 'category', label: 'Категория (Тип)' },
  { key: 'group', label: 'Марка / Платформа' },
  { key: 'brand', label: 'Бренд / Производитель' },
  { key: 'stock', label: 'Количество' },
  { key: 'cost', label: 'Закуп. цена' },
  { key: 'supplier', label: 'Поставщик' },
];

export const MAP_FIELDS_BY_TARGET: Record<ImportTarget, { key: MapField; label: string; required?: boolean }[]> = {
  stock: [
    ...COMMON_FIELDS,
    { key: 'reorderPoint', label: 'Мин. остаток' },
    { key: 'price', label: 'Цена продажи' },
    { key: 'barcode', label: 'Штрихкод' },
  ],
  tools: [
    ...COMMON_FIELDS,
    { key: 'owned', label: 'Куплено? (Да/план)' },
    { key: 'warranty', label: 'Гарантия' },
    { key: 'date', label: 'Дата покупки' },
    { key: 'note', label: 'Заметки' },
  ],
  expenses: [
    { key: 'name', label: 'Позиция', required: true },
    { key: 'date', label: 'Дата' },
    { key: 'supplier', label: 'Поставщик' },
    { key: 'sku', label: 'Инвойс №' },
    { key: 'category', label: 'Категория' },
    { key: 'stock', label: 'Кол-во' },
    { key: 'cost', label: 'Цена за единицу' },
  ],
};

/** Legacy flat list — kept so any older caller still compiles. */
export const MAP_FIELDS = MAP_FIELDS_BY_TARGET.stock;

// RU + EN header keywords per field. Order matters: cost is checked before price so a
// generic "цена" doesn't steal the purchase-price column, and group before brand because
// a locksmith sheet's "Марка" column means the vehicle platform (Ford), not the maker.
const KEYWORDS: Record<MapField, RegExp> = {
  name:        /(позиц|наимен|назв|товар|деталь|item|name|descr|product)/i,
  sku:         /(sku|fcc|артикул|инвойс|invoice|код|part\s*no|part\s*#|mpn|серийн|catalog)/i,
  category:    /(^тип|катег|type|categ|раздел)/i,
  group:       /(^марка|платформ|^группа|group)/i,
  brand:       /(бренд|brand|производ|manufact|make|модель)/i,
  stock:       /(на\s*склад|кол-?во|количеств|остат|нали|qty|quantity|stock|in\s*stock|on\s*hand)/i,
  reorderPoint:/(мин|reorder|точк|min|порог|threshold)/i,
  cost:        /(закуп|себест|cost|purchase|цена\s*ед|цена\s*\$|unit\s*cost|buy|^цена)/i,
  price:       /(продаж|розниц|sell|retail|list\s*price|msrp)/i,
  supplier:    /(поставщ|supplier|vendor|продавец)/i,
  barcode:     /(штрих|upc|ean|barcode|gtin)/i,
  date:        /(дата|date|куплено\s*когда)/i,
  warranty:    /(гарант|warrant|подписк)/i,
  owned:       /(куплено|owned|в\s*наличии\?|факт)/i,
  note:        /(заметк|коммент|примеч|note|comment)/i,
};

// Which target a sheet looks like, from its name and its headers. A sheet of equipment and
// a sheet of consumables map to completely different things, and getting it wrong is how a
// $950 Lishi set ends up on a client's invoice.
export function guessTarget(sheetName: string, header: Grid[number]): ImportTarget {
  const labels = (header || []).map(c => cell(c)).join(' | ');
  const hay = `${sheetName} | ${labels}`;
  if (/инвойс|invoice|лог\s*закуп|purchase\s*log|сумма/i.test(hay)) return 'expenses';
  if (/инструмент|оборудован|tool|equip|гарант|куплено|серийн/i.test(hay)) return 'tools';
  return 'stock';
}

const cell = (v: any) => (v === null || v === undefined ? '' : String(v)).trim();

// The header row is often not row 0 (title + notes come first). Pick the first row
// within the first 20 that has >=3 cells matching known column keywords.
export function findHeaderIdx(rows: Grid): number {
  const limit = Math.min(rows.length, 20);
  let best = -1, bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const r = rows[i] || [];
    let score = 0;
    for (const c of r) {
      const s = cell(c);
      if (!s) continue;
      if (Object.values(KEYWORDS).some(re => re.test(s))) score++;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 3 ? best : (rows.length ? 0 : -1);
}

// Guess the column for each field from the header labels. First keyword match wins;
// a column already claimed by an earlier field isn't reused.
export function autoMap(header: Grid[number]): ColumnMap {
  const map: ColumnMap = {
    name: -1, sku: -1, category: -1, group: -1, brand: -1, stock: -1,
    reorderPoint: -1, cost: -1, price: -1, supplier: -1, barcode: -1,
    date: -1, warranty: -1, owned: -1, note: -1,
  };
  const used = new Set<number>();
  // Deterministic order — cost before price (see KEYWORDS note), reorder before stock so
  // "Мин. остаток" doesn't get eaten by the generic "остаток" in the stock pattern.
  const order: MapField[] = [
    'sku', 'barcode', 'group', 'category', 'brand', 'reorderPoint', 'stock',
    'cost', 'price', 'supplier', 'warranty', 'owned', 'date', 'note', 'name',
  ];
  for (const field of order) {
    for (let col = 0; col < header.length; col++) {
      if (used.has(col)) continue;
      if (KEYWORDS[field].test(cell(header[col]))) {
        map[field] = col;
        used.add(col);
        break;
      }
    }
  }
  return map;
}

export interface ImportRow {
  name: string;
  sku: string;
  category: string;
  group: string;
  brand: string;
  stock: number;
  reorderPoint: number;
  cost: number;
  price: number;
  supplier: string;
  barcode: string;
  date: string;
  warranty: string;
  note: string;
  owned: boolean;     // tools: false = план закупки, nothing in hand yet
  matchId?: string;   // existing part id when SKU/barcode/name lines up
  createNew: boolean;
  include: boolean;   // user can uncheck a row before import
}

const num = (v: any): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');

// A hand-kept sheet writes "—" where there is no value. Treated as empty, or every such
// row matches every other one and the whole import collapses into a single part.
const DASHES = new Set(['-', '—', '–', '?', 'n/a', 'нет']);
const clean = (s: string) => (DASHES.has(s.trim().toLowerCase()) ? '' : s.trim());

// 'Да' / 'yes' / 'куплено' = in hand. Anything else (blank, 'план') is only a plan.
const isYes = (s: string) => /^(да|yes|y|\+|куплено|true|1)$/i.test(s.trim());

// Turn the mapped data rows into import rows, matching each against existing parts by SKU,
// then barcode, then name. The name fallback matters: 13 of the 56 lines in a real
// locksmith sheet carry no SKU at all, and without it every re-import duplicates them.
// Rows with no name AND no sku are dropped as blank/spacers (that also drops the ИТОГО row).
export function buildRows(rows: Grid, headerIdx: number, map: ColumnMap, existing: Part[]): ImportRow[] {
  const bySku = new Map<string, Part>();
  const byUpc = new Map<string, Part>();
  const byName = new Map<string, Part>();
  for (const p of existing) {
    if (p.sku) bySku.set(norm(p.sku), p);
    if (p.upc) byUpc.set(norm(p.upc), p);
    if (p.name) byName.set(norm(p.name), p);
  }
  const pick = (r: Grid[number], col: number) => (col >= 0 ? clean(cell(r[col])) : '');
  const out: ImportRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = pick(r, map.name);
    const sku = pick(r, map.sku);
    const barcode = pick(r, map.barcode);
    if (!name && !sku) continue; // blank / spacer / totals row
    const match = (sku && bySku.get(norm(sku)))
      || (barcode && byUpc.get(norm(barcode)))
      || (name && byName.get(norm(name)))
      || undefined;
    out.push({
      name: name || sku,
      sku,
      category: pick(r, map.category),
      group: pick(r, map.group),
      brand: pick(r, map.brand),
      stock: map.stock >= 0 ? Math.max(0, Math.round(num(r[map.stock]))) : 0,
      reorderPoint: map.reorderPoint >= 0 ? Math.max(0, Math.round(num(r[map.reorderPoint]))) : 0,
      cost: map.cost >= 0 ? num(r[map.cost]) : 0,
      price: map.price >= 0 ? num(r[map.price]) : 0,
      supplier: pick(r, map.supplier),
      barcode,
      date: pick(r, map.date),
      warranty: pick(r, map.warranty),
      note: pick(r, map.note),
      // No "Куплено?" column at all means the sheet lists things we have.
      owned: map.owned >= 0 ? isYes(cell(r[map.owned])) : true,
      matchId: match?.id,
      createNew: !match,
      include: true,
    });
  }
  return out;
}
