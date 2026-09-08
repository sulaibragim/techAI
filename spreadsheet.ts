import type { SheetData } from './inventoryExcel';

// Spreadsheet parsing runs in a throwaway module worker — see excelParser.worker.ts for
// why (SheetJS ships with two unpatched advisories, and a worker contains the damage).
// The worker is terminated on success, failure and timeout alike, so a hostile file that
// sends the parser into a catastrophic regex spins that thread and then gets killed.
export function parseSpreadsheetFile(file: File): Promise<SheetData[]> {
  return new Promise(async (resolve, reject) => {
    // A MODULE worker, and it has to be: the dev server serves the worker's TypeScript as
    // an ES module, so a classic worker dies on its `import`. The options object must be a
    // static literal — Vite parses it at build time.
    const worker = new Worker(new URL('./excelParser.worker.ts', import.meta.url), { type: 'module' });
    const done = (fn: () => void) => { clearTimeout(timer); worker.terminate(); fn(); };
    const timer = setTimeout(
      () => done(() => reject(new Error('файл слишком сложный или повреждён (превышено время разбора)'))),
      30_000
    );
    worker.onmessage = (e: MessageEvent<{ ok: boolean; sheets?: SheetData[]; error?: string }>) =>
      done(() => (e.data.ok ? resolve((e.data.sheets || []) as SheetData[]) : reject(new Error(e.data.error || 'ошибка разбора'))));
    worker.onerror = (e) => done(() => reject(new Error(e.message || 'ошибка разбора')));

    try {
      const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || (file.type || '').includes('csv');
      // CSV is decoded as UTF-8 text by File.text(), so Cyrillic survives; XLSX carries
      // its own encoding and goes over as raw bytes.
      if (isCsv) worker.postMessage({ kind: 'csv', text: await file.text() });
      else {
        const buffer = await file.arrayBuffer();
        worker.postMessage({ kind: 'binary', buffer }, [buffer]); // transfer, don't copy
      }
    } catch (err) {
      done(() => reject(err instanceof Error ? err : new Error('не удалось прочитать файл')));
    }
  });
}
