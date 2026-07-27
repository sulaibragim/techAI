/// <reference lib="webworker" />

// Spreadsheet parsing runs HERE, off the main thread, deliberately.
//
// SheetJS `xlsx@0.18.5` is the last version ever published to npm and carries two
// unpatched advisories: prototype pollution (CVE-2023-30533) and a ReDoS
// (CVE-2024-22363). The vendor's fix exists only on their own CDN, and pulling a build
// dependency from a third-party CDN — or swapping to a community republish — trades a
// low-likelihood parsing bug for a permanent supply-chain and deploy risk.
//
// A worker neutralises the impact of both instead:
//   • it has its OWN global scope, so anything that pollutes Object.prototype while
//     parsing a hostile file pollutes this throwaway realm, not the page holding the
//     user's session;
//   • a catastrophic regex spins this thread, not the UI, so the caller can time it out
//     and terminate the worker;
//   • as a bonus, a 300-row import no longer freezes the app while it parses.

// Imported statically ON PURPOSE: the worker script itself is only fetched when someone
// actually imports a spreadsheet, so this still keeps SheetJS out of the app bundle.
// The caller constructs this as a module worker — see the note in ExcelImport.tsx.
import * as XLSX from 'xlsx';

export interface ParsedSheet {
  name: string;
  rows: unknown[][];
}

type Request = { text: string; kind: 'csv' } | { buffer: ArrayBuffer; kind: 'binary' };
type Response = { ok: true; sheets: ParsedSheet[] } | { ok: false; error: string };

self.onmessage = (e: MessageEvent<Request>) => {
  try {
    const req = e.data;
    // CSV is decoded as UTF-8 text by the caller (File.text() always is), so Cyrillic
    // survives; reading it as raw bytes would misread UTF-8 as Latin-1. XLSX files
    // carry their own encoding, so they come through as an ArrayBuffer.
    const wb = req.kind === 'csv'
      ? XLSX.read(req.text, { type: 'string' })
      : XLSX.read(new Uint8Array(req.buffer), { type: 'array' });

    const sheets: ParsedSheet[] = wb.SheetNames
      .map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as unknown[][],
      }))
      .filter((s) => s.rows.length > 0);

    (self as unknown as Worker).postMessage({ ok: true, sheets } satisfies Response);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : 'parse failed',
    } satisfies Response);
  }
};
