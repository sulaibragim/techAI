import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Lock } from 'lucide-react';

// Cut codes (bitting from VIN) and immobilizer PINs are legally gated — they require a
// NASTF Vehicle Security Professional (VSP) credential and are tied to the registered
// owner. We NEVER store them; this just links the tech out to the official portal to
// request per job. Surfaced on the key card / inside a job.
const LINKS = [
  { label: 'NASTF SDRM portal — request OEM key code / PIN', url: 'https://sdrm.nastfsecurityregistry.org/' },
  { label: 'NASTF — become / manage a VSP credential', url: 'https://wp.nastf.org/?page_id=367' },
];

export const GatedCodesBlock: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-amber-300 hover:bg-white/5 transition-colors">
        <span className="flex items-center gap-2"><Lock size={13} /> Cut code / PIN — NASTF (gated)</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-slate-400 leading-snug">
            OEM cut codes & immobilizer PINs are <span className="text-amber-300">gated</span> — NASTF rules require your VSP credential and tie each request to the registered owner. This app never stores them; request per job:
          </p>
          {LINKS.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg px-3 py-2 text-[11px] font-semibold text-blue-300 transition-colors">
              {l.label} <ExternalLink size={12} className="shrink-0" />
            </a>
          ))}
          <p className="text-[10px] text-slate-500">Verify vehicle ownership before obtaining or using any code.</p>
        </div>
      )}
    </div>
  );
};
