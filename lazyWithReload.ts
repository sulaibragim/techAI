import { lazy, type ComponentType } from 'react';

// A running tab holds the OLD entry bundle after a redeploy. That bundle references code-
// split chunks by their previous content hash — filenames that no longer exist once a new
// build ships. The first lazy import of a not-yet-loaded screen then throws
//   "Failed to fetch dynamically imported module: …/assets/Dashboard-<oldhash>.js"
// because the host returns 404. The cure is to reload ONCE: a fresh load pulls the new
// index.html (our service worker is network-first) and with it the new chunk manifest.
//
// A per-module sessionStorage flag prevents an infinite reload loop — if the chunk is
// genuinely gone even after a fresh load, we stop reloading and let the error surface to
// the ErrorBoundary. The flag is cleared on the first successful load so a LATER deploy
// can trigger its own one-time reload.

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

const flagKey = (key: string) => `chunk-reload:${key}`;

const readFlag = (k: string): boolean => {
  try { return sessionStorage.getItem(flagKey(k)) === '1'; } catch { return false; }
};
const writeFlag = (k: string, v: boolean) => {
  try { v ? sessionStorage.setItem(flagKey(k), '1') : sessionStorage.removeItem(flagKey(k)); } catch { /* storage unavailable */ }
};

export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      writeFlag(key, false); // loaded fine — arm the guard for a future deploy
      return mod;
    } catch (err) {
      const isChunkError = CHUNK_ERROR.test(err instanceof Error ? err.message : String(err));
      if (isChunkError && typeof window !== 'undefined' && !readFlag(key)) {
        writeFlag(key, true);
        window.location.reload();
        // Hold Suspense on the fallback until the reload takes over — never resolve.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
