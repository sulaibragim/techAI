import { useEffect, useRef } from 'react';

interface SwipeBackOptions {
  enabled?: boolean;
  /** Horizontal distance (px) past which release triggers `onBack`. */
  threshold?: number;
}

/**
 * iOS-style "swipe right to go back" for full-screen overlays (JobDetail, JobWizard).
 *
 * Attach the returned ref to the element that should slide. A clearly horizontal,
 * left-to-right drag follows the finger for feedback; releasing past `threshold`
 * fires `onBack`, otherwise the panel springs back. A vertical gesture is ignored
 * so inner scrolling keeps working untouched.
 *
 * Touch-only on purpose — desktop has the button. The follow transform is written
 * straight to the node (no React state) so dragging never re-renders the card.
 */
export function useSwipeBack<T extends HTMLElement = HTMLDivElement>(
  onBack: () => void,
  { enabled = true, threshold = 90 }: SwipeBackOptions = {}
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let mode: 'idle' | 'pending' | 'dragging' | 'rejected' = 'idle';

    const springBack = () => {
      el.style.transition = 'transform 0.25s cubic-bezier(0.22,1,0.36,1)';
      el.style.transform = '';
      const clear = () => {
        el.style.transition = '';
        el.removeEventListener('transitionend', clear);
      };
      el.addEventListener('transitionend', clear);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { mode = 'rejected'; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      mode = 'pending';
      el.style.transition = '';
    };

    const onMove = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'rejected') return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (mode === 'pending') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // wait for intent
        // Only own the gesture for a clearly rightward, horizontal drag —
        // anything else stays a normal scroll/tap.
        if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2) mode = 'dragging';
        else { mode = 'rejected'; return; }
      }

      if (mode === 'dragging') {
        e.preventDefault(); // we own it now — stop native scroll
        el.style.transform = `translateX(${Math.max(0, dx)}px)`;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (mode === 'dragging') {
        const dx = e.changedTouches[0].clientX - startX;
        if (dx > threshold) { el.style.transform = ''; onBack(); }
        else springBack();
      }
      mode = 'idle';
    };

    const onCancel = () => { if (mode === 'dragging') springBack(); mode = 'idle'; };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [onBack, enabled, threshold]);

  return ref;
}
