import { describe, it, expect } from 'vitest';
import { overlayGeometry, depthFromRoot, KEY_GEOMETRY, scanPrompt } from './keyCalibration';
import { parseKeyScan } from './keyScanAI';

describe('overlay geometry', () => {
  it('puts a tick on every cut and keeps them inside the frame', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    expect(g.cutXs).toHaveLength(5);
    for (const x of g.cutXs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1000);
    }
    // Ticks must be evenly spaced — Kwikset cuts sit 0.150" apart.
    const gaps = g.cutXs.slice(1).map((x, i) => x - g.cutXs[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(0.15 * g.pxPerInch, 5);
  });

  it('scales with the frame — same key, twice the width, twice the pixels per inch', () => {
    const a = overlayGeometry('kwikset-kw1', 500, 600);
    const b = overlayGeometry('kwikset-kw1', 1000, 600);
    expect(b.pxPerInch).toBeCloseTo(a.pxPerInch * 2, 5);
  });

  it('honours the brand: Schlage has 6 cuts and a different pitch', () => {
    const g = overlayGeometry('schlage-sc1', 1000, 600);
    expect(g.cutXs).toHaveLength(6);
    const gap = g.cutXs[1] - g.cutXs[0];
    expect(gap).toBeCloseTo(0.156 * g.pxPerInch, 5);
  });

  it('can be trimmed to a 5-chamber Weiser', () => {
    expect(overlayGeometry('weiser', 1000, 600, 5).cutXs).toHaveLength(5);
  });

  it('draws the deepest cut below the shallowest — the ruler is not upside down', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    const shallow = g.depthLines.find(d => d.depth === 1)!;
    const deep = g.depthLines.find(d => d.depth === 7)!;
    expect(deep.y).toBeGreaterThan(shallow.y);
    expect(shallow.y).toBeGreaterThan(0);
    expect(deep.y).toBeLessThan(g.baselineY);
  });

  it('spaces the depth lines by the brand increment', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    const y = (d: number) => g.depthLines.find(x => x.depth === d)!.y;
    expect(y(2) - y(1)).toBeCloseTo(0.023 * g.pxPerInch, 4);
  });
});

describe('depthFromRoot', () => {
  it('reads an exact root back to its depth number', () => {
    for (const [d, inches] of Object.entries(KEY_GEOMETRY['kwikset-kw1'].rootDepths)) {
      const r = depthFromRoot('kwikset-kw1', inches);
      expect(r.depth).toBe(Number(d));
      expect(r.ambiguous).toBe(false);
    }
  });

  it('tolerates a small measurement error without complaining', () => {
    const r = depthFromRoot('kwikset-kw1', 0.283 + 0.004);
    expect(r.depth).toBe(3);
    expect(r.ambiguous).toBe(false);
  });

  it('flags a root sitting between two depths instead of guessing', () => {
    // Halfway between #3 (.283) and #4 (.260).
    const r = depthFromRoot('kwikset-kw1', 0.2715);
    expect(r.ambiguous).toBe(true);
  });

  it('is stricter on Schlage, whose steps are finer', () => {
    // .005" is a third of a Schlage step (.015) but only a fifth of a Kwikset one (.023).
    expect(depthFromRoot('schlage-sc1', 0.290 + 0.005).ambiguous).toBe(true);
    expect(depthFromRoot('kwikset-kw1', 0.283 + 0.005).ambiguous).toBe(false);
  });
});

describe('scanPrompt', () => {
  it('tells the model the tick count and the legal depth labels', () => {
    const p = scanPrompt('kwikset-kw1', 5);
    expect(p).toContain('1..5');
    expect(p).toContain('1, 2, 3, 4, 5, 6, 7');
    expect(p).toContain('"unsure"');
  });

  it('offers Schlage its own depth range including zero', () => {
    expect(scanPrompt('schlage-sc1', 6)).toContain('0, 1, 2, 3, 4, 5, 6, 7, 8, 9');
  });
});

describe('parseKeyScan', () => {
  it('rejects a partial read rather than half-filling the row', () => {
    expect(parseKeyScan('{"depths":[3,4,2],"unsure":[]}', 5)).toEqual({ depths: [], unsure: [] });
  });

  it('accepts a full read and keeps the unsure flags', () => {
    expect(parseKeyScan('{"depths":[3,4,2,5,2],"unsure":[3]}', 5))
      .toEqual({ depths: [3, 4, 2, 5, 2], unsure: [3] });
  });

  it('survives markdown fences and rubbish', () => {
    expect(parseKeyScan('```json\n{"depths":[1,2,3,4,5],"unsure":[]}\n```', 5).depths).toEqual([1, 2, 3, 4, 5]);
    expect(parseKeyScan('sorry I cannot', 5)).toEqual({ depths: [], unsure: [] });
  });

  it('drops out-of-range unsure indexes', () => {
    expect(parseKeyScan('{"depths":[1,1,1,1,1],"unsure":[0,3,99]}', 5).unsure).toEqual([3]);
  });
});

describe('ghost blade outline', () => {
  it('puts the uncut top edge above every cut root', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    for (const l of g.depthLines) expect(g.bladeTopY).toBeLessThan(l.y);
  });

  it('runs the blade past the last cut but not off the frame', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    expect(g.tipX).toBeGreaterThan(g.cutXs[g.cutXs.length - 1]);
    expect(g.tipX).toBeLessThanOrEqual(1000);
  });

  it('starts the blade at the shoulder, left of the first cut', () => {
    const g = overlayGeometry('schlage-sc1', 1000, 600);
    expect(g.shoulderX).toBeGreaterThan(0);
    expect(g.shoulderX).toBeLessThan(g.cutXs[0]);
  });

  it('gives the blade a sane height — taller than the depth range it must contain', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    const range = Math.max(...g.depthLines.map(l => l.y)) - Math.min(...g.depthLines.map(l => l.y));
    expect(g.baselineY - g.bladeTopY).toBeGreaterThan(range);
  });
});

describe('tip stop visibility', () => {
  it('leaves the tip inside the frame so a stop can be drawn on it', () => {
    for (const b of ['kwikset-kw1', 'schlage-sc1', 'weiser'] as const) {
      const g = overlayGeometry(b, 1000, 600);
      expect(g.tipX).toBeLessThan(1000);
      expect(1000 - g.tipX).toBeGreaterThan(20);
    }
  });

  it('keeps the shoulder clear of the left edge for its bracket', () => {
    const g = overlayGeometry('kwikset-kw1', 1000, 600);
    expect(g.shoulderX).toBeGreaterThan(20);
  });
});
