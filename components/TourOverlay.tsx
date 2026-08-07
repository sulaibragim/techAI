import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import type { TourStep } from '../tours';

interface Rect { top: number; left: number; width: number; height: number }

interface TourOverlayProps {
  steps: TourStep[];
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

const SPOTLIGHT_PAD = 8;
const CARD_WIDTH = 340;
const GAP = 14;

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

export const TourOverlay: React.FC<TourOverlayProps> = ({ steps, stepIndex, onNext, onPrev, onFinish, onSkip }) => {
  const step = steps[stepIndex];
  const [rect, setRect] = useState<Rect | null>(null);
  const rectRef = useRef<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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

  // Placing the card ABOVE a target needs its real height — copy length varies per step,
  // and a guessed height would either overlap the highlight or float away from it.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardHeight) > 2) setCardHeight(h);
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

  const ringBox = rect
    ? (() => {
        const top = Math.max(4, rect.top - SPOTLIGHT_PAD);
        const left = Math.max(4, rect.left - SPOTLIGHT_PAD);
        return {
          top,
          left,
          width: Math.min(vw - 4, rect.left + rect.width + SPOTLIGHT_PAD) - left,
          height: Math.min(vh - 4, rect.top + rect.height + SPOTLIGHT_PAD) - top,
        };
      })()
    : null;

  // Card placement. On a phone the card parks at the opposite end of the screen from the
  // highlight so it can never cover the thing it describes. On desktop it sits beside the
  // target — but always clamped inside the viewport: a target that failed to scroll into
  // view must not drag the instructions off-screen with it.
  const cardStyle: React.CSSProperties = { width: Math.min(CARD_WIDTH, vw - 32) };
  if (!rect) {
    // inset + auto margins, NOT translate(-50%,-50%): the card's transform belongs to the
    // enter animation, and a hand-written one is silently overwritten the moment it runs.
    cardStyle.inset = 0;
    cardStyle.margin = 'auto';
    cardStyle.height = 'fit-content';
  } else if (isMobile) {
    // Pick the side with more room, measured from the target's EDGES. Going by its centre
    // put the card under a tall element like the checklist, which starts high on the
    // screen but reaches most of the way down it.
    const roomAbove = rect.top;
    const roomBelow = vh - (rect.top + rect.height);
    cardStyle.left = 16;
    cardStyle.right = 16;
    cardStyle.width = 'auto';
    if (roomBelow >= roomAbove) cardStyle.bottom = 'calc(env(safe-area-inset-bottom) + 5.5rem)';
    else cardStyle.top = 'max(1rem, env(safe-area-inset-top))';
  } else {
    const width = Math.min(CARD_WIDTH, vw - 32);
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - cardHeight;
    const fitsBelow = vh - below > cardHeight + 16;
    const wantsBelow = step.placement === 'bottom' || (step.placement !== 'top' && fitsBelow);
    cardStyle.left = clamp(rect.left + rect.width / 2 - width / 2, 16, vw - width - 16);
    cardStyle.top = clamp(wantsBelow ? below : above, 16, vh - cardHeight - 16);
  }

  return (
    <div className="fixed inset-0 z-[300] font-sans" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* No spotlight for this step: one flat scrim, so the card reads as a normal modal. */}
      {!rect && <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]" />}

      {/* The scrim IS the ring's outer shadow — one element, so the cut-out can never drift
          out of sync with the four edges of a hand-built mask. */}
      {ringBox && (
        <div
          className="absolute rounded-2xl border-2 border-blue-400 pointer-events-none"
          style={{
            // Clamped to the viewport: the padding around an element sitting flush against
            // an edge — every item in the phone's bottom nav — would otherwise push the
            // ring's border off-screen, leaving the highlight looking cut open.
            top: ringBox.top,
            left: ringBox.left,
            width: ringBox.width,
            height: ringBox.height,
            // A CSS transition, not a JS-animated one: a frame-driven library writes the
            // new geometry only on a frame, so on a throttled tab the cut-out would sit on
            // the previous step's element. Here the correct box is in the DOM immediately
            // and the glide is only decoration.
            transition: 'top 260ms cubic-bezier(0.22,1,0.36,1), left 260ms cubic-bezier(0.22,1,0.36,1), width 260ms cubic-bezier(0.22,1,0.36,1), height 260ms cubic-bezier(0.22,1,0.36,1)',
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.82), 0 0 26px rgba(59,130,246,0.55)',
          }}
        />
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
          className="absolute bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
          style={cardStyle}
        >
          <button
            onClick={onSkip}
            aria-label="Close the tour"
            className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X size={14} />
          </button>

          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">
            Step {stepIndex + 1} of {steps.length}
          </p>
          <h3 className="text-base font-bold text-white tracking-tight mb-2 pr-6">{step.title}</h3>
          <p className="text-[13px] leading-relaxed text-slate-300">{step.body}</p>

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
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  onClick={onPrev}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
                >
                  <ChevronLeft size={13} /> Back
                </button>
              )}
              <button
                onClick={isLast ? onFinish : onNext}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-blue-900/40"
              >
                {isLast ? <><Check size={13} /> Got it</> : <>Next <ChevronRight size={13} /></>}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
