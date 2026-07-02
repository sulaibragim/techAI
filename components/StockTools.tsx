import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, ClipboardCheck, PieChart, Skull, CheckCircle2, TrendingUp, Package } from 'lucide-react';
import { Part, StockMovement } from '../types';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// ── Stocktake: walk the shelf, type what you actually see, apply in one tap ────
// Only rows the user actually filled in are applied (blank = "didn't count this one"),
// so a partial count of one shelf never zeroes the rest of the warehouse.
export const StocktakeModal: React.FC<{
  inventory: Part[];
  onClose: () => void;
  onApply: (changes: { partId: string; actual: number }[]) => void;
}> = ({ inventory, onClose, onApply }) => {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');

  const list = inventory.filter(p =>
    !filter || [p.name, p.sku, p.location].some(v => v?.toLowerCase().includes(filter.toLowerCase()))
  );

  const changes = Object.entries(counts)
    .map(([partId, v]: [string, string]) => ({ partId, actual: parseInt(v, 10) }))
    .filter(c => !isNaN(c.actual) && c.actual >= 0)
    .filter(c => {
      const p = inventory.find(x => x.id === c.partId);
      return p && p.stock !== c.actual;
    });
  const counted = Object.values(counts).filter(v => String(v).trim() !== '').length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><ClipboardCheck size={20} className="text-emerald-400" /> Stocktake</h3>
        <p className="text-xs text-slate-500 mb-4">Count the shelf, type what you see. Blank = not counted. Differences are logged as adjustments.</p>

        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name, SKU, location…"
          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-emerald-500/50 mb-3"
        />

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {list.map(p => {
            const v = counts[p.id] ?? '';
            const actual = parseInt(v, 10);
            const hasDiff = v.trim() !== '' && !isNaN(actual) && actual !== p.stock;
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${hasDiff ? 'bg-amber-500/5 border-amber-500/30' : 'bg-slate-950 border-white/10'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500 font-mono">expected {p.stock}{p.location ? ` · ${p.location}` : ''}</p>
                </div>
                {hasDiff && (
                  <span className={`shrink-0 text-xs font-bold tabular-nums ${actual > p.stock ? 'text-emerald-400' : 'text-red-400'}`}>
                    {actual > p.stock ? '+' : ''}{actual - p.stock}
                  </span>
                )}
                <input
                  value={v}
                  onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value }))}
                  type="number" min="0" inputMode="numeric" placeholder="—"
                  className="w-20 shrink-0 bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-sm font-mono text-white text-center outline-none focus:border-emerald-500/50"
                />
              </div>
            );
          })}
          {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nothing matches that filter.</p>}
        </div>

        <div className="pt-4 flex items-center gap-3 border-t border-white/10 mt-3">
          <span className="text-xs text-slate-400 font-semibold">{counted} counted · {changes.length} difference{changes.length === 1 ? '' : 's'}</span>
          <button
            onClick={() => { onApply(changes); onClose(); }}
            disabled={changes.length === 0}
            className="ml-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
          >
            Apply {changes.length > 0 ? `${changes.length} adjustment${changes.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Insights: ABC classification + dead stock ─────────────────────────────────

export interface AbcRow { part: Part; value: number; cls: 'A' | 'B' | 'C'; }

// ABC by usage VALUE over the trailing 90 days: A = parts producing the top 80% of
// consumed value, B = next 15%, C = the tail. Value = sold qty × unit cost.
export function abcAnalysis(inventory: Part[], movements: StockMovement[]): AbcRow[] {
  const cutoff = Date.now() - 90 * 86400000;
  const value = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== 'sale' || new Date(m.timestamp).getTime() < cutoff) continue;
    value.set(m.partId, (value.get(m.partId) || 0) + Math.abs(m.qty) * (m.unitCost ?? 0));
  }
  const rows = inventory
    .map(part => ({ part, value: value.get(part.id) || 0 }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  let cum = 0;
  return rows.map(r => {
    cum += r.value;
    const cls: 'A' | 'B' | 'C' = total <= 0 || r.value === 0 ? 'C' : cum / total <= 0.8 ? 'A' : cum / total <= 0.95 ? 'B' : 'C';
    return { ...r, cls };
  });
}

// Dead stock: money sitting on the shelf — on hand, but nothing sold in 90 days.
export function deadStock(inventory: Part[], movements: StockMovement[]): { part: Part; valueAtCost: number }[] {
  const cutoff = Date.now() - 90 * 86400000;
  const soldRecently = new Set(
    movements.filter(m => m.type === 'sale' && new Date(m.timestamp).getTime() >= cutoff).map(m => m.partId)
  );
  return inventory
    .filter(p => p.stock > 0 && !soldRecently.has(p.id))
    .map(part => ({ part, valueAtCost: part.stock * (part.cost ?? 0) }))
    .sort((a, b) => b.valueAtCost - a.valueAtCost);
}

const ABC_STYLE: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-500/15 text-emerald-400',
  B: 'bg-blue-500/15 text-blue-400',
  C: 'bg-slate-500/15 text-slate-400',
};

export const InsightsModal: React.FC<{
  inventory: Part[];
  movements: StockMovement[];
  onClose: () => void;
}> = ({ inventory, movements, onClose }) => {
  const abc = useMemo(() => abcAnalysis(inventory, movements), [inventory, movements]);
  const dead = useMemo(() => deadStock(inventory, movements), [inventory, movements]);
  const deadValue = dead.reduce((s, d) => s + d.valueAtCost, 0);
  const groups = { A: abc.filter(r => r.cls === 'A'), B: abc.filter(r => r.cls === 'B'), C: abc.filter(r => r.cls === 'C') };
  const [tab, setTab] = useState<'abc' | 'dead'>('abc');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><PieChart size={20} className="text-blue-400" /> Stock Insights</h3>
        <p className="text-xs text-slate-500 mb-4">Where the money moves (last 90 days) — and where it just sits.</p>

        <div className="flex bg-slate-950 border border-white/10 rounded-xl p-1 mb-4">
          <button onClick={() => setTab('abc')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'abc' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
            <TrendingUp size={13} /> ABC
          </button>
          <button onClick={() => setTab('dead')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'dead' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
            <Skull size={13} /> Dead stock {dead.length > 0 && `(${money(deadValue)})`}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {tab === 'abc' && (
            <>
              <p className="text-[11px] text-slate-500 leading-snug mb-2">
                <span className="text-emerald-400 font-bold">A</span> = top 80% of consumed value — never run out of these.{' '}
                <span className="text-blue-400 font-bold">B</span> = next 15%. <span className="text-slate-400 font-bold">C</span> = the tail — don't overstock.
              </p>
              {(['A', 'B', 'C'] as const).map(cls => groups[cls].length > 0 && (
                <div key={cls}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-3 mb-1.5">Class {cls} · {groups[cls].length} part{groups[cls].length === 1 ? '' : 's'}</p>
                  {groups[cls].map(({ part, value }) => (
                    <div key={part.id} className="flex items-center gap-3 bg-slate-950 border border-white/10 rounded-xl p-2.5 mb-1.5">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${ABC_STYLE[cls]}`}>{cls}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{part.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{part.stock} on hand</p>
                      </div>
                      <span className="text-sm font-bold text-slate-300 tabular-nums shrink-0">{value > 0 ? money(value) : '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {tab === 'dead' && (
            <>
              {dead.length === 0
                ? <p className="py-10 text-center text-sm text-slate-500 flex flex-col items-center gap-2"><CheckCircle2 size={22} className="text-emerald-400" /> Everything on the shelf sold at least once in 90 days.</p>
                : dead.map(({ part, valueAtCost }) => (
                  <div key={part.id} className="flex items-center gap-3 bg-slate-950 border border-white/10 rounded-xl p-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><Package size={13} className="text-slate-500" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{part.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{part.stock} on hand · no sales in 90 days</p>
                    </div>
                    <span className="text-sm font-bold text-amber-400 tabular-nums shrink-0">{money(valueAtCost)}</span>
                  </div>
                ))}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
