import React, { useMemo, useState } from 'react';
import { Headphones, Star, Check, X, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../settingsStore';
import { useAuthStore, useCurrentUser } from '../authStore';
import { SCORECARD, Score, scoreCall, reviewComplete, PASS_PCT } from '../scorecard';
import { formatDate } from '../dateUtils';

const localDay = (iso: string) => {
  const d = new Date(iso);
  return formatDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
};

export const pctTone = (pct: number, passed: boolean) => passed ? 'text-emerald-300' : pct >= 70 ? 'text-amber-300' : 'text-red-300';

// Listening to recorded calls on the 12-point card: the weekly coaching loop (5 calls a week
// and every call that didn't book). One thing done well, one thing to fix.
export const CallReviews: React.FC = () => {
  const me = useCurrentUser();
  const users = useAuthStore(s => s.users);
  const reviews = useSettingsStore(s => s.callReviews);
  const addReview = useSettingsStore(s => s.addCallReview);
  const removeReview = useSettingsStore(s => s.removeCallReview);
  const desk = useMemo(() => users.filter(u => u.active && (u.role === 'manager' || u.role === 'owner')), [users]);

  const [managerId, setManagerId] = useState(me?.role === 'manager' ? me.id : (desk.find(u => u.role === 'manager')?.id || me?.id || ''));
  const [callRef, setCallRef] = useState('');
  const [scores, setScores] = useState<(Score | undefined)[]>(() => SCORECARD.map(() => undefined));
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState('');

  const complete = reviewComplete(scores);
  const live = scoreCall(scores.map(s => (s === undefined ? null : s)));
  const nameOf = (id: string) => users.find(u => u.id === id)?.name || '—';

  const save = () => {
    if (!complete || !managerId) return;
    addReview({ managerId, reviewerId: me?.id, scores: scores as Score[], note: note.trim() || undefined, callRef: callRef.trim() || undefined });
    setScores(SCORECARD.map(() => undefined));
    setNote(''); setCallRef('');
    setFlash('Разбор сохранён');
    setTimeout(() => setFlash(''), 3000);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
        Слушайте записи в OpenPhone: 5 звонков в неделю и каждый, где клиент не записался. Оцените по 12 пунктам —
        0 не было, 1 частично, 2 отлично. Хороший звонок — от {PASS_PCT}% и ни одного провала по пунктам со звёздочкой.
        В заметке: одно, что получилось, и одно, что исправить.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Чей звонок</span>
          <select value={managerId} onChange={e => setManagerId(e.target.value)} className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-semibold text-white outline-none [color-scheme:dark]">
            {desk.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Какой звонок</span>
          <input value={callRef} onChange={e => setCallRef(e.target.value)} placeholder="Номер или время записи в OpenPhone" className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" />
        </label>
      </div>

      <div className="space-y-1.5">
        {SCORECARD.map((item, i) => (
          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white flex items-center gap-1.5">
                {i + 1}. {item.label} {item.critical && <Star size={12} className="text-red-400 fill-red-400" aria-label="критичный пункт" />}
              </p>
              <p className="text-xs text-slate-400">{item.hint}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {([0, 1, 2] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setScores(s => s.map((x, j) => (j === i ? v : x)))}
                  className={`w-10 py-1.5 rounded-lg border text-sm font-bold transition-all active:scale-95 ${scores[i] === v
                    ? v === 0 ? 'bg-red-500/20 border-red-400/60 text-red-200' : v === 1 ? 'bg-amber-500/20 border-amber-400/60 text-amber-200' : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                >{v}</button>
              ))}
              {item.optional ? (
                <button
                  onClick={() => setScores(s => s.map((x, j) => (j === i ? null : x)))}
                  title="Не было нужно"
                  className={`w-12 py-1.5 rounded-lg border text-xs font-bold transition-all active:scale-95 ${scores[i] === null ? 'bg-slate-500/30 border-slate-400/60 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                >н/п</button>
              ) : <span aria-hidden className="hidden sm:block w-12" />}
            </div>
          </div>
        ))}
      </div>

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Что было хорошо — и что исправить в следующий раз"
        className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500/50 resize-y"
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-lg font-extrabold tabular-nums ${live.max ? pctTone(live.pct, live.passed) : 'text-slate-500'}`}>
          {live.max ? `${live.pct}%` : '—'} <span className="text-xs font-semibold text-slate-500">{live.points}/{live.max}</span>
        </span>
        {live.criticalMisses.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-red-300"><AlertTriangle size={13} /> Провал: {live.criticalMisses.join(', ')}</span>
        )}
        <span className="flex-1" />
        {flash && <span className="text-xs font-semibold text-emerald-300">{flash}</span>}
        <button onClick={save} disabled={!complete || !managerId} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
          <Check size={15} /> Сохранить разбор
        </button>
      </div>

      {reviews.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><Headphones size={12} /> Последние разборы</p>
          {reviews.slice(0, 20).map(r => {
            const s = scoreCall(r.scores);
            return (
              <div key={r.id} className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className={`text-base font-extrabold tabular-nums w-14 shrink-0 ${pctTone(s.pct, s.passed)}`}>{s.pct}%</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{nameOf(r.managerId)} <span className="text-xs font-medium text-slate-500">· {localDay(r.timestamp)}{r.callRef ? ` · ${r.callRef}` : ''}</span></p>
                  {s.criticalMisses.length > 0 && <p className="text-xs font-semibold text-red-300">Провал: {s.criticalMisses.join(', ')}</p>}
                  {r.note && <p className="text-xs text-slate-400 leading-relaxed">{r.note}</p>}
                </div>
                {me?.role === 'owner' && (
                  <button onClick={() => removeReview(r.id)} aria-label="Удалить разбор" className="p-1 rounded-lg text-slate-500 hover:text-red-300 hover:bg-white/5"><X size={14} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
