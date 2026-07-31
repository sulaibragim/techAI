// Master-keying maths for residential systems (2 levels: one master + change keys).
//
// Every number here is a DEPTH NUMBER, not inches. Depth numbers are what the key
// gauge reads and what the pin kit compartments are labelled with. Inches only
// matter for display, via preset.increment.
//
// Core rule, identical in the official Kwikset and Schlage service manuals:
//   bottom pin  = the SHALLOWER of the two cuts in that chamber
//   master pin  = the difference between the two cuts (0 → no wafer)
// Both keys then break the pin stack at the shear line, just at different heights.

export type MasterKeyBrand = 'kwikset-kw1' | 'schlage-sc1' | 'weiser';

export interface BrandPreset {
  id: MasterKeyBrand;
  name: string;
  keyway: string;
  chamberOptions: number[];
  defaultChambers: number;
  minDepth: number;
  maxDepth: number;
  /** Inches added to the cut per depth step — differs per brand, never assume. */
  increment: number;
  /** Maximum Adjacent Cut Spec: biggest allowed jump between neighbouring cuts. */
  macs: number;
  bottomPinRange: [number, number];
  masterPinRange: [number, number];
  note?: string;
}

// Figures verified against manufacturer service literature and Thomas, "Key Bitting
// Specifications" (2025). Depth counts and MACS differ per brand — do not merge.
export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'kwikset-kw1',
    name: 'Kwikset',
    keyway: 'KW1',
    chamberOptions: [5, 6],
    defaultChambers: 5,
    minDepth: 1,
    maxDepth: 7,
    increment: 0.023,
    macs: 4,
    bottomPinRange: [1, 6],
    masterPinRange: [1, 6],
    note: 'Depth 7 exists only as the deeper cut — no factory #7 bottom pin is made.',
  },
  {
    id: 'schlage-sc1',
    name: 'Schlage',
    keyway: 'SC1 Classic',
    chamberOptions: [6],
    defaultChambers: 6,
    minDepth: 0,
    maxDepth: 9,
    increment: 0.015,
    macs: 7,
    bottomPinRange: [0, 9],
    masterPinRange: [2, 9],
    note: 'No #1 master pin is made — a 1-step difference cannot be pinned.',
  },
  {
    id: 'weiser',
    name: 'Weiser',
    keyway: 'WR5',
    chamberOptions: [5, 6],
    defaultChambers: 5,
    minDepth: 0,
    maxDepth: 9,
    increment: 0.018,
    macs: 6,
    bottomPinRange: [0, 9],
    masterPinRange: [2, 9],
    note: 'No #1 master pin is made — a 1-step difference cannot be pinned.',
  },
];

export const presetFor = (id: MasterKeyBrand): BrandPreset =>
  BRAND_PRESETS.find(p => p.id === id) || BRAND_PRESETS[0];

/** deep/shallow = every differing cut goes the same way, so the plug can be loaded
 *  with a key inserted and the shear line checked by eye. random = it cannot. */
export type MasterType = 'deep' | 'shallow' | 'random' | 'identical';

export type WarningLevel = 'error' | 'warn' | 'info';

export interface PinningWarning {
  level: WarningLevel;
  title: string;
  detail: string;
}

export interface PinningPosition {
  position: number;
  master: number;
  change: number;
  bottomPin: number;
  /** 0 means no wafer in this chamber (a "constant cut"). */
  masterWafer: number;
  masterIsDeeper: boolean;
}

export interface PinningResult {
  positions: PinningPosition[];
  masterType: MasterType;
  waferCount: number;
  /** Every bitting that physically turns this plug — 2^waferCount of them. */
  workingKeys: number;
  /** Working keys nobody was ever meant to cut. */
  phantomKeys: number;
  warnings: PinningWarning[];
}

const isFilled = (n: number | null): n is number => n !== null && Number.isFinite(n);

/** Adjacent-cut violations on a single key. A key that breaks MACS cannot be cut. */
export const macsViolations = (
  bitting: (number | null)[],
  preset: BrandPreset,
): { a: number; b: number; diff: number }[] => {
  const out: { a: number; b: number; diff: number }[] = [];
  for (let i = 0; i < bitting.length - 1; i++) {
    const x = bitting[i], y = bitting[i + 1];
    if (!isFilled(x) || !isFilled(y)) continue;
    const diff = Math.abs(x - y);
    if (diff > preset.macs) out.push({ a: i + 1, b: i + 2, diff });
  }
  return out;
};

export const classifyMaster = (master: (number | null)[], change: (number | null)[]): MasterType => {
  let deeper = 0, shallower = 0, same = 0;
  for (let i = 0; i < master.length; i++) {
    const m = master[i], c = change[i];
    if (!isFilled(m) || !isFilled(c)) continue;
    if (m > c) deeper++;
    else if (m < c) shallower++;
    else same++;
  }
  if (deeper === 0 && shallower === 0) return same > 0 ? 'identical' : 'random';
  if (deeper > 0 && shallower > 0) return 'random';
  return deeper > 0 ? 'deep' : 'shallow';
};

export const calcPinning = (
  master: (number | null)[],
  change: (number | null)[],
  preset: BrandPreset,
): PinningResult => {
  const positions: PinningPosition[] = [];

  for (let i = 0; i < master.length; i++) {
    const m = master[i], c = change[i];
    if (!isFilled(m) || !isFilled(c)) continue;
    positions.push({
      position: i + 1,
      master: m,
      change: c,
      bottomPin: Math.min(m, c),
      masterWafer: Math.abs(m - c),
      masterIsDeeper: m > c,
    });
  }

  const complete = positions.length === master.length;
  const waferCount = positions.filter(p => p.masterWafer > 0).length;
  const masterType = classifyMaster(master, change);
  const workingKeys = complete ? Math.pow(2, waferCount) : 0;
  const legitKeys = masterType === 'identical' ? 1 : 2;
  const phantomKeys = workingKeys > 0 ? Math.max(0, workingKeys - legitKeys) : 0;

  const warnings: PinningWarning[] = [];

  if (!complete) {
    warnings.push({
      level: 'info',
      title: 'Заполни обе нарезки',
      detail: `Нужно ${master.length} ${master.length === 6 ? 'цифр' : 'цифр'} в каждом ключе — тогда посчитаю пиновку целиком.`,
    });
  }

  if (complete && masterType === 'identical') {
    warnings.push({
      level: 'warn',
      title: 'Ключи одинаковые',
      detail: 'Это не мастер-система, а keyed alike — обе двери на один ключ. Шайбы не нужны вообще.',
    });
  }

  if (complete && masterType === 'random') {
    warnings.push({
      level: 'warn',
      title: 'Мастер «случайный»',
      detail: 'Где-то мастер глубже ключа двери, где-то мельче. Плаг собирать БЕЗ ключа внутри — линию среза увидишь только после сборки, поэтому проверь штифты дважды.',
    });
  }

  if (complete && (masterType === 'deep' || masterType === 'shallow')) {
    warnings.push({
      level: 'info',
      title: masterType === 'deep' ? 'Мастер глубокий' : 'Мастер мелкий',
      detail: masterType === 'deep'
        ? 'Все резы мастера глубже. Нижние штифты = нарезка ключа двери, можно собирать с ключом в плаге и сразу видеть срез.'
        : 'Все резы мастера мельче. Нижние штифты = нарезка мастера, можно собирать с ключом в плаге и сразу видеть срез.',
    });
  }

  // Bad wafer sizes are the classic silent failure: the number is on the sheet but
  // the pin does not exist in the kit, so the chamber quietly gets skipped.
  const [wLo, wHi] = preset.masterPinRange;
  const badWafers = positions.filter(p => p.masterWafer > 0 && (p.masterWafer < wLo || p.masterWafer > wHi));
  if (badWafers.length) {
    warnings.push({
      level: 'error',
      title: `Шайбы #${badWafers.map(p => p.masterWafer).join(', #')} не существует`,
      detail: `У ${preset.name} шайбы только #${wLo}–#${wHi}. Позиции ${badWafers.map(p => p.position).join(', ')} — измени глубину в одном из ключей минимум на ${wLo} шага.`,
    });
  }

  const [bLo, bHi] = preset.bottomPinRange;
  const badBottoms = positions.filter(p => p.bottomPin < bLo || p.bottomPin > bHi);
  if (badBottoms.length) {
    warnings.push({
      level: 'error',
      title: `Нижнего штифта #${badBottoms.map(p => p.bottomPin).join(', #')} не существует`,
      detail: `У ${preset.name} нижние штифты только #${bLo}–#${bHi}. Позиции ${badBottoms.map(p => p.position).join(', ')}.`,
    });
  }

  const mMacs = macsViolations(master, preset);
  const cMacs = macsViolations(change, preset);
  if (mMacs.length || cMacs.length) {
    const all = [...mMacs.map(v => ({ ...v, k: 'мастер' })), ...cMacs.map(v => ({ ...v, k: 'ключ двери' }))];
    warnings.push({
      level: 'error',
      title: `MACS ${preset.macs} нарушен`,
      detail: all.map(v => `${v.k}: позиции ${v.a}–${v.b} разница ${v.diff}`).join('; ') +
        '. Такой ключ физически не нарежется — между резами не остаётся металла.',
    });
  } else if (complete) {
    const worst = Math.max(
      0,
      ...[master, change].flatMap(b => {
        const r: number[] = [];
        for (let i = 0; i < b.length - 1; i++) {
          const x = b[i], y = b[i + 1];
          if (isFilled(x) && isFilled(y)) r.push(Math.abs(x - y));
        }
        return r;
      }),
    );
    warnings.push({
      level: 'info',
      title: `MACS ${preset.macs} — норма`,
      detail: `Максимальная разница соседних резов: ${worst}.`,
    });
  }

  const constants = positions.filter(p => p.masterWafer === 0);
  if (complete && constants.length) {
    warnings.push({
      level: 'info',
      title: `Constant cut в позиц${constants.length > 1 ? 'иях' : 'ии'} ${constants.map(p => p.position).join(', ')}`,
      detail: 'Резы совпали — шайба не ставится, только обычный нижний штифт.',
    });
  }

  if (complete && phantomKeys > 0) {
    warnings.push({
      level: phantomKeys >= 14 ? 'warn' : 'info',
      title: `${workingKeys} рабочих ключа на этот цилиндр`,
      detail: `Ты нарезаешь 2, остальные ${phantomKeys} — фантомные: они тоже откроют эту дверь. Чем больше шайб, тем выше шанс, что фантом совпадёт с ключом соседней двери.`,
    });
  }

  return { positions, masterType, waferCount, workingKeys, phantomKeys, warnings };
};

/** Every bitting that turns this plug: each chamber independently accepts either
 *  the master depth or the change depth. */
export const workingKeysFor = (master: number[], change: number[]): number[][] => {
  let out: number[][] = [[]];
  for (let i = 0; i < master.length; i++) {
    const opts = master[i] === change[i] ? [master[i]] : [master[i], change[i]];
    const next: number[][] = [];
    for (const row of out) for (const o of opts) next.push([...row, o]);
    out = next;
  }
  return out;
};

/** Invent a safe bitting for a new door: legal pins only, MACS-clean, at least two
 *  cuts away from the master, and — the part nobody can do by eye — no key or
 *  phantom shared with any existing door. Returns null if nothing fits. */
export const suggestBitting = (
  master: number[],
  doors: { id: string; name: string; bitting: (number | null)[] }[],
  preset: BrandPreset,
  attempts = 600,
  rng: () => number = Math.random,
): number[] | null => {
  const [wLo, wHi] = preset.masterPinRange;
  const [bLo, bHi] = preset.bottomPinRange;

  // Depths a chamber may legally take against this master cut.
  const legal = master.map(m => {
    const opts: number[] = [];
    for (let d = preset.minDepth; d <= preset.maxDepth; d++) {
      const wafer = Math.abs(d - m);
      if (wafer > 0 && (wafer < wLo || wafer > wHi)) continue;
      const bottom = Math.min(d, m);
      if (bottom < bLo || bottom > bHi) continue;
      opts.push(d);
    }
    return opts;
  });
  if (legal.some(o => o.length === 0)) return null;

  const taken = new Set(
    doors
      .filter(d => d.bitting.length === master.length && d.bitting.every(x => x !== null))
      .map(d => (d.bitting as number[]).join('-')),
  );
  taken.add(master.join('-'));

  for (let a = 0; a < attempts; a++) {
    const cand: number[] = [];
    for (let i = 0; i < master.length; i++) {
      // Respect MACS against the cut we just chose so most candidates survive.
      const prev = i > 0 ? cand[i - 1] : null;
      const opts = legal[i].filter(d => prev === null || Math.abs(d - prev) <= preset.macs);
      if (!opts.length) { cand.length = 0; break; }
      cand.push(opts[Math.floor(rng() * opts.length)]);
    }
    if (cand.length !== master.length) continue;
    if (cand.filter((d, i) => d !== master[i]).length < 2) continue;
    if (taken.has(cand.join('-'))) continue;
    if (macsViolations(cand, preset).length) continue;

    const trial = [...doors, { id: '__cand__', name: '__cand__', bitting: cand }];
    const clash = findInterchange(master, trial).some(f => f.doorA === '__cand__' || f.doorB === '__cand__');
    if (!clash) return cand;
  }
  return null;
};

/** Shopping list for the van: every pin size the whole building needs, counted. */
export const pinSummary = (
  master: number[],
  doors: { bitting: (number | null)[] }[],
  preset: BrandPreset,
): { bottoms: [number, number][]; wafers: [number, number][] } => {
  const bottoms = new Map<number, number>();
  const wafers = new Map<number, number>();
  for (const d of doors) {
    if (d.bitting.length !== master.length || !d.bitting.every(x => x !== null)) continue;
    for (const p of calcPinning(master, d.bitting, preset).positions) {
      bottoms.set(p.bottomPin, (bottoms.get(p.bottomPin) ?? 0) + 1);
      if (p.masterWafer > 0) wafers.set(p.masterWafer, (wafers.get(p.masterWafer) ?? 0) + 1);
    }
  }
  const sorted = (m: Map<number, number>): [number, number][] => [...m.entries()].sort((a, b) => a[0] - b[0]);
  return { bottoms: sorted(bottoms), wafers: sorted(wafers) };
};

export const formatBitting = (b: (number | null)[]): string =>
  b.map(n => (isFilled(n) ? String(n) : '·')).join('');

export interface InterchangeFinding {
  doorA: string;
  doorB: string;
  bitting: string;
  /** real-key = an actual cut key opens the wrong door. phantom = a ghost does. */
  kind: 'real-key' | 'phantom';
}

/** The check you cannot do by hand: does any key that works on door A also work on
 *  door B? The master legitimately opens everything, so it is excluded. */
export const findInterchange = (
  master: number[],
  doors: { id: string; name: string; bitting: (number | null)[] }[],
): InterchangeFinding[] => {
  const ready = doors
    .filter(d => d.bitting.length === master.length && d.bitting.every(isFilled))
    .map(d => {
      const bitting = d.bitting as number[];
      return { ...d, bitting, keys: new Set(workingKeysFor(master, bitting).map(k => k.join('-'))) };
    });

  const masterKey = master.join('-');
  const out: InterchangeFinding[] = [];

  for (let i = 0; i < ready.length; i++) {
    for (let j = i + 1; j < ready.length; j++) {
      const a = ready[i], b = ready[j];
      for (const k of a.keys) {
        if (k === masterKey || !b.keys.has(k)) continue;
        const isReal = k === a.bitting.join('-') || k === b.bitting.join('-');
        out.push({
          doorA: a.name,
          doorB: b.name,
          bitting: k.split('-').join(''),
          kind: isReal ? 'real-key' : 'phantom',
        });
      }
    }
  }

  // Real keys first — a resident opening a neighbour's door beats a theoretical ghost.
  return out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'real-key' ? -1 : 1));
};
