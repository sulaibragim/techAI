import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ScrollText, Sun, Moon, PanelRightClose, X, Siren, Check, CircleCheck, ChevronDown,
  ArrowRight, RotateCcw, MessageCircleQuestion, Ban, TriangleAlert,
} from 'lucide-react';
import { useSettingsStore } from '../settingsStore';
import {
  CALL_SCRIPTS, OBJECTIONS, NEVER_SAY, EMERGENCY_911, ScriptId, ObjectionId, ScriptContext,
  resolveScript, ratePrice, isNightInArizona,
} from '../callScripts';

interface CallScriptPanelProps {
  scriptId: ScriptId;
  onScriptChange: (id: ScriptId) => void;
  managerName: string;
  onCollapse?: () => void; // desktop side panel
  onClose?: () => void;    // phone sheet
  className?: string;
}

// A line as the manager says it: live prices in green, [slots] to fill in out loud in amber.
const Say: React.FC<{ text: string; ctx: ScriptContext }> = ({ text, ctx }) => (
  <>
    {resolveScript(text, ctx).map((s, i) =>
      s.kind === 'price' ? <span key={i} className="text-emerald-300 font-bold">{s.value}</span>
        : s.kind === 'slot' ? <span key={i} className="text-amber-300 bg-amber-500/10 rounded px-1">{s.value}</span>
        : <React.Fragment key={i}>{s.value}</React.Fragment>
    )}
  </>
);

const labelCls = 'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest';

// The phone script beside the intake form: the call step by step for the chosen service,
// the live price-book price (day or after 8PM), ready answers and the never-say list.
export const CallScriptPanel: React.FC<CallScriptPanelProps> = ({ scriptId, onScriptChange, managerName, onCollapse, onClose, className = '' }) => {
  const priceBook = useSettingsStore(s => s.priceBook);

  // Follows the Arizona clock until the manager flips it — a rekey booked for tomorrow
  // morning is quoted at the day rate even when the call comes in at 9PM.
  const [clockNight, setClockNight] = useState(() => isNightInArizona());
  const [pickedNight, setPickedNight] = useState<boolean | null>(null);
  useEffect(() => {
    const t = setInterval(() => setClockNight(isNightInArizona()), 60_000);
    return () => clearInterval(t);
  }, []);
  const night = pickedNight ?? clockNight;

  const [stepIdx, setStepIdx] = useState(0);
  const [objection, setObjection] = useState<ObjectionId | null>(null);
  const [showNever, setShowNever] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setStepIdx(0);
    setObjection(null);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scriptId]);

  // Keep the line being said, and an opened answer, on screen.
  useEffect(() => { currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [stepIdx]);
  useEffect(() => { answerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [objection]);

  const script = CALL_SCRIPTS[scriptId];
  const ctx: ScriptContext = { priceBook, night, me: managerName.trim().split(/\s+/)[0] || '' };
  const current = script.steps[stepIdx];
  const answer = objection ? OBJECTIONS[objection] : null;
  const rateCols = script.rates.length >= 3 ? 'grid-cols-3' : script.rates.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className={`flex flex-col min-h-0 overflow-hidden bg-slate-900 border border-white/10 shadow-2xl ${className}`}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center shrink-0">
          <ScrollText size={16} className="text-blue-400" />
        </div>
        <label className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Call script</span>
          <span className="relative block">
            <select
              aria-label="Call script"
              value={scriptId}
              onChange={e => onScriptChange(e.target.value as ScriptId)}
              className="w-full appearance-none bg-transparent pr-5 text-sm font-bold text-white outline-none cursor-pointer truncate [color-scheme:dark]"
            >
              {Object.values(CALL_SCRIPTS).map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </span>
        </label>
        <button
          onClick={() => setPickedNight(!night)}
          title={night ? 'Night rate (after 8PM) — tap for day prices' : 'Day rate — tap for after-8PM prices'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all active:scale-95 ${night ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}
        >
          {night ? <Moon size={12} /> : <Sun size={12} />} {night ? 'After 8PM' : 'Day rate'}
        </button>
        {onCollapse && (
          <button onClick={onCollapse} title="Hide the script" aria-label="Hide the script" className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all shrink-0">
            <PanelRightClose size={17} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close the script" className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all shrink-0">
            <X size={18} />
          </button>
        )}
      </header>

      <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
        <div className={`grid ${rateCols} gap-2`}>
          {script.rates.map(r => (
            <div key={r.id} className="min-w-0 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{r.label}</p>
              <p className="text-lg font-black text-emerald-300 leading-tight tabular-nums">
                {r.from && <span className="text-[10px] font-bold uppercase text-emerald-400/70 mr-1">from</span>}${ratePrice(r, priceBook, night)}
              </p>
              <p className="text-[10px] text-slate-500 tabular-nums truncate">{night ? 'Day' : 'After 8PM'} ${ratePrice(r, priceBook, !night)}</p>
            </div>
          ))}
        </div>

        <ol className="space-y-1">
          {script.steps.map((st, i) => {
            if (i !== stepIdx) {
              const passed = i < stepIdx;
              return (
                <li key={i}>
                  <button
                    onClick={() => setStepIdx(i)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1 rounded-lg text-left text-xs font-semibold transition-colors hover:bg-white/5 ${passed ? 'text-slate-500' : 'text-slate-300'}`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${passed ? 'bg-emerald-500/15 text-emerald-400' : st.alert ? 'border border-amber-500/50 text-amber-300' : 'border border-white/15 text-slate-400'}`}>
                      {passed ? <Check size={11} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="truncate">{st.title}</span>
                  </button>
                </li>
              );
            }
            const last = i === script.steps.length - 1;
            return (
              <li key={i} ref={currentRef} className={`my-1.5 rounded-2xl border p-4 ${st.alert ? 'border-amber-500/50 bg-amber-500/5' : 'border-blue-500/40 bg-blue-500/5'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white ${st.alert ? 'bg-amber-500' : 'bg-blue-600'}`}>{i + 1}</span>
                  <span className={`min-w-0 truncate text-xs font-bold uppercase tracking-wider ${st.alert ? 'text-amber-300' : 'text-blue-300'}`}>{st.title}</span>
                  {st.alert && <TriangleAlert size={13} className="text-amber-400 shrink-0" />}
                </div>
                <p className="mt-2.5 text-[15px] leading-relaxed font-medium text-white"><Say text={st.say} ctx={ctx} /></p>
                {st.hint && <p className="mt-2 text-xs leading-relaxed text-slate-400">{st.hint}</p>}
                {st.call911 && (
                  <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5">
                    <p className={`${labelCls} text-red-300`}><Siren size={12} /> Если да — сначала 911</p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-white">{EMERGENCY_911.say}</p>
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <button onClick={() => setStepIdx(i + 1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider transition-all active:scale-95">
                    {last ? <>Done <Check size={13} /></> : <>Next <ArrowRight size={13} /></>}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {!current && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-bold text-emerald-300"><CircleCheck size={15} /> Все шаги пройдены</span>
            <button onClick={() => setStepIdx(0)} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors">
              <RotateCcw size={12} /> Start over
            </button>
          </div>
        )}

        {script.emergency && !current?.call911 && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3.5">
            <p className={`${labelCls} text-red-300`}><Siren size={13} /> Сначала 911</p>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-white">{EMERGENCY_911.say}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-red-200/70">{EMERGENCY_911.hint}</p>
          </div>
        )}

        <section>
          <p className={`${labelCls} text-slate-400 mb-2`}><MessageCircleQuestion size={13} /> Клиент говорит…</p>
          <div className="flex flex-wrap gap-1.5">
            {script.objections.map(id => (
              <button
                key={id}
                onClick={() => setObjection(o => (o === id ? null : id))}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all active:scale-95 ${objection === id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'}`}
              >
                {OBJECTIONS[id].label}
              </button>
            ))}
          </div>
          {answer && (
            <div ref={answerRef} className="mt-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5 animate-in fade-in">
              <p className="text-sm leading-relaxed font-medium text-white"><Say text={answer.say} ctx={ctx} /></p>
              {answer.hint && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{answer.hint}</p>}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5">
          <button onClick={() => setShowNever(v => !v)} aria-expanded={showNever} className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left">
            <span className={`${labelCls} text-rose-300`}><Ban size={13} /> Нельзя говорить</span>
            <ChevronDown size={14} className={`text-rose-300/70 transition-transform ${showNever ? 'rotate-180' : ''}`} />
          </button>
          {showNever && (
            <ul className="px-3.5 pb-3 space-y-2.5">
              {NEVER_SAY.map(n => (
                <li key={n.bad} className="text-xs leading-snug">
                  <p className="text-rose-300/80 line-through decoration-rose-400/60">{n.bad}</p>
                  <p className="mt-0.5 text-emerald-300">→ {n.good}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
