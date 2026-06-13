import React, { useMemo } from 'react';
import { KeyRound, AlertTriangle, CircleCheck, Bot, Gauge, Plus, BadgeCheck } from 'lucide-react';
import { findKeyProfiles, stockForKeyway } from '../vehicleKeyLookup';
import { useAppStore } from '../store';
import { useVehicleKeyStore, profileKey } from '../vehicleKeyStore';
import { ProcedureBlock } from './ProcedureBlock';
import { GatedCodesBlock } from './GatedCodesBlock';
import type { VehicleKeyProfile } from '../types';

// Embeddable compact key card for a job's vehicle. Lives in the Job Wizard (preview)
// and Job Detail (with "add to invoice"). Derives the lookup from the job's brand +
// model/year string the tech already enters.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isOwned = (hint: string, owned: string[]) =>
  owned.some((o) => { const a = norm(o), b = norm(hint); return a && (a.includes(b) || b.includes(a)); });

function parseModelYear(s?: string): { year: number | null; model: string } {
  if (!s) return { year: null, model: '' };
  const m = s.match(/(19|20)\d{2}/);
  return { year: m ? parseInt(m[0], 10) : null, model: s.replace(/(19|20)\d{2}/, '').trim() };
}

function difficulty(p: VehicleKeyProfile): { label: string; cls: string } {
  const txt = `${p.programming || ''} ${p.notes || ''}`.toLowerCase();
  if (/fbs4|bdc2|bench|eeprom|dealer-only|dealer only|no aftermarket/.test(txt)) return { label: 'Dealer / bench', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
  if (p.pinRequired || /akl|all-keys-lost|\bsgw\b|incode/.test(txt)) return { label: 'Hard', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  if (p.variants.some((v) => v.keyType === 'Smart')) return { label: 'Medium', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
  return { label: 'Easy', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
}

interface Props {
  make?: string;
  modelOrYear?: string;
  onAddToInvoice?: (items: { type: 'part' | 'labor'; description: string; unitPrice: number }[]) => void;
}

export const AutoKeyPanel: React.FC<Props> = ({ make, modelOrYear, onAddToInvoice }) => {
  const inventory = useAppStore((s) => s.inventory);
  const programmingFee = useVehicleKeyStore((s) => s.programmingFee);
  const ownedProgrammers = useVehicleKeyStore((s) => s.ownedProgrammers);
  const confirmations = useVehicleKeyStore((s) => s.confirmations);
  const { year, model } = useMemo(() => parseModelYear(modelOrYear), [modelOrYear]);
  const profiles = useMemo(
    () => (make ? findKeyProfiles({ make, model: model || undefined, year }) : []),
    [make, model, year]
  );

  if (!make) {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 text-center">
        <KeyRound size={20} className="mx-auto text-blue-400/60 mb-1" />
        <p className="text-xs text-slate-400">Pick a make &amp; model/year above to see key, chip & programming info.</p>
      </div>
    );
  }

  const p = profiles[0];
  if (!p) {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 text-center">
        <Bot size={20} className="mx-auto text-slate-500 mb-1" />
        <p className="text-xs text-slate-400">No key data for “{make} {modelOrYear}” yet — open the Auto-Key tab to search, or look it up the usual way.</p>
      </div>
    );
  }

  const v = p.variants[0];
  const diff = difficulty(p);
  const confirmed = !!confirmations[profileKey(p)]?.confirmed;
  const isWeak = p.confidence === 'unverified' || p.confidence === 'ai' || p.confidence === 'single-source';
  const stock = stockForKeyway(v?.keyway, inventory);
  const inStock = stock.reduce((n, x) => n + x.stock, 0);

  const addToInvoice = () => {
    if (!onAddToInvoice) return;
    const blankPart = stock[0];
    const items: { type: 'part' | 'labor'; description: string; unitPrice: number }[] = [];
    items.push({
      type: 'part',
      description: blankPart ? blankPart.name : `Key / blank — ${[v?.keyway, v?.bladeIlco].filter(Boolean).join(' ') || p.make + ' ' + p.model}`,
      unitPrice: blankPart ? blankPart.price : 0,
    });
    items.push({
      type: 'labor',
      description: `Key programming — ${p.make} ${p.model}${p.immobilizer ? ` (${p.immobilizer})` : ''}`,
      unitPrice: programmingFee,
    });
    onAddToInvoice(items);
  };

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400">
          <KeyRound size={15} /> Key info
          {profiles.length > 1 && <span className="text-slate-500 normal-case tracking-normal">+{profiles.length - 1} more — see Auto-Key tab</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border ${diff.cls}`}>{diff.label}</span>
          {confirmed ? (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border text-emerald-400 bg-emerald-500/10 border-emerald-500/30"><BadgeCheck size={11} /> You</span>
          ) : isWeak ? (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border text-rose-400 bg-rose-500/10 border-rose-500/30"><Bot size={11} /> verify</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border text-emerald-400 bg-emerald-500/10 border-emerald-500/30"><CircleCheck size={11} /> verified</span>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {v?.keyway && <Row label="Keyway / blade">{[v.keyway, v.bladeIlco].filter(Boolean).join(' · ')}</Row>}
        {v?.transponderChip && <Row label="Chip">{v.transponderChip}{v.chipClonable ? ` · ${v.chipClonable === 'no' ? 'OBD only' : v.chipClonable === 'token' ? 'token clone' : 'clonable'}` : ''}</Row>}
        {(v?.fccId || v?.partNumber) && <Row label="FCC · part">{[v.fccId, v.partNumber].filter(Boolean).join(' · ')}</Row>}
        {v?.frequency && <Row label="Frequency">{String(v.frequency).replace(/\s*mhz\s*$/i, '')} MHz</Row>}
        {p.immobilizer && <Row label="Immobilizer">{p.immobilizer}{p.pinRequired ? ' · PIN' : ''}</Row>}
        {p.programmerHint?.length ? (
          <Row label="Program with">
            {p.programmerHint.map((h, i) => (
              <span key={i} className={isOwned(h, ownedProgrammers) ? 'text-emerald-400 font-bold' : ''}>{isOwned(h, ownedProgrammers) ? '✓ ' : ''}{h}{i < p.programmerHint!.length - 1 ? ' · ' : ''}</span>
            ))}
          </Row>
        ) : null}
        <Row label="In stock">
          {inStock > 0 ? <span className="text-emerald-400">{inStock}× {stock[0]?.sku}</span> : <span className="text-amber-400">none — order {v?.bladeIlco || v?.keyway}</span>}
        </Row>
      </div>

      {p.programming && <p className="text-[11px] text-slate-400 leading-snug"><span className="text-slate-500">How:</span> {p.programming}</p>}

      <ProcedureBlock make={p.make} model={p.model} year={year} />
      <GatedCodesBlock />

      {isWeak && !confirmed && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-1.5">
          <AlertTriangle size={13} className="text-rose-400 mt-0.5 shrink-0" />
          <span className="text-[10px] text-rose-200">Verify chip & FCC on the actual fob before cutting.</span>
        </div>
      )}

      {onAddToInvoice && (
        <button onClick={addToInvoice} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors active:scale-95">
          <Plus size={14} /> Add key + programming to invoice
        </button>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-2 py-0.5 border-t border-white/5 first:border-0">
    <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">{label}</span>
    <span className="font-semibold text-slate-200 text-right">{children}</span>
  </div>
);
