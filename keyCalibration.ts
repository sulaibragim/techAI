// Turning the camera into a measuring tool.
//
// A photo of a key on its own carries no scale — that is why free-hand reading is
// hopeless. But the cut POSITIONS along a blade are fixed by the keyway, so if the
// operator lines the cuts up under printed tick marks, the scale becomes known and
// the depth ruler beside them is automatically correct. From that point on it is a
// measurement against a ruler, not a guess.
//
// All figures in inches, from manufacturer spec sheets (see masterKeyUtils presets).
// Root depth is measured from the BOTTOM edge of the blade up to the root of the cut,
// so a shallow cut has the LARGER number.

import type { MasterKeyBrand } from './masterKeyUtils';

export interface KeyGeometry {
  /** Distance from the shoulder to the centre of each cut. */
  spacing: number[];
  /** Depth number → distance from the blade's bottom edge to the cut root. */
  rootDepths: Record<number, number>;
}

export const KEY_GEOMETRY: Record<MasterKeyBrand, KeyGeometry> = {
  'kwikset-kw1': {
    spacing: [0.247, 0.397, 0.547, 0.697, 0.847],
    rootDepths: { 1: 0.329, 2: 0.306, 3: 0.283, 4: 0.260, 5: 0.237, 6: 0.214, 7: 0.191 },
  },
  'schlage-sc1': {
    spacing: [0.231, 0.387, 0.543, 0.699, 0.855, 1.011],
    rootDepths: { 0: 0.335, 1: 0.320, 2: 0.305, 3: 0.290, 4: 0.275, 5: 0.260, 6: 0.245, 7: 0.230, 8: 0.215, 9: 0.200 },
  },
  weiser: {
    spacing: [0.237, 0.393, 0.549, 0.705, 0.861, 1.017],
    rootDepths: { 0: 0.315, 1: 0.297, 2: 0.279, 3: 0.261, 4: 0.243, 5: 0.225, 6: 0.207, 7: 0.189, 8: 0.171, 9: 0.153 },
  },
};

// Asymmetric padding: the bow runs off the left edge anyway, so the room is spent on
// the right instead — otherwise the tip lands exactly on the frame edge and there is
// nowhere to draw a tip stop.
const PAD_LEFT = 0.10;
const PAD_RIGHT = 0.22;

/** Blade sits a touch above the shallowest cut root — enough to show the uncut edge
 *  without claiming a blade height the spec sheets do not publish. */
const BLADE_TOP_MARGIN = 0.012;
/** How far the blade runs past the last cut before the tip. */
const TIP_MARGIN = 0.1;

export interface OverlayGeometry {
  pxPerInch: number;
  shoulderX: number;
  /** Screen x of each cut centre — the ticks the operator aligns the key to. */
  cutXs: number[];
  /** The blade's bottom edge: everything is measured up from here. */
  baselineY: number;
  /** Uncut top edge of the blade — the ghost outline's ceiling. */
  bladeTopY: number;
  /** Where the blade ends, for the ghost outline. */
  tipX: number;
  /** Screen y of each depth number's root — the ruler the cut root is read against. */
  depthLines: { depth: number; y: number }[];
}

/** Lay the ticks and the depth ruler out inside a camera frame of the given size. */
export const overlayGeometry = (
  brand: MasterKeyBrand,
  frameW: number,
  frameH: number,
  chambers?: number,
): OverlayGeometry => {
  const geo = KEY_GEOMETRY[brand];
  const spacing = chambers ? geo.spacing.slice(0, chambers) : geo.spacing;
  const lastCut = spacing[spacing.length - 1];

  const span = lastCut * (1 + PAD_LEFT + PAD_RIGHT);
  const pxPerInch = frameW / span;
  const shoulderX = lastCut * PAD_LEFT * pxPerInch;

  const depths = Object.keys(geo.rootDepths).map(Number).sort((a, b) => a - b);
  const shallowest = Math.max(...depths.map(d => geo.rootDepths[d]));

  // Sit the ruler in the middle of the frame with the whole depth range on screen.
  const baselineY = frameH / 2 + (shallowest * pxPerInch) / 2;

  return {
    pxPerInch,
    shoulderX,
    cutXs: spacing.map(s => shoulderX + s * pxPerInch),
    baselineY,
    bladeTopY: baselineY - (shallowest + BLADE_TOP_MARGIN) * pxPerInch,
    tipX: Math.min(frameW, shoulderX + (lastCut + TIP_MARGIN) * pxPerInch),
    depthLines: depths.map(d => ({ depth: d, y: baselineY - geo.rootDepths[d] * pxPerInch })),
  };
};

export interface DepthReading {
  depth: number;
  /** Inches away from the nearest depth's exact root. */
  error: number;
  /** True when the reading sits close to the midpoint between two depths. */
  ambiguous: boolean;
}

/** Convert a measured root height (inches above the blade's bottom edge) to a depth
 *  number, and say whether it fell too close to the line between two depths. */
export const depthFromRoot = (brand: MasterKeyBrand, rootInches: number): DepthReading => {
  const geo = KEY_GEOMETRY[brand];
  const entries = Object.entries(geo.rootDepths).map(([d, v]) => ({ depth: Number(d), v }));

  let best = entries[0];
  for (const e of entries) {
    if (Math.abs(e.v - rootInches) < Math.abs(best.v - rootInches)) best = e;
  }

  const sorted = [...entries].sort((a, b) => a.v - b.v);
  const step = sorted.length > 1
    ? Math.min(...sorted.slice(1).map((e, i) => Math.abs(e.v - sorted[i].v)))
    : 0;

  const error = Math.abs(best.v - rootInches);
  return { depth: best.depth, error, ambiguous: step > 0 && error > step * 0.3 };
};

/** What we tell the model: a ruler is already drawn on the image, so the job is
 *  "which labelled line is this cut sitting on", not "measure this key". */
export const scanPrompt = (brand: MasterKeyBrand, chambers: number): string => {
  const geo = KEY_GEOMETRY[brand];
  const depths = Object.keys(geo.rootDepths).map(Number).sort((a, b) => a - b);
  return `You are reading a photo of a house key that has a MEASURING OVERLAY drawn on top of it.

The overlay gives you:
- ${chambers} numbered vertical tick marks (1..${chambers}) placed exactly on the centre of each cut
- a set of horizontal ruler lines labelled ${depths.join(', ')} — these are the depth numbers
- the lowest ruler line is the deepest cut, the highest line is the shallowest cut

For EACH tick 1..${chambers}, look at where the metal of the key stops (the root, i.e. the
lowest point of the V-notch at that tick) and report WHICH LABELLED RULER LINE it is closest to.

Return ONLY valid JSON, no markdown fences:
{"depths":[${Array.from({ length: chambers }, () => 'number').join(',')}],"unsure":[numbers]}

- "depths": one depth number per tick, in order 1..${chambers}
- "unsure": the 1-based tick numbers where the root sits between two lines, or glare/blur
  makes you doubt it. Be generous here — a wrong depth costs a wasted trip.
- If the key is not aligned to the ticks or you cannot see the cuts, return {"depths":[],"unsure":[]}`;
};
