import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, ScanLine, Loader2, CheckCircle2, AlertTriangle, Sparkles, Plus, Package } from 'lucide-react';
import { Part } from '../types';
import {
  fileToInvoiceImage, parseInvoiceImage, matchInvoiceLine,
  ParsedInvoice, InvoiceLine, MatchConfidence,
} from '../invoiceAI';

// AI invoice import flow: photo → Gemini extracts lines → each line is matched to a
// part by identifier/alias/fuzzy-name → the human reviews (fixing anything fuzzy) →
// one tap receives everything into stock. Confirmed matches teach the alias map, so
// the NEXT invoice from this supplier matches those codes automatically.

export interface ReviewLine extends InvoiceLine {
  partId: string | null;      // null + createNew=false → skipped
  confidence: MatchConfidence;
  createNew: boolean;
}

const CONF_BADGE: Record<MatchConfidence, { label: string; cls: string }> = {
  exact: { label: 'ID match', cls: 'bg-emerald-500/15 text-emerald-400' },
  alias: { label: 'Known code', cls: 'bg-blue-500/15 text-blue-400' },
  fuzzy: { label: 'Best guess — check', cls: 'bg-amber-500/15 text-amber-400' },
  none:  { label: 'No match', cls: 'bg-slate-500/15 text-slate-400' },
};

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const InvoiceImportModal: React.FC<{
  inventory: Part[];
  supplierAliases: Record<string, string>;
  importedInvoices: string[];
  aiAvailable: boolean;
  onClose: () => void;
  onConfirm: (args: { supplier: string; invoiceNumber: string; lines: ReviewLine[] }) => void;
}> = ({ inventory, supplierAliases, importedInvoices, aiAvailable, onClose, onConfirm }) => {
  const [phase, setPhase] = useState<'pick' | 'parsing' | 'review' | 'error'>('pick');
  const [error, setError] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const isDuplicate = invoiceNumber && importedInvoices.includes(invoiceNumber);

  const handleFile = async (f: File) => {
    setPhase('parsing');
    setError('');
    try {
      const img = await fileToInvoiceImage(f);
      const parsed: ParsedInvoice = await parseInvoiceImage(img);
      if (parsed.lines.length === 0) {
        setError("Couldn't find any product lines on that photo. Try a sharper shot of the invoice.");
        setPhase('error');
        return;
      }
      setSupplier(parsed.supplier);
      setInvoiceNumber(parsed.invoiceNumber);
      setLines(parsed.lines.map(l => {
        const m = matchInvoiceLine(l, inventory, parsed.supplier, supplierAliases);
        return { ...l, partId: m.partId, confidence: m.confidence, createNew: m.confidence === 'none' };
      }));
      setPhase('review');
    } catch (e: any) {
      setError(e?.message || 'AI could not read the invoice.');
      setPhase('error');
    }
  };

  const setLine = (i: number, patch: Partial<ReviewLine>) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const actionable = lines.filter(l => l.partId || l.createNew);
  const total = actionable.reduce((a, l) => a + l.qty * l.unitCost, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><ScanLine size={20} className="text-purple-400" /> Scan Invoice</h3>
        <p className="text-xs text-slate-500 mb-5">Photo of a supplier invoice → AI reads the lines → you confirm → stock received.</p>

        {phase === 'pick' && (
          <div className="space-y-4">
            {!aiAvailable && (
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <AlertTriangle size={14} className="shrink-0" /> AI is not configured on the server — invoice scanning is unavailable.
              </p>
            )}
            <button
              disabled={!aiAvailable}
              onClick={() => fileRef.current?.click()}
              className="w-full py-14 rounded-2xl border-2 border-dashed border-white/15 hover:border-purple-500/50 text-slate-400 hover:text-white transition-all flex flex-col items-center gap-3 disabled:opacity-40"
            >
              <Sparkles size={28} className="text-purple-400" />
              <span className="text-sm font-bold">Take / choose a photo of the invoice</span>
              <span className="text-xs text-slate-500">JPG · PNG — one page at a time</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {phase === 'parsing' && (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-purple-400" />
            <p className="text-sm font-semibold">Дурачок reads the invoice…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <AlertTriangle size={28} className="text-amber-400" />
            <p className="text-sm font-semibold text-slate-300 text-center max-w-sm">{error}</p>
            <button onClick={() => setPhase('pick')} className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-white">Try again</button>
          </div>
        )}

        {phase === 'review' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Supplier</label>
                <input value={supplier} onChange={e => setSupplier(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-purple-500/50" placeholder="ABC Key Supply" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Invoice #</label>
                <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-purple-500/50" placeholder="INV-0001" />
              </div>
            </div>

            {isDuplicate && (
              <p className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <AlertTriangle size={14} className="shrink-0" /> Invoice #{invoiceNumber} was already received before — receiving it again will double the stock.
              </p>
            )}

            <div className="space-y-2">
              {lines.map((l, i) => {
                const badge = CONF_BADGE[l.confidence];
                return (
                  <div key={i} className="bg-slate-950 border border-white/10 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white leading-tight">{l.description || l.code}</p>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {l.code ? `code ${l.code} · ` : ''}{l.qty} × {money(l.unitCost)} = {money(l.qty * l.unitCost)}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={l.createNew ? '__new__' : (l.partId || '')}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__new__') setLine(i, { createNew: true, partId: null });
                          else if (v === '') setLine(i, { createNew: false, partId: null });
                          else setLine(i, { createNew: false, partId: v, confidence: l.confidence === 'none' ? 'fuzzy' : l.confidence });
                        }}
                        className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-purple-500/50 appearance-none truncate"
                      >
                        <option value="">— skip this line —</option>
                        <option value="__new__">＋ Create new part</option>
                        {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                      {l.createNew ? <Plus size={16} className="text-purple-400 shrink-0" />
                        : l.partId ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        : <Package size={16} className="text-slate-600 shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-sm text-slate-400">{actionable.length} of {lines.length} lines will be received</span>
              <span className="text-xl font-black text-white">{money(total)}</span>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPhase('pick')} className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm">Rescan</button>
              <button
                onClick={() => onConfirm({ supplier: supplier.trim(), invoiceNumber: invoiceNumber.trim(), lines: actionable })}
                disabled={actionable.length === 0}
                className="flex-1 px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/20 text-white font-bold active:scale-95 disabled:opacity-50"
              >
                Receive {money(total)}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
