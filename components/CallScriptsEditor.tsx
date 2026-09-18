import React, { useRef, useState } from 'react';
import { Pencil, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../settingsStore';
import {
  CALL_SCRIPTS, OBJECTIONS, ScriptId, ObjectionId, ScriptContext, ScriptOverrides,
  stepKey, answerKey, honestyWarnings,
} from '../callScripts';
import { Say } from './CallScriptPanel';

type Group = ScriptId | 'answers';

interface Line {
  key: string;
  title: string;
  say: string;   // built-in wording
  hint?: string;
}

const linesOf = (group: Group): Line[] => group === 'answers'
  ? (Object.keys(OBJECTIONS) as ObjectionId[]).map(id => ({ key: answerKey(id), title: OBJECTIONS[id].label, say: OBJECTIONS[id].say, hint: OBJECTIONS[id].hint }))
  : CALL_SCRIPTS[group].steps.map((st, i) => ({ key: stepKey(group, st), title: `${i + 1}. ${st.title}`, say: st.say, hint: st.hint }));

const editedIn = (group: Group, overrides: ScriptOverrides) => linesOf(group).filter(l => overrides[l.key]).length;

const PRICE_TOKEN = /\{price:[a-z0-9-]+\}/;

// The owner rewords the call script after listening to recordings. Blank line = built-in text;
// the check under the box flags the claims we never make (training/03-never-say.md).
export const CallScriptsEditor: React.FC = () => {
  const overrides = useSettingsStore(s => s.scriptOverrides);
  const setOverride = useSettingsStore(s => s.setScriptOverride);
  const resetOverride = useSettingsStore(s => s.resetScriptOverride);
  const priceBook = useSettingsStore(s => s.priceBook);

  const [group, setGroup] = useState<Group>('opening');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftSay, setDraftSay] = useState('');
  const [draftHint, setDraftHint] = useState('');
  const sayRef = useRef<HTMLTextAreaElement>(null);
  const ctx: ScriptContext = { priceBook, night: false, me: 'Anna' };

  const startEdit = (line: Line) => {
    const o = overrides[line.key];
    setEditing(line.key);
    setDraftSay(o?.say || line.say);
    setDraftHint(o?.hint ?? line.hint ?? '');
  };

  const save = (line: Line) => {
    // Saving the built-in text back is a reset — no override left behind to go stale.
    if (draftSay.trim() === line.say && draftHint.trim() === (line.hint || '')) resetOverride(line.key);
    else setOverride(line.key, { say: draftSay, hint: draftHint });
    setEditing(null);
  };

  const insertPrice = (rateId: string) => {
    const el = sayRef.current;
    const token = `{price:${rateId}}`;
    const at = el ? el.selectionStart : draftSay.length;
    const end = el ? el.selectionEnd : draftSay.length;
    setDraftSay(draftSay.slice(0, at) + token + draftSay.slice(end));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 -mt-1 leading-relaxed">
        Фразы, которые менеджер видит справа от New Job. Правьте после прослушки записей.
        {' '}<span className="text-slate-300">{'{me}'}</span> — имя менеджера, <span className="text-emerald-300">{'{price:…}'}</span> — живая цена из прайса (вставляйте кнопкой),
        {' '}<span className="text-amber-300">[слот]</span> — менеджер договаривает сам. Пустая фраза — вернётся текст по умолчанию.
      </p>

      <select
        value={group}
        onChange={e => { setGroup(e.target.value as Group); setEditing(null); }}
        className="w-full md:w-80 bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-semibold text-white outline-none [color-scheme:dark]"
      >
        {Object.values(CALL_SCRIPTS).map(s => {
          const n = editedIn(s.id, overrides);
          return <option key={s.id} value={s.id}>{s.label}{n ? ` · изменено: ${n}` : ''}</option>;
        })}
        <option value="answers">Ответы «Клиент говорит…»{editedIn('answers', overrides) ? ` · изменено: ${editedIn('answers', overrides)}` : ''}</option>
      </select>

      <div className="space-y-2">
        {linesOf(group).map(line => {
          const o = overrides[line.key];
          const say = o?.say || line.say;
          const hint = o?.hint ?? line.hint;
          const isEditing = editing === line.key;
          const warnings = isEditing ? honestyWarnings(draftSay) : [];
          const lostPrice = isEditing && PRICE_TOKEN.test(line.say) && !PRICE_TOKEN.test(draftSay);
          return (
            <div key={line.key} className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{line.title}</span>
                {o && <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5">изменено</span>}
                <span className="flex-1" />
                {!isEditing && (
                  <button onClick={() => startEdit(line)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all" aria-label={`Edit ${line.title}`}>
                    <Pencil size={13} />
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Фраза клиенту (EN)</span>
                    <select
                      value=""
                      onChange={e => { if (e.target.value) insertPrice(e.target.value); }}
                      className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-300 outline-none [color-scheme:dark]"
                    >
                      <option value="">+ Вставить цену…</option>
                      {priceBook.map(r => <option key={r.id} value={r.id}>{r.name} · ${r.price}</option>)}
                    </select>
                  </div>
                  <textarea
                    ref={sayRef}
                    value={draftSay}
                    onChange={e => setDraftSay(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-sm font-medium text-white outline-none focus:border-blue-500/50 resize-y leading-relaxed"
                  />
                  <div className="rounded-lg bg-slate-950/60 border border-white/5 px-3 py-2 text-sm text-slate-200 leading-relaxed">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-2">Так увидит менеджер</span>
                    <Say text={draftSay || line.say} ctx={ctx} />
                  </div>
                  {[...warnings, ...(lostPrice ? ['В фразе больше нет живой цены — при смене прайса она не обновится.'] : [])].map(w => (
                    <p key={w} className="flex items-start gap-1.5 text-[11px] font-semibold text-red-300"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {w}</p>
                  ))}
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">Подсказка менеджеру (RU)</span>
                  <textarea
                    value={draftHint}
                    onChange={e => setDraftHint(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-xs font-medium text-slate-200 outline-none focus:border-blue-500/50 resize-y leading-relaxed"
                  />
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => save(line)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all active:scale-95">
                      <Check size={12} /> Save
                    </button>
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold hover:text-white transition-all active:scale-95">
                      Cancel
                    </button>
                    {o && (
                      <button
                        onClick={() => { resetOverride(line.key); setEditing(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-amber-300 text-[11px] font-bold hover:bg-amber-500/10 transition-all active:scale-95 ml-auto"
                      >
                        <RotateCcw size={12} /> Default
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-slate-200 leading-relaxed"><Say text={say} ctx={ctx} /></p>
                  {hint && <p className="text-xs text-slate-500 leading-relaxed">{hint}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
