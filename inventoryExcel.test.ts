import { describe, it, expect } from 'vitest';
import { autoMap, buildRows, findHeaderIdx, guessTarget, looksLikePurchaseLog } from './inventoryExcel';
import type { Part } from './types';

// The headers and rows below are copied verbatim from the real "Локсмит_Склад.xlsx" the
// business keeps by hand. If a future tweak to the keyword patterns breaks one of these
// sheets, the import silently mis-files real money and real stock — hence the fixtures.

const KEYS_SHEET = [
  ['СКЛАД КЛЮЧЕЙ (расходники)', '', '', '', '', '', '', '', ''],
  ['«На складе» меняй по мере использования.', '', '', '', '', '', '', '', ''],
  ['Марка', 'Позиция', 'SKU / FCC', 'Тип', 'На складе', 'Мин. остаток', 'Закуп. цена $', 'Поставщик', 'Статус'],
  ['Ford', 'Ford / Lincoln / Mercury H75 Metal Key', '6001', 'заготовка', 10, 25, 0.47, 'My Key Supply', 'нужно купить'],
  ['Toyota', 'TOY48 Short Blade Transponder', '—', 'транспондер', 4, 5, 4.99, 'My Key Supply', 'нужно купить'],
  ['Универсал', 'Батарейка CR2032 (PKCELL)', '—', 'батарейка', 5, 5, 0.6, 'Locksmith Keyless', 'ок'],
];

const TOOLS_SHEET = [
  ['ИНСТРУМЕНТЫ И ОБОРУДОВАНИЕ (активы)', '', '', '', '', '', '', '', '', '', ''],
  ['Зелёным — уже куплено. Остальное — план.', '', '', '', '', '', '', '', '', '', ''],
  ['Дата', 'Категория', 'Наименование', 'Бренд / модель', 'Поставщик', 'Кол-во', 'Цена $', 'Гарантия', 'SKU / Серийник', 'Куплено?', 'Заметки'],
  ['2026-06-27', 'Авто — Lishi', 'Original Lishi авто-набор', 'Lishi Auto Pack 20', 'Locksmith Keyless', 1, 950, '', '', 'Да', 'покрытие Phoenix'],
  ['', 'Авто — байпас', 'Байпас SGW (FCA 2018+)', 'XTOOL 12+8 Gateway', 'Locksmith Keyless', 1, 69, '', '', '', 'план'],
];

const LOG_SHEET = [
  ['ЛОГ ЗАКУПОК (история покупок)', '', '', '', '', '', '', ''],
  ['Заполняй по факту.', '', '', '', '', '', '', ''],
  ['Дата', 'Поставщик', 'Инвойс №', 'Позиция', 'Кол-во', 'Цена ед $', 'Сумма $', 'Категория'],
  ['2026-06-27', 'Locksmith Keyless', '169133', 'Autel XP400 Pro EEPROM/ECU', 1, 335, 335, 'Инструмент'],
  ['2026-06-27', 'Locksmith Keyless', '169133', 'Скидка по заказу #169133', 1, -136.86, -136.86, 'Скидка'],
  ['', '', '', '', '', 'ИТОГО:', 8235.12, ''],
];

const mapOf = (sheet: any[][]) => {
  const hi = findHeaderIdx(sheet);
  return { hi, map: autoMap(sheet[hi]) };
};

describe('guessTarget', () => {
  it('tells consumables from equipment', () => {
    expect(guessTarget('Ключи — склад', KEYS_SHEET[2])).toBe('stock');
    expect(guessTarget('Инструменты', TOOLS_SHEET[2])).toBe('tools');
  });
});

describe('looksLikePurchaseLog', () => {
  // The money log is refused rather than imported: its quantities are everything ever
  // bought, so importing it as stock would add years of purchases to today's shelf.
  it('recognises the purchase log and nothing else', () => {
    expect(looksLikePurchaseLog('Лог закупок', LOG_SHEET[2])).toBe(true);
    expect(looksLikePurchaseLog('Ключи — склад', KEYS_SHEET[2])).toBe(false);
    expect(looksLikePurchaseLog('Инструменты', TOOLS_SHEET[2])).toBe(false);
  });
});

describe('stock sheet', () => {
  it('finds the header below two title rows', () => {
    expect(findHeaderIdx(KEYS_SHEET)).toBe(2);
  });

  it('maps «Марка» to the platform, not to brand, and keeps min-stock out of stock', () => {
    const { map } = mapOf(KEYS_SHEET);
    expect(map.group).toBe(0);        // Марка
    expect(map.brand).toBe(-1);       // no manufacturer column in this sheet
    expect(map.name).toBe(1);         // Позиция
    expect(map.sku).toBe(2);          // SKU / FCC
    expect(map.category).toBe(3);     // Тип
    expect(map.stock).toBe(4);        // На складе — must not be stolen by "Мин. остаток"
    expect(map.reorderPoint).toBe(5);
    expect(map.cost).toBe(6);         // Закуп. цена $
    expect(map.supplier).toBe(7);
  });

  it('reads the rows and treats "—" as no SKU', () => {
    const { hi, map } = mapOf(KEYS_SHEET);
    const rows = buildRows(KEYS_SHEET, hi, map, []);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: 'Ford / Lincoln / Mercury H75 Metal Key', sku: '6001', group: 'Ford',
      category: 'заготовка', stock: 10, reorderPoint: 25, cost: 0.47, supplier: 'My Key Supply',
    });
    expect(rows[1].sku).toBe('');
    expect(rows[2].group).toBe('Универсал');
    // No "Куплено?" column at all means these are things we have.
    expect(rows.every(r => r.owned)).toBe(true);
  });

  it('matches a SKU-less line by name, so a second import updates instead of duplicating', () => {
    const existing: Part[] = [
      { id: 'p1', name: 'TOY48 Short Blade Transponder', sku: '', category: 'транспондер', stock: 4, reorderPoint: 5, price: 0 },
    ];
    const { hi, map } = mapOf(KEYS_SHEET);
    const rows = buildRows(KEYS_SHEET, hi, map, existing);
    expect(rows[1].matchId).toBe('p1');
    expect(rows[1].createNew).toBe(false);
    expect(rows[0].createNew).toBe(true);
  });
});

describe('tools sheet', () => {
  it('maps equipment columns and separates bought from merely planned', () => {
    const { hi, map } = mapOf(TOOLS_SHEET);
    expect(map.date).toBe(0);
    expect(map.category).toBe(1);
    expect(map.name).toBe(2);
    expect(map.brand).toBe(3);
    expect(map.cost).toBe(6);
    expect(map.warranty).toBe(7);
    expect(map.owned).toBe(9);
    expect(map.note).toBe(10);

    const rows = buildRows(TOOLS_SHEET, hi, map, []);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Original Lishi авто-набор', owned: true, cost: 950, date: '2026-06-27' });
    expect(rows[1]).toMatchObject({ name: 'Байпас SGW (FCA 2018+)', owned: false, note: 'план' });
  });
});

describe('totals rows', () => {
  it('drops a trailing ИТОГО line, which has no position and no code', () => {
    const { hi, map } = mapOf(LOG_SHEET);
    const rows = buildRows(LOG_SHEET, hi, map, []);
    expect(rows).toHaveLength(2);
    expect(rows.some(r => /ИТОГО/i.test(r.name))).toBe(false);
  });
});
