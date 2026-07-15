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
  brand: number;
  stock: number;
  reorderPoint: number;
  cost: number;
  price: number;
  supplier: number;
  barcode: number;
}

export type MapField = keyof ColumnMap;

export const MAP_FIELDS: { key: MapField; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Название', required: true },
  { key: 'sku', label: 'Артикул / SKU' },
  { key: 'category', label: 'Категория (Тип)' },
  { key: 'brand', label: 'Бренд / Марка' },
  { key: 'stock', label: 'Количество' },
  { key: 'reorderPoint', label: 'Мин. остаток' },
  { key: 'cost', label: 'Закуп. цена' },
  { key: 'price', label: 'Цена продажи' },
  { key: 'supplier', label: 'Поставщик' },
  { key: 'barcode', label: 'Штрихкод' },
];

// RU + EN header keywords per field. Order matters: cost is checked before price so a
// generic "цена" doesn't steal the purchase-price column.
const KEYWORDS: Record<MapField, RegExp> = {
  name:        /(позиц|наимен|назв|товар|деталь|модель|item|name|descr|product)/i,
  sku:         /(sku|fcc|артикул|код|part\s*no|part\s*#|mpn|серийн|catalog)/i,
  category:    /(^тип|катег|group|группа|type|categ|раздел)/i,
  brand:       /(марк|бренд|brand|производ|manufact|make)/i,
  stock:       /(на\s*склад|кол-?во|количеств|остат|нали|qty|quantity|stock|in\s*stock|on\s*hand)/i,
  reorderPoint:/(мин|reorder|точк|min|порог|threshold)/i,
  cost:        /(закуп|себест|cost|purchase|цена\s*ед|цена\s*\$|unit\s*cost|buy)/i,
  price:       /(продаж|розниц|sell|retail|list\s*price|msrp)/i,
  supplier:    /(поставщ|supplier|vendor|продавец)/i,
  barcode:     /(штрих|upc|ean|barcode|gtin)/i,
};

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
    name: -1, sku: -1, category: -1, brand: -1, stock: -1,
    reorderPoint: -1, cost: -1, price: -1, supplier: -1, barcode: -1,
  };
  const used = new Set<number>();
  // Deterministic order — cost before price (see KEYWORDS note), stock before reorder.
  const order: MapField[] = ['sku', 'barcode', 'category', 'brand', 'reorderPoint', 'stock', 'cost', 'price', 'supplier', 'name'];
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
  brand: string;
  stock: number;
  reorderPoint: number;
  cost: number;
  price: number;
  supplier: string;
  barcode: string;
  matchId?: string;   // existing part id when SKU/barcode lines up
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

// Turn the mapped data rows into import rows, matching each against existing parts by
// SKU first, then barcode. Rows with no name AND no sku are dropped as blank/spacers.
export function buildRows(rows: Grid, headerIdx: number, map: ColumnMap, existing: Part[]): ImportRow[] {
  const bySku = new Map<string, Part>();
  const byUpc = new Map<string, Part>();
  for (const p of existing) {
    if (p.sku) bySku.set(norm(p.sku), p);
    if (p.upc) byUpc.set(norm(p.upc), p);
  }
  const pick = (r: Grid[number], col: number) => (col >= 0 ? cell(r[col]) : '');
  const out: ImportRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = pick(r, map.name);
    const sku = pick(r, map.sku);
    const barcode = pick(r, map.barcode);
    if (!name && !sku) continue; // blank / spacer row
    const match = (sku && bySku.get(norm(sku))) || (barcode && byUpc.get(norm(barcode))) || undefined;
    out.push({
      name: name || sku,
      sku,
      category: pick(r, map.category),
      brand: pick(r, map.brand),
      stock: map.stock >= 0 ? Math.max(0, Math.round(num(r[map.stock]))) : 0,
      reorderPoint: map.reorderPoint >= 0 ? Math.max(0, Math.round(num(r[map.reorderPoint]))) : 0,
      cost: map.cost >= 0 ? num(r[map.cost]) : 0,
      price: map.price >= 0 ? num(r[map.price]) : 0,
      supplier: pick(r, map.supplier),
      barcode,
      matchId: match?.id,
      createNew: !match,
      include: true,
    });
  }
  return out;
}
