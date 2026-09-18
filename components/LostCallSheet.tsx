import React, { useState } from 'react';
import { X, PhoneOff, Check } from 'lucide-react';
import { LostReason } from '../types';
import { LOST_REASONS } from '../lostCalls';

interface LostCallSheetProps {
  subtitle?: string;                 // who called / what about
  onSave: (reason: LostReason, note: string) => void;
  onSkip?: () => void;               // close without a note (e.g. not a real call)
  onCancel: () => void;              // back to where we were
}

// "Why didn't they book?" — nine taps' worth of reasons, the note is optional except for Other.
export const LostCallSheet: React.FC<LostCallSheetProps> = ({ subtitle, onSave, onSkip, onCancel }) => {
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState('');
  const ready = !!reason && (reason !== 'other' || note.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[270] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full md:max-w-md bg-slate-900 border border-white/10 md:rounded-3xl rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-base flex items-center gap-2"><PhoneOff size={15} className="text-amber-400" /> Не записался — почему?</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onCancel} aria-label="Back" className="p-2 -m-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"><X size={17} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {LOST_REASONS.map(r => (
            <button
              key={r.id}
              onClick={() => setReason(r.id)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[72px] px-2 py-2.5 rounded-2xl border text-center transition-all active:scale-95 ${reason === r.id ? 'bg-amber-500/15 border-amber-400/60 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'}`}
            >
              <span className="text-lg leading-none">{r.emoji}</span>
              <span className="text-[11px] font-bold leading-tight">{r.label}</span>
            </button>
          ))}
        </div>

        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={reason === 'other' ? 'Что случилось? (обязательно)' : 'Что сказал клиент — необязательно'}
          className="mt-3 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
        />

        <div className="flex gap-2.5 mt-4">
          {onSkip && (
            <button onClick={onSkip} className="flex-1 py-3 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-slate-300 hover:text-white transition-all active:scale-95">
              Просто закрыть
            </button>
          )}
          <button
            onClick={() => reason && onSave(reason, note.trim())}
            disabled={!ready}
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={15} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
