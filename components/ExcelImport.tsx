import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, FileSpreadsheet, Upload, Check, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { Part } from '../types';
import {
  SheetData, ColumnMap, MAP_FIELDS_BY_TARGET, MapField, ImportTarget,
  findHeaderIdx, autoMap, buildRows, guessTarget, ImportRow,
} from '../inventoryExcel';

interface ExcelImportProps {
  existing: Part[];
  onCancel: () => void;
  onConfirm: (rows: ImportRow[], mode: 'receive' | 'set', target: ImportTarget) => void;
}

// What each target does, spelled out — picking the wrong one is the difference between
// "$950 Lishi set is equipment" and "$950 Lishi set is on a client's invoice".
const TARGETS: { key: ImportTarget; label: string; hint: string }[] = [
  { key: 'stock',    label: 'Склад',     hint: 'Расходники, которые продаём и списываем на заявках: заготовки, транспондеры, пульты, чипы.' },
  { key: 'tools',    label: 'Инструмент', hint: 'Оборудование — программаторы, Lishi, станки. В счёт клиенту не попадает и в стоимость склада не входит. Строки без «Куплено = Да» лягут в план закупок, а не в наличие.' },
  { key: 'expenses', label: 'Расходы',   hint: 'Лог закупок: только деньги в бухгалтерию. Остатки на складе не меняются — иначе количество удвоится.' },
];

const inputCls = 'bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500/50 [&>option]:bg-slate-900';

export const ExcelImport: React.FC<ExcelImportProps> = ({ existing, onCancel, onConfirm }) => {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [headerIdx, setHeaderIdx] = useState(0);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [target, setTarget] = useState<ImportTarget>('stock');
  const [mode, setMode] = useState<'receive' | 'set'>('receive');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * Hand the file to a throwaway worker and wait for rows back. The worker is terminated
   * on success, failure and timeout alike — a hostile file that sends the parser into a
   * catastrophic regex spins that thread, not the app, and gets killed after 30s.
   */
  const parseSpreadsheet = (file: File): Promise<SheetData[]> => new Promise(async (resolve, reject) => {
    // A MODULE worker, and it has to be: the dev server serves the worker's TypeScript as an
    // ES module, so a classic worker died on its `import` with "Cannot use import statement
    // outside a module" — every spreadsheet in dev looked like a corrupt file. The options
    // object must be a static literal (Vite parses it at build time), so this can't be
    // conditional on the environment. Module workers need Safari 15+, which costs nothing
    // here: the app's push notifications already require iOS 16.4+.
    const worker = new Worker(new URL('../excelParser.worker.ts', import.meta.url), { type: 'module' });
    const done = (fn: () => void) => { clearTimeout(timer); worker.terminate(); fn(); };
    const timer = setTimeout(
      () => done(() => reject(new Error('файл слишком сложный или повреждён (превышено время разбора)'))),
      30_000
    );
    worker.onmessage = (e: MessageEvent<{ ok: boolean; sheets?: SheetData[]; error?: string }>) =>
      done(() => (e.data.ok ? resolve((e.data.sheets || []) as SheetData[]) : reject(new Error(e.data.error || 'ошибка разбора'))));
    worker.onerror = (e) => done(() => reject(new Error(e.message || 'ошибка разбора')));

    const isCsv = /\.csv$/i.test(file.name) || (file.type || '').includes('csv');
    if (isCsv) worker.postMessage({ kind: 'csv', text: await file.text() });
    else {
      const buffer = await file.arrayBuffer();
      worker.postMessage({ kind: 'binary', buffer }, [buffer]); // transfer, don't copy
    }
  });

  const sheet = sheets?.find(s => s.name === sheetName) || null;
  const header: any[] = sheet && sheet.rows[headerIdx] ? sheet.rows[headerIdx] : [];

  // Parsing happens in a worker (see excelParser.worker.ts): SheetJS on npm is stuck on
  // a version with an unpatched prototype-pollution and ReDoS advisory, and a worker's
  // separate global scope contains the damage while keeping the UI responsive on big
  // files. The parser is also still loaded on demand, so it stays out of the main bundle.
  const handleFile = async (file: File) => {
    setError(''); setBusy(true);
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.length === 0) { setError('В файле нет данных.'); setBusy(false); return; }
      // Default to the sheet that looks most like stock (most mapped columns).
      const scored = parsed.map(s => {
        const hi = findHeaderIdx(s.rows);
        const m = autoMap(s.rows[hi] || []);
        const mapped = Object.values(m).filter(v => v >= 0).length;
        return { s, hi, mapped };
      }).sort((a, b) => b.mapped - a.mapped);
      const pickSheet = scored[0];
      const pickHeader = pickSheet.s.rows[pickSheet.hi] || [];
      setSheets(parsed);
      setSheetName(pickSheet.s.name);
      setHeaderIdx(pickSheet.hi);
      setMap(autoMap(pickHeader));
      // A sheet of equipment and a sheet of consumables need different handling; guess
      // from the sheet's own name and headers, and let the user correct it.
      const t = guessTarget(pickSheet.s.name, pickHeader);
      setTarget(t);
      setMode(t === 'stock' ? 'set' : 'receive');
    } catch (e: any) {
      setError('Не удалось прочитать файл: ' + (e?.message || 'ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const selectSheet = (name: string) => {
    const s = sheets?.find(x => x.name === name);
    if (!s) return;
    const hi = findHeaderIdx(s.rows);
    const h = s.rows[hi] || [];
    setSheetName(name);
    setHeaderIdx(hi);
    setMap(autoMap(h));
    const t = guessTarget(name, h);
    setTarget(t);
    setMode(t === 'stock' ? 'set' : 'receive');
  };

  const rows: ImportRow[] = useMemo(() => {
    if (!sheet || !map) return [];
    return buildRows(sheet.rows, headerIdx, map, existing);
  }, [sheet, map, headerIdx, existing]);

  const included = rows.filter(r => r.include);
  const newCount = included.filter(r => r.createNew).length;
  const matchCount = included.length - newCount;
  const plannedCount = target === 'tools' ? included.filter(r => !r.owned).length : 0;
  const money = included.reduce((a, r) => a + (r.cost || 0) * (target === 'expenses' ? Math.max(1, r.stock) : r.stock), 0);
  const fields = MAP_FIELDS_BY_TARGET[target];

  const setField = (field: MapField, col: number) => setMap(m => (m ? { ...m, [field]: col } : m));

  const confirm = () => {
    if (!map || included.length === 0) return;
    if (map.name < 0) { setError('Укажите колонку «Название».'); return; }
    onConfirm(included, mode, target);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6 animate-in fade-in" onClick={onCancel}>
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-white/10 rounded-t-3xl md:rounded-3xl w-full md:max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-green-400" /> Импорт из Excel
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          {!sheets ? (
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/15 rounded-2xl py-12 cursor-pointer hover:border-blue-500/40 hover:bg-white/5 transition-all">
              <Upload size={32} className="text-slate-400" />
              <span className="text-sm font-semibold text-white">{busy ? 'Читаю файл…' : 'Выбери файл Excel (.xlsx) или CSV'}</span>
              <span className="text-xs text-slate-500">Приложение само найдёт шапку и разложит колонки</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          ) : (
            <>
              {/* Sheet + header row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sheets.length > 1 && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Лист</label>
                    <select value={sheetName} onChange={e => selectSheet(e.target.value)} className={`w-full ${inputCls}`}>
                      {sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Строка с шапкой (№)</label>
                  <input type="number" min={1} value={headerIdx + 1}
                    onChange={e => { const v = Math.max(1, Number(e.target.value) || 1) - 1; setHeaderIdx(v); setMap(autoMap(sheet?.rows[v] || [])); }}
                    className={`w-full ${inputCls}`} />
                </div>
              </div>

              {/* What this sheet IS */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Что в этом листе</p>
                <div className="grid grid-cols-3 gap-2">
                  {TARGETS.map(t => (
                    <button key={t.key} onClick={() => setTarget(t.key)}
                      className={`py-2.5 rounded-xl border text-sm font-bold transition-all ${target === t.key ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">{TARGETS.find(t => t.key === target)?.hint}</p>
              </div>

              {/* Column mapping */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Сопоставление колонок</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fields.map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 w-32 shrink-0">{f.label}{f.required && <span className="text-red-400"> *</span>}</span>
                      <select value={map ? map[f.key] : -1} onChange={e => setField(f.key, Number(e.target.value))} className={`flex-1 min-w-0 ${inputCls}`}>
                        <option value={-1}>— нет —</option>
                        {header.map((h, i) => <option key={i} value={i}>{String(h) || `Колонка ${i + 1}`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mode — only stock has a quantity that can be added or overwritten. */}
              <div className={target === 'stock' ? '' : 'hidden'}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Что делать с количеством</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMode('receive')} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold transition-all ${mode === 'receive' ? 'bg-green-600 border-green-400 text-white' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                    <Plus size={15} /> Приход (+ к остатку)
                  </button>
                  <button onClick={() => setMode('set')} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold transition-all ${mode === 'set' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                    <RefreshCw size={15} /> Установить (перезапись)
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {mode === 'receive'
                    ? 'Количество из файла добавится к текущему остатку, приход попадёт в журнал и расходы.'
                    : 'Количество из файла станет текущим остатком (для инвентаризации). Расход не пишется.'}
                </p>
              </div>

              {/* Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Предпросмотр</p>
                  <p className="text-xs text-slate-400">
                    {target === 'expenses'
                      ? <>на <span className="text-white font-bold">${money.toFixed(2)}</span> расходов</>
                      : <><span className="text-green-400 font-bold">{newCount}</span> новых · <span className="text-blue-400 font-bold">{matchCount}</span> обновление
                        {plannedCount > 0 && <> · <span className="text-amber-400 font-bold">{plannedCount}</span> в план</>}</>}
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-white/5">
                        <th className="text-left py-2 px-2">Название</th>
                        <th className="text-left py-2 px-2">{target === 'expenses' ? 'Инвойс' : 'SKU'}</th>
                        <th className="text-left py-2 px-2">{target === 'stock' ? 'Марка' : target === 'expenses' ? 'Дата' : 'Категория'}</th>
                        <th className="text-left py-2 px-2">{target === 'expenses' ? 'Поставщик' : 'Тип'}</th>
                        <th className="text-right py-2 px-2">Кол-во</th>
                        <th className="text-right py-2 px-2">{target === 'expenses' ? 'Сумма' : 'Закуп'}</th>
                        <th className="text-center py-2 px-2">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 40).map((r, i) => (
                        <tr key={i} className={`border-t border-white/5 ${r.include ? '' : 'opacity-40'}`}>
                          <td className="py-1.5 px-2 text-slate-200 max-w-[220px] truncate">{r.name}</td>
                          <td className="py-1.5 px-2 text-slate-400 tabular-nums">{r.sku || '—'}</td>
                          <td className="py-1.5 px-2 text-slate-300">{(target === 'stock' ? r.group : target === 'expenses' ? r.date : r.category) || '—'}</td>
                          <td className="py-1.5 px-2 text-purple-300">{(target === 'expenses' ? r.supplier : target === 'stock' ? r.category : r.brand) || '—'}</td>
                          <td className="py-1.5 px-2 text-right text-white tabular-nums">{r.stock}</td>
                          <td className="py-1.5 px-2 text-right text-slate-400 tabular-nums">
                            {target === 'expenses'
                              ? `$${((r.cost || 0) * Math.max(1, r.stock)).toFixed(2)}`
                              : r.cost ? `$${r.cost}` : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {target === 'tools' && !r.owned
                              ? <span className="text-[10px] font-bold text-amber-400">план</span>
                              : target === 'expenses'
                                ? <span className="text-[10px] font-bold text-slate-500">расход</span>
                                : r.createNew
                                  ? <span className="text-[10px] font-bold text-green-400">новый</span>
                                  : <span className="text-[10px] font-bold text-blue-400">есть</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 40 && <p className="text-[11px] text-slate-500 mt-1">…и ещё {rows.length - 40}. Импортируются все {rows.length}.</p>}
                {rows.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">Строки не распознаны — проверь строку с шапкой и сопоставление.</p>}
              </div>
            </>
          )}
        </div>

        {sheets && (
          <div className="sticky bottom-0 bg-slate-900 border-t border-white/10 px-5 py-3 flex items-center justify-end gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white">Отмена</button>
            <button onClick={confirm} disabled={included.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <Check size={15} /> Импортировать {included.length}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
