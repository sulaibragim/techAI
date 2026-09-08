import { describe, it, expect } from 'vitest';
import { parsePriceList, buildImportRows, buildPlan, gridToText, guessCategory, guessType } from './priceImport';
import type { ServiceRate } from './types';

const names = (text: string) => parsePriceList(text).map(r => `${r.name}=${r.price}`);

describe('parsePriceList', () => {
  it('reads the plain "name price" shapes an owner actually types', () => {
    expect(names([
      'Car lockout - 139',
      'Home lockout $159',
      'Commercial lockout — $199',
      'Safe opening: 179',
      'Lock rekey ... 149',
      'Smart lock installation   189',
    ].join('\n'))).toEqual([
      'Car lockout=139',
      'Home lockout=159',
      'Commercial lockout=199',
      'Safe opening=179',
      'Lock rekey=149',
      'Smart lock installation=189',
    ]);
  });

  it('reads a spreadsheet paste (tab separated) with a category column', () => {
    const rows = parsePriceList([
      'Service\tCategory\tPrice',
      'Car lockout\tLockout\t139',
      'Transponder chip key\tCar Keys\t149',
    ].join('\n'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Car lockout', category: 'Lockout', price: 139 });
    expect(rows[1]).toMatchObject({ name: 'Transponder chip key', category: 'Car Keys', price: 149 });
  });

  it('takes a second, higher number in a grid row as the night price', () => {
    const [rate] = parsePriceList('Car lockout\t139\t199');
    expect(rate).toMatchObject({ price: 139, nightPrice: 199 });
  });

  it('ignores a lower second number (cost/discount column)', () => {
    const [rate] = parsePriceList('Car lockout\t139\t60');
    expect(rate.price).toBe(139);
    expect(rate.nightPrice).toBeUndefined();
  });

  it('picks up the night price when the line says so', () => {
    const [rate] = parsePriceList('Home lockout $159, night $219');
    expect(rate).toMatchObject({ name: 'Home lockout', price: 159, nightPrice: 219 });
  });

  it('keeps a price range as a note and bills the low end', () => {
    const [rate] = parsePriceList('Lock repair $89-$149');
    expect(rate.price).toBe(89);
    expect(rate.note).toContain('$89');
  });

  it('moves "from" out of the name', () => {
    const [rate] = parsePriceList('Car key from $99');
    expect(rate.name).toBe('Car key');
    expect(rate.note).toBe('from');
  });

  it('carries the trailing text into the note', () => {
    const [rate] = parsePriceList('Lock rekey $149 per additional door');
    expect(rate.name).toBe('Lock rekey');
    expect(rate.note).toBe('per additional door');
  });

  it('groups rates under a category heading', () => {
    const rows = parsePriceList([
      'CAR KEYS',
      'Transponder key 149',
      'Key fob 199',
      'Safes:',
      'Safe opening 179',
    ].join('\n'));
    expect(rows.map(r => r.category)).toEqual(['Car Keys', 'Car Keys', 'Safes']);
    expect(rows).toHaveLength(3);
  });

  it('does not read a year in the name as the price', () => {
    const [rate] = parsePriceList('2018 Camry smart key $279');
    expect(rate).toMatchObject({ name: '2018 Camry smart key', price: 279 });
  });

  it('does not read a bare year as the price', () => {
    const [rate] = parsePriceList('2018 Camry smart key 279');
    expect(rate).toMatchObject({ name: '2018 Camry smart key', price: 279 });
  });

  it('handles a price-first line', () => {
    const [rate] = parsePriceList('$249 — deadbolt installation');
    expect(rate).toMatchObject({ name: 'deadbolt installation', price: 249 });
  });

  it('strips bullets and list numbering', () => {
    expect(names('• Car lockout $139\n2) Home lockout $159')).toEqual(['Car lockout=139', 'Home lockout=159']);
  });

  it('reads a Russian list', () => {
    const rows = parsePriceList([
      'Вскрытие авто — 139',
      'Изготовление чип-ключа 149',
      'Замена цилиндра 89',
    ].join('\n'));
    expect(rows.map(r => r.price)).toEqual([139, 149, 89]);
    expect(rows[0].category).toBe('Lockout');
    expect(rows[1].category).toBe('Car Keys');
  });

  it('skips headers, separators and lines without a price', () => {
    const rows = parsePriceList([
      'Price list 2026',
      '--------------',
      'Call us for a quote',
      '',
      'Car lockout $139',
    ].join('\n'));
    expect(rows).toHaveLength(1);
  });

  it('ignores numbers that are measurements, not money', () => {
    const rows = parsePriceList('Cylinder 70 mm');
    expect(rows).toHaveLength(0);
  });
});

describe('guessing', () => {
  it('routes services into categories', () => {
    expect(guessCategory('Car lockout')).toBe('Lockout');
    expect(guessCategory('Transponder chip key')).toBe('Car Keys');
    expect(guessCategory('Safe opening')).toBe('Safes');
    expect(guessCategory('Smart lock installation')).toBe('Smart Locks');
    expect(guessCategory('Lock rekey')).toBe('Rekey & Install');
    expect(guessCategory('Consultation')).toBe('Other');
  });

  it('maps a service to the invoice line type it bills as', () => {
    expect(guessType('Deadbolt installation')).toBe('installation');
    expect(guessType('Car lockout')).toBe('service_call');
    expect(guessType('Annual maintenance')).toBe('maintenance');
    expect(guessType('Key duplication')).toBe('labor');
  });
});

describe('gridToText', () => {
  it('flattens a spreadsheet grid and drops empty rows', () => {
    expect(gridToText([['Car lockout', 139], [], ['', ''], ['Home lockout', 159]]))
      .toBe('Car lockout\t139\nHome lockout\t159');
  });
});

const existing: ServiceRate[] = [
  { id: 'r-car-lockout', name: 'Car lockout', category: 'Lockout', price: 139, type: 'service_call' },
];

describe('buildImportRows', () => {
  it('matches an existing service by name so a re-price is an update, not a twin', () => {
    const rows = buildImportRows(parsePriceList('CAR LOCKOUT $169\nSafe opening $179'), existing);
    expect(rows[0]).toMatchObject({ existingId: 'r-car-lockout', oldPrice: 139, price: 169 });
    expect(rows[1].existingId).toBeUndefined();
  });

  it('keeps the first of a duplicated service', () => {
    const rows = buildImportRows(parsePriceList('Car lockout $139\nCar lockout $149'), []);
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(139);
  });

  it('leaves a rate that is already at that price switched off', () => {
    const rows = buildImportRows(parsePriceList('Car lockout $139\nSafe opening $179'), existing);
    expect(rows[0].include).toBe(false);
    expect(rows[1].include).toBe(true);
  });

  it('switches a rate back on when only its night price changed', () => {
    const rows = buildImportRows(parsePriceList('Car lockout $139, night $199'), existing);
    expect(rows[0]).toMatchObject({ include: true, price: 139, nightPrice: 199 });
    expect(rows[0].oldNightPrice).toBeUndefined();
  });

  it('flags a near-miss name instead of silently merging it', () => {
    const book: ServiceRate[] = [{ id: 'r-rekey', name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor' }];
    const [row] = buildImportRows(parsePriceList('Lock rekey $169'), book);
    expect(row.existingId).toBeUndefined();
    expect(row.similarTo).toBe('Lock rekey (1st door)');
  });

  it('keeps the category the owner already chose for an existing rate', () => {
    const rows = buildImportRows(parsePriceList('Other:\nCar lockout $169'), existing);
    expect(rows[0].category).toBe('Lockout');
  });
});

describe('buildPlan', () => {
  it('splits the preview into adds and updates, honouring the checkboxes', () => {
    const rows = buildImportRows(parsePriceList('Car lockout $169\nSafe opening $179\nKey fob $199'), existing);
    rows[2].include = false;
    const plan = buildPlan(rows, existing);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]).toMatchObject({ id: 'r-car-lockout', price: 169 });
    expect(plan.add.map(a => a.name)).toEqual(['Safe opening']);
  });
});
