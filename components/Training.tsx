import React, { useState } from 'react';
import {
  GraduationCap, BookOpen, ScrollText, Ban, ClipboardCheck, PhoneCall, Users, CheckCircle2, XCircle,
  RotateCcw, ArrowRight, Trophy, AlertTriangle, ChevronDown,
} from 'lucide-react';
import kbDoc from '../training/01-knowledge-base.md?raw';
import scriptsDoc from '../training/02-call-scripts.md?raw';
import neverDoc from '../training/03-never-say.md?raw';
import { Markdown } from './Markdown';
import { useSettingsStore } from '../settingsStore';
import { useAuthStore, useCurrentUser } from '../authStore';
import { buildQuiz, QuizQuestion } from '../trainingQuiz';
import { RULE_QUESTIONS, ROLE_PLAYS, RolePlay } from '../trainingContent';
import { CALL_SCRIPTS } from '../callScripts';
import { TrainingResult } from '../types';
import { formatDate } from '../dateUtils';

type Section = 'kb' | 'scripts' | 'never' | 'test' | 'roleplay' | 'team';

const KIND_LABEL: Record<QuizQuestion['kind'], string> = { price: 'Цена', zone: 'Зона', rule: 'Правило' };
// Local calendar day — a test passed at 9PM in Arizona is already tomorrow in UTC.
const dateOf = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return formatDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
};

// The phone desk's school: the knowledge base to read, the admission test to pass (every
// answer right), ten practice calls to run with a colleague — and, for the owner, who is ready.
export const Training: React.FC = () => {
  const me = useCurrentUser();
  const results = useSettingsStore(s => s.trainingResults);
  const saveResult = useSettingsStore(s => s.saveTrainingResult);
  const [section, setSection] = useState<Section>('kb');
  const mine: TrainingResult | undefined = me ? results[me.id] : undefined;
  const practised = Object.keys(mine?.roleplays || {}).length;

  const save = (patch: Partial<TrainingResult>) => {
    if (!me) return;
    const base: TrainingResult = mine || { attempts: 0, bestScore: 0, total: 0, lastAt: new Date().toISOString() };
    saveResult(me.id, { ...base, ...patch });
  };

  const onQuizDone = (score: number, total: number) => {
    const now = new Date().toISOString();
    save({
      attempts: (mine?.attempts || 0) + 1,
      bestScore: Math.max(mine?.bestScore || 0, score),
      total,
      lastAt: now,
      passedAt: mine?.passedAt || (score === total ? now : undefined),
    });
  };

  const toggleRoleplay = (id: string) => {
    const next = { ...(mine?.roleplays || {}) };
    if (next[id]) delete next[id];
    else next[id] = new Date().toISOString();
    save({ roleplays: next });
  };

  const tabs: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'kb', label: 'База знаний', icon: BookOpen },
    { id: 'scripts', label: 'Скрипты', icon: ScrollText },
    { id: 'never', label: 'Нельзя говорить', icon: Ban },
    { id: 'test', label: 'Тест-допуск', icon: ClipboardCheck },
    { id: 'roleplay', label: 'Учебные звонки', icon: PhoneCall },
    ...(me?.role === 'owner' ? [{ id: 'team' as const, label: 'Команда', icon: Users }] : []),
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <GraduationCap className="text-blue-400" size={28} /> Обучение
          </h2>
          <p className="text-sm text-slate-400 mt-1">Для тех, кто на телефоне: что знать, что говорить, и допуск к звонкам.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${mine?.passedAt ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
            {mine?.passedAt ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {mine?.passedAt ? `Допуск получен ${dateOf(mine.passedAt)}` : mine?.attempts ? `Тест не сдан · лучший ${mine.bestScore}/${mine.total}` : 'Тест ещё не пройден'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white/5 border-white/10 text-xs font-bold text-slate-300">
            <PhoneCall size={14} /> Учебные звонки {practised}/{ROLE_PLAYS.length}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 p-1 rounded-2xl border border-white/10 overflow-x-auto scrollbar-hide">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${section === t.id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="bg-slate-900 rounded-3xl border border-white/10 p-5 md:p-8">
        {section === 'kb' && <Markdown src={kbDoc} />}
        {section === 'scripts' && <Markdown src={scriptsDoc} />}
        {section === 'never' && <Markdown src={neverDoc} />}
        {section === 'test' && <QuizView result={mine} onDone={onQuizDone} />}
        {section === 'roleplay' && <RolePlays done={mine?.roleplays || {}} onToggle={toggleRoleplay} />}
        {section === 'team' && <Team />}
      </div>
    </div>
  );
};

const QuizView: React.FC<{ result?: TrainingResult; onDone: (score: number, total: number) => void }> = ({ result, onDone }) => {
  const priceBook = useSettingsStore(s => s.priceBook);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<QuizQuestion[]>([]);
  const [finished, setFinished] = useState(false);

  const start = () => {
    setQuiz(buildQuiz(priceBook, RULE_QUESTIONS));
    setIdx(0); setPicked(null); setWrong([]); setFinished(false);
  };

  if (!quiz) {
    return (
      <div className="max-w-xl space-y-4">
        <h3 className="text-xl font-bold text-white">Тест-допуск</h3>
        <p className="text-sm text-slate-300 leading-relaxed">
          21 вопрос: цены из прайса CRM (днём и после 8PM), куда мы ездим и как отвечать на трудные вопросы.
          Допуск к звонкам — только если <b className="text-white">все ответы верные</b>. Ошибся — посмотри, почему, и пройди заново: вопросы каждый раз другие.
        </p>
        {result?.attempts ? (
          <p className="text-xs text-slate-500">Попыток: {result.attempts} · лучший результат {result.bestScore}/{result.total}{result.passedAt ? ` · допуск ${dateOf(result.passedAt)}` : ''}</p>
        ) : null}
        <button onClick={start} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all active:scale-95">
          <ClipboardCheck size={16} /> {result?.attempts ? 'Пройти ещё раз' : 'Начать тест'}
        </button>
      </div>
    );
  }

  if (finished) {
    const score = quiz.length - wrong.length;
    const passed = wrong.length === 0;
    return (
      <div className="space-y-5">
        <div className={`flex items-center gap-4 p-5 rounded-2xl border ${passed ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          {passed ? <Trophy size={32} className="text-emerald-300 shrink-0" /> : <AlertTriangle size={32} className="text-amber-300 shrink-0" />}
          <div>
            <p className={`text-lg font-extrabold ${passed ? 'text-emerald-200' : 'text-amber-200'}`}>{passed ? 'Допуск получен' : 'Пока без допуска'}</p>
            <p className="text-sm text-slate-300">{score} из {quiz.length} верно{passed ? ' — можно брать звонки.' : '. Разбери ошибки ниже и пройди заново.'}</p>
          </div>
        </div>
        {wrong.map(q => (
          <div key={q.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
            <p className="text-sm font-semibold text-white">{q.q}</p>
            <p className="text-sm text-emerald-300 flex items-start gap-1.5"><CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {q.options[q.correct]}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{q.why}</p>
          </div>
        ))}
        <button onClick={start} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all active:scale-95">
          <RotateCcw size={16} /> Пройти ещё раз
        </button>
      </div>
    );
  }

  const q = quiz[idx];
  const answered = picked !== null;
  const next = () => {
    const nowWrong = picked !== q.correct ? [...wrong, q] : wrong;
    setWrong(nowWrong);
    if (idx + 1 < quiz.length) { setIdx(idx + 1); setPicked(null); }
    else { setFinished(true); onDone(quiz.length - nowWrong.length, quiz.length); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-slate-400 tabular-nums">Вопрос {idx + 1} из {quiz.length}</span>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(idx / quiz.length) * 100}%` }} /></div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-lg px-2 py-0.5">{KIND_LABEL[q.kind]}</span>
      </div>
      <p className="text-lg font-bold text-white leading-snug">{q.q}</p>
      <div className="space-y-2">
        {q.options.map((o, i) => {
          const state = !answered ? 'idle' : i === q.correct ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => setPicked(i)}
              className={`w-full flex items-start gap-3 text-left px-4 py-3 rounded-2xl border text-sm font-medium leading-relaxed transition-all ${
                state === 'idle' ? 'bg-white/5 border-white/10 text-slate-200 hover:border-blue-500/50 hover:text-white active:scale-[0.99]'
                  : state === 'right' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-100'
                  : state === 'wrong' ? 'bg-red-500/10 border-red-500/50 text-red-100'
                  : 'bg-white/5 border-white/5 text-slate-500'
              }`}
            >
              {state === 'right' ? <CheckCircle2 size={17} className="text-emerald-400 shrink-0 mt-0.5" />
                : state === 'wrong' ? <XCircle size={17} className="text-red-400 shrink-0 mt-0.5" />
                : <span className="w-[17px] h-[17px] rounded-full border border-white/20 shrink-0 mt-0.5" />}
              {o}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="space-y-4 animate-in fade-in">
          <p className={`text-sm leading-relaxed rounded-2xl px-4 py-3 border ${picked === q.correct ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100' : 'bg-red-500/5 border-red-500/20 text-red-100'}`}>
            <b>{picked === q.correct ? 'Верно. ' : 'Неверно. '}</b>{q.why}
          </p>
          <button onClick={next} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all active:scale-95">
            {idx + 1 < quiz.length ? <>Дальше <ArrowRight size={16} /></> : <>Результат <ArrowRight size={16} /></>}
          </button>
        </div>
      )}
    </div>
  );
};

const RolePlays: React.FC<{ done: Record<string, string>; onToggle: (id: string) => void }> = ({ done, onToggle }) => {
  const [open, setOpen] = useState<string | null>(ROLE_PLAYS[0]?.id ?? null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
        Звоните друг другу: один — клиент (читает «Кто звонит» и говорит по-английски), другой — менеджер со скриптом в New Job.
        Потом вместе пройдите чек-лист. Лучше — записать и послушать.
      </p>
      {ROLE_PLAYS.map((rp, i) => (
        <RolePlayCard key={rp.id} n={i + 1} rp={rp} open={open === rp.id} doneAt={done[rp.id]} onOpen={() => setOpen(open === rp.id ? null : rp.id)} onToggle={() => onToggle(rp.id)} />
      ))}
    </div>
  );
};

const RolePlayCard: React.FC<{ n: number; rp: RolePlay; open: boolean; doneAt?: string; onOpen: () => void; onToggle: () => void }> = ({ n, rp, open, doneAt, onOpen, onToggle }) => {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  return (
    <div className={`rounded-2xl border ${doneAt ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
      <button onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${doneAt ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300'}`}>{doneAt ? <CheckCircle2 size={15} /> : n}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white truncate">{rp.title}</span>
          <span className="block text-[11px] text-slate-500">Скрипт: {CALL_SCRIPTS[rp.script]?.label}{doneAt ? ` · отработан ${dateOf(doneAt)}` : ''}</span>
        </span>
        <ChevronDown size={16} className={`text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 text-sm">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Кто звонит — для «клиента»</p>
              <p className="text-slate-300 leading-relaxed">{rp.caller}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pt-1">Первая фраза</p>
              <p className="text-white font-medium leading-relaxed">“{rp.opening}”</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pt-1">По ходу звонка</p>
              <ul className="space-y-1">{rp.twists.map((t, i) => <li key={i} className="text-slate-200 leading-relaxed">“{t}”</li>)}</ul>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Менеджер должен</p>
              <ul className="space-y-1.5">
                {rp.mustDo.map((m, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!checked[i]} onChange={e => setChecked({ ...checked, [i]: e.target.checked })} className="mt-1 accent-emerald-500" />
                      <span className={`leading-relaxed ${checked[i] ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{m}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 pt-1">Нельзя</p>
              <ul className="space-y-1">{rp.traps.map((t, i) => <li key={i} className="text-red-200/90 leading-relaxed flex gap-1.5"><Ban size={13} className="shrink-0 mt-1 text-red-400" /> {t}</li>)}</ul>
            </div>
          </div>
          <button
            onClick={onToggle}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${doneAt ? 'bg-white/5 border border-white/10 text-slate-300 hover:text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
          >
            {doneAt ? <><RotateCcw size={14} /> Снять отметку</> : <><CheckCircle2 size={14} /> Отработал этот звонок</>}
          </button>
        </div>
      )}
    </div>
  );
};

const Team: React.FC = () => {
  const users = useAuthStore(s => s.users);
  const results = useSettingsStore(s => s.trainingResults);
  const desk = users.filter(u => u.active && (u.role === 'manager' || u.role === 'owner'));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Кто готов брать звонки: тест сдан на 100% и учебные звонки отработаны.</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/10">
              <th className="text-left py-2.5 px-2">Сотрудник</th>
              <th className="text-left py-2.5 px-2">Тест-допуск</th>
              <th className="text-right py-2.5 px-2">Попыток</th>
              <th className="text-right py-2.5 px-2">Учебные звонки</th>
            </tr>
          </thead>
          <tbody>
            {desk.map(u => {
              const r = results[u.id];
              const calls = Object.keys(r?.roleplays || {}).length;
              return (
                <tr key={u.id} className="border-b border-white/5">
                  <td className="py-3 px-2"><span className="font-semibold text-white">{u.name}</span> <span className="text-[11px] text-slate-500">{u.role === 'owner' ? 'owner' : 'manager'}</span></td>
                  <td className="py-3 px-2">
                    {r?.passedAt ? <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold"><CheckCircle2 size={14} /> сдан {dateOf(r.passedAt)}</span>
                      : r?.attempts ? <span className="text-amber-300 font-semibold">не сдан · лучший {r.bestScore}/{r.total}</span>
                      : <span className="text-slate-500">не проходил</span>}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-slate-300">{r?.attempts || 0}</td>
                  <td className="py-3 px-2 text-right tabular-nums font-semibold text-white">{calls}/{ROLE_PLAYS.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
