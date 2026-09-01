import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { localize, UI_TEXT, type TourStep, type Lang } from '../tours';
import { LanguageToggle } from './LanguageToggle';

interface Rect { top: number; left: number; width: number; height: number }

interface TourOverlayProps {
  steps: TourStep[];
  stepIndex: number;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onNext: () => void;
  onPrev: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

const SPOTLIGHT_PAD = 8;
const CARD_WIDTH = 340;
/** Distance between the highlight and the caption card — wide enough for the leader line
 *  to read as a line rather than a smudge between two touching boxes. */
const GAP = 46;
const ACCENT = '#38bdf8';

/** First MATCH that is actually on screen — the same `data-tour` id exists on both the
 *  desktop sidebar and the mobile nav, and only one of them is rendered at a time. */
function findTarget(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return nodes.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }) || null;
}

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

/**
 * The curve joining the highlighted control to its caption. Leaves the ring from whichever
 * edge faces the card and enters the card head-on, so the line never cuts across either box.
 * Returns null when the two are nearly touching — a leader shorter than its own dashes reads
 * as a glitch, and the card is obviously attached at that distance anyway.
 */
function leaderPath(ring: Rect, card: Rect): { d: string; end: { x: number; y: number } } | null {
  const rcx = ring.left + ring.width / 2, rcy = ring.top + ring.height / 2;
  const ccx = card.left + card.width / 2, ccy = card.top + card.height / 2;
  const dx = ccx - rcx, dy = ccy - rcy;
  const PULL = 44; // how far the curve leaves each anchor along its own normal

  if (Math.abs(dy) >= Math.abs(dx)) {
    const down = dy > 0;
    const sep = down ? card.top - (ring.top + ring.height) : ring.top - (card.top + card.height);
    if (sep < 16) return null;
    const from = { x: rcx, y: down ? ring.top + ring.height : ring.top };
    const to = { x: ccx, y: down ? card.top : card.top + card.height };
    const pull = down ? PULL : -PULL;
    return {
      d: `M ${from.x} ${from.y} C ${from.x} ${from.y + pull}, ${to.x} ${to.y - pull}, ${to.x} ${to.y}`,
      end: to,
    };
  }

  const right = dx > 0;
  const sep = right ? card.left - (ring.left + ring.width) : ring.left - (card.left + card.width);
  if (sep < 16) return null;
  const from = { x: right ? ring.left + ring.width : ring.left, y: rcy };
  const to = { x: right ? card.left : card.left + card.width, y: ccy };
  const pull = right ? PULL : -PULL;
  return {
    d: `M ${from.x} ${from.y} C ${from.x + pull} ${from.y}, ${to.x - pull} ${to.y}, ${to.x} ${to.y}`,
    end: to,
  };
}

export const TourOverlay: React.FC<TourOverlayProps> = ({ steps, stepIndex, lang, onLangChange, onNext, onPrev, onFinish, onSkip }) => {
  const step = steps[stepIndex];
  const [rect, setRect] = useState<Rect | null>(null);
  const rectRef = useRef<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardBoxRef = useRef<Rect | null>(null);
  const [cardBox, setCardBox] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(250);
  const isLast = stepIndex === steps.length - 1;

  const measure = useCallback(() => {
    if (!step?.target || step.placement === 'center') {
      if (rectRef.current !== null) { rectRef.current = null; setRect(null); }
      return;
    }
    const el = findTarget(step.target);
    // A target that isn't on this screen (hidden by role, collapsed on mobile) degrades
    // to a centered card rather than pointing at nothing.
    const next = el ? rectOf(el) : null;
    if (!sameRect(rectRef.current, next)) { rectRef.current = next; setRect(next); }
  }, [step?.target, step?.placement]);

  useEffect(() => {
    rectRef.current = null;
    setRect(null);
    if (!step?.target || step.placement === 'center') return;

    // Bring the target into view before measuring — the element may be below the fold or
    // inside the horizontally-scrolling mobile nav.
    findTarget(step.target)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    // Smooth scrolling is frame-driven and can simply not happen (reduced-motion setting,
    // a throttled tab). Check once it should have landed and jump if it didn't.
    const scrollFallback = window.setTimeout(() => {
      const el = findTarget(step.target!);
      if (!el) return;
      const r = el.getBoundingClientRect();
      // PARTLY off-screen counts as off-screen: a nav item clipped by the bottom of its
      // own scroller gets a ring that runs off the edge, which reads as a broken tour.
      // Horizontal matters too — the phone's bottom nav is a side-scrolling strip, and the
      // later tabs sit well past the right edge until it is scrolled.
      const clipped =
        r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth;
      if (clipped && r.height < window.innerHeight && r.width < window.innerWidth) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        measure();
      }
    }, 650);

    measure();
    // The tab switch, the smooth scroll and the layout animations all settle over the next
    // few hundred ms; re-measure across that window instead of guessing one delay.
    const settle = window.setInterval(measure, 90);
    const stopSettle = window.setTimeout(() => window.clearInterval(settle), 1200);
    const keepFresh = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(scrollFallback);
      window.clearInterval(settle);
      window.clearTimeout(stopSettle);
      window.clearInterval(keepFresh);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [stepIndex, step?.target, step?.placement, measure]);

  // The card's real height decides whether it can sit above the target, and its real box is
  // where the leader line has to land. Both are read after layout — copy length varies per
  // step, so neither can be guessed. Guarded by a tolerance so this can't loop.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    if (h && Math.abs(h - cardHeight) > 2) setCardHeight(h);
    const r = el.getBoundingClientRect();
    const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    if (!sameRect(cardBoxRef.current, next)) { cardBoxRef.current = next; setCardBox(next); }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onSkip(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); isLast ? onFinish() : onNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLast, onNext, onPrev, onFinish, onSkip]);

  if (!step) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const isMobile = vw < 768;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  // Clamped to the viewport so the ring's border stays visible around an element sitting
  // flush against an edge — every item in the phone's bottom nav. Clamping two opposite
  // edges can invert the box when the target is entirely off-screen (a scroll that never
  // landed), which an SVG rect renders as garbage, so that case yields no ring at all and
  // the step falls back to a plain centered card.
  const ringBox = (() => {
    if (!rect) return null;
    const left = Math.max(4, rect.left - SPOTLIGHT_PAD);
    const top = Math.max(4, rect.top - SPOTLIGHT_PAD);
    const width = Math.min(vw - 4, rect.left + rect.width + SPOTLIGHT_PAD) - left;
    const height = Math.min(vh - 4, rect.top + rect.height + SPOTLIGHT_PAD) - top;
    if (width <= 0 || height <= 0) return null;
    return { top, left, width, height };
  })();

  // Card placement. On a phone the card parks at the opposite end of the screen from the
  // highlight so it can never cover the thing it describes. On desktop it sits beside the
  // target — but always clamped inside the viewport: a target that failed to scroll into
  // view must not drag the instructions off-screen with it.
  const cardStyle: React.CSSProperties = { width: Math.min(CARD_WIDTH, vw - 32) };
  if (!ringBox) {
    // inset + auto margins, NOT translate(-50%,-50%): the card's transform belongs to the
    // enter animation, and a hand-written one is silently overwritten the moment it runs.
    cardStyle.inset = 0;
    cardStyle.margin = 'auto';
    cardStyle.height = 'fit-content';
  } else if (isMobile) {
    // Pick the side with more room, measured from the target's EDGES. Going by its centre
    // put the card under a tall element like the checklist, which starts high on the
    // screen but reaches most of the way down it.
    const roomAbove = ringBox.top;
    const roomBelow = vh - (ringBox.top + ringBox.height);
    cardStyle.left = 16;
    cardStyle.right = 16;
    cardStyle.width = 'auto';
    if (roomBelow >= roomAbove) cardStyle.bottom = 'calc(env(safe-area-inset-bottom) + 5.5rem)';
    else cardStyle.top = 'max(1rem, env(safe-area-inset-top))';
  } else {
    const width = Math.min(CARD_WIDTH, vw - 32);
    const below = ringBox.top + ringBox.height + GAP;
    const above = ringBox.top - GAP - cardHeight;
    const fitsBelow = vh - below > cardHeight + 16;
    const wantsBelow = step.placement === 'bottom' || (step.placement !== 'top' && fitsBelow);
    cardStyle.left = clamp(ringBox.left + ringBox.width / 2 - width / 2, 16, vw - width - 16);
    cardStyle.top = clamp(wantsBelow ? below : above, 16, vh - cardHeight - 16);
  }

  const leader = ringBox && cardBox ? leaderPath(ringBox, cardBox) : null;

  return (
    // pointer-events-none: with the screen no longer blacked out, the app underneath stays
    // usable — the caption says "press this button", so pressing it has to actually work.
    // Only the card (and the scrim on target-less steps) take clicks back.
    <div className="fixed inset-0 z-[300] font-sans pointer-events-none" role="dialog" aria-label={localize(UI_TEXT.tourDialogLabel, lang)}>
      {/* Nothing to point at on this step, so the card carries it alone: a light wash to
          separate it from the screen — far lighter than the old blackout, which hid the
          very thing the tour was talking about. */}
      {!ringBox && <div className="absolute inset-0 bg-slate-950/60 pointer-events-auto" />}

      {ringBox && (
        <svg
          className="absolute inset-0"
          width="100%"
          height="100%"
          viewBox={`0 0 ${vw} ${vh}`}
          aria-hidden="true"
        >
          {/* Halo first, so the marching ring sits on top of it */}
          <rect
            className="tour-halo"
            x={Math.max(0, ringBox.left - 7)}
            y={Math.max(0, ringBox.top - 7)}
            width={ringBox.width + 14}
            height={ringBox.height + 14}
            rx={16}
            fill={ACCENT}
          />
          <rect
            className="tour-ants"
            x={ringBox.left}
            y={ringBox.top}
            width={ringBox.width}
            height={ringBox.height}
            rx={11}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2.5}
            strokeDasharray="10 8"
            strokeLinecap="round"
          />
          {leader && (
            <>
              <path
                className="tour-ants-line"
                d={leader.d}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2}
                strokeDasharray="6 6"
                strokeLinecap="round"
              />
              <circle cx={leader.end.x} cy={leader.end.y} r={4} fill={ACCENT} />
            </>
          )}
        </svg>
      )}

      {/* Enter-only, no AnimatePresence: mode="wait" holds the outgoing card until its exit
          animation finishes, so a stalled rAF (backgrounded tab, low-power device) would
          leave the tour frozen on a step the person already advanced past. */}
      <div>
        <motion.div
          ref={cardRef}
          key={stepIndex}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute pointer-events-auto bg-slate-900 border border-blue-500/30 rounded-2xl p-5 shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
          style={cardStyle}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 shrink-0">
              {localize(UI_TEXT.stepOf(stepIndex + 1, steps.length), lang)}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <LanguageToggle lang={lang} onChange={onLangChange} />
              <button
                onClick={onSkip}
                aria-label={localize(UI_TEXT.closeTour, lang)}
                className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <h3 className="text-base font-bold text-white tracking-tight mb-2">{localize(step.title, lang)}</h3>
          <p className="text-[13px] leading-relaxed text-slate-300">{localize(step.body, lang)}</p>

          <div className="flex items-center gap-1.5 mt-4 mb-4">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${i === stepIndex ? 'w-5 bg-blue-400' : i < stepIndex ? 'w-1.5 bg-blue-500/50' : 'w-1.5 bg-white/15'}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onSkip}
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            >
              {localize(UI_TEXT.skipTour, lang)}
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  onClick={onPrev}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
                >
                  <ChevronLeft size={13} /> {localize(UI_TEXT.back, lang)}
                </button>
              )}
              <button
                onClick={isLast ? onFinish : onNext}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-blue-900/40"
              >
                {isLast ? <><Check size={13} /> {localize(UI_TEXT.gotIt, lang)}</> : <>{localize(UI_TEXT.next, lang)} <ChevronRight size={13} /></>}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
