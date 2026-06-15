import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

// Versioned key (v2) so anyone stuck on the old permanent-dismiss flag gets the
// hint back. Closing it now only snoozes for a week instead of hiding forever —
// the nudge returns until the app is actually installed (standalone hides it).
const SNOOZE_KEY = 'tk_install_hint_snooze_v2';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// iOS-style share glyph (box with an arrow out the top) so users can match it to
// the Share button in the Safari toolbar.
const ShareIOS: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 14V3" />
    <path d="m8 6 4-3 4 3" />
    <path d="M9 8H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2" />
  </svg>
);

/**
 * One-time banner that nudges iPhone users (opened in Safari, not yet installed)
 * to add the app to the Home Screen. Once installed it runs standalone and this
 * never shows again. Dismissible; the choice is remembered.
 */
export const InstallHint: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const ua = navigator.userAgent || '';
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    let snoozedUntil = 0;
    try { snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { /* private mode */ }
    const snoozed = Date.now() < snoozedUntil;

    if (isIOS && !isStandalone && !snoozed) {
      const t = setTimeout(() => setShow(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* private mode */ }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 140, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 140, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          // Lifted clear of the fixed bottom nav (h-14 + padding ≈ 68px) so the card
          // never overlaps — and can never intercept — the nav buttons beneath it.
          className="fixed inset-x-0 bottom-0 z-[9999] px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+88px)] pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-blue-500/30 bg-slate-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <ShareIOS />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Install TrustKey as an app</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                Tap{' '}
                <span className="inline-flex items-center align-middle text-blue-400">
                  <ShareIOS size={13} />
                </span>{' '}
                Share, then choose{' '}
                <span className="font-medium text-gray-200">“Add to Home Screen.”</span> No App
                Store needed.
              </p>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
