import React, { useMemo, useState } from 'react';
import { ListChecks, ChevronDown, AlertTriangle, Hash, MapPin, Clock, Wrench } from 'lucide-react';
import { findProcedure } from '../vehicleKeyLookup';

const StepRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-0.5">
    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
    <p className="text-[11px] text-slate-200 leading-snug">{children}</p>
  </div>
);

// Expandable "how to program" panel for a vehicle. Pulls from the separate
// procedures dataset; renders nothing if there's no match.
export const ProcedureBlock: React.FC<{ make?: string; model?: string; year?: number | null }> = ({ make, model, year }) => {
  const proc = useMemo(() => (make ? findProcedure(make, model, year ?? null) : null), [make, model, year]);
  const [open, setOpen] = useState(false);
  if (!proc) return null;
  const weak = proc.confidence && proc.confidence !== 'verified';
  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-blue-300 hover:bg-white/5 transition-colors">
        <span className="flex items-center gap-2"><ListChecks size={14} /> How to program — step by step</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {proc.onboard && <StepRow label="On-board (DIY, no tool)">{proc.onboard}</StepRow>}
          {proc.addKey && <StepRow label="Add key (1 working key present)">{proc.addKey}</StepRow>}
          {proc.allKeysLost && <StepRow label="All keys lost">{proc.allKeysLost}</StepRow>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><Hash size={11} /> PIN: {proc.pinRequired ? (proc.pinSource || 'required') : 'not required'}</span>
            {proc.obdPort && <span className="flex items-center gap-1"><MapPin size={11} /> {proc.obdPort}</span>}
            {proc.securityWait && <span className="flex items-center gap-1"><Clock size={11} /> {proc.securityWait}</span>}
            {proc.specialTool && <span className="flex items-center gap-1"><Wrench size={11} /> {proc.specialTool}</span>}
          </div>
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
            <span className="text-[10px] text-amber-200">
              Verify against your programmer's guided procedure before performing.{weak ? ' Lower-confidence row — double-check.' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
