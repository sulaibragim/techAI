import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  KeyRound, Plus, ChevronLeft, Trash2, AlertTriangle, CircleCheck,
  Info, Building2, ChevronDown, ChevronRight, DoorClosed, Wand2, Package,
} from 'lucide-react';
import { useMasterKeyStore } from '../masterKeyStore';
import {
  BRAND_PRESETS, presetFor, calcPinning, findInterchange, formatBitting,
  suggestBitting, pinSummary,
  type MasterKeyBrand, type PinningWarning,
} from '../masterKeyUtils';
import type { MasterKeyDoorStatus } from '../types';
import { CylinderDiagram } from './CylinderDiagram';

const STATUS: Record<MasterKeyDoorStatus, { label: string; dot: string; next: MasterKeyDoorStatus }> = {
  planned:    { label: 'не начато', dot: 'bg-slate-500',   next: 'inProgress' },
  inProgress: { label: 'в работе',  dot: 'bg-blue-400',    next: 'pinned' },
  pinned:     { label: 'пиновано',  dot: 'bg-emerald-400', next: 'planned' },
};

const WARN_STYLE: Record<PinningWarning['level'], { cls: string; Icon: React.ComponentType<{ size?: number }> }> = {
  error: { cls: 'text-rose-400',   Icon: AlertTriangle },
  warn:  { cls: 'text-amber-400',  Icon: AlertTriangle },
  info:  { cls: 'text-slate-400',  Icon: Info },
};

const Card: React.FC<{ label?: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={`bg-slate-800/50 border border-white/10 rounded-2xl p-4 ${className}`}>
    {label && <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">{label}</div>}
    {children}
  </div>
);

/** Tap a slot, pick a depth from a row of big targets — works with gloves on. */
const BittingRow: React.FC<{
  bitting: (number | null)[];
  minDepth: number;
  maxDepth: number;
  openIndex: number | null;
  onOpen: (i: number | null) => void;
  onPick: (i: number, d: number | null) => void;
}> = ({ bitting, minDepth, maxDepth, openIndex, onOpen, onPick }) => {
  const depths = Array.from({ length: maxDepth - minDepth + 1 }, (_, i) => minDepth + i);
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap">
        {bitting.map((d, i) => (
          <button
            key={i}
            onClick={() => onOpen(openIndex === i ? null : i)}
            className={`w-11 h-12 rounded-lg border text-lg font-bold tabular-nums transition-colors ${
              openIndex === i
                ? 'border-blue-400 bg-blue-500/20 text-blue-300'
                : d === null
                  ? 'border-white/10 bg-slate-900/60 text-slate-600'
                  : 'border-white/15 bg-slate-900/60 text-white'
            }`}
          >
            {d ?? '·'}
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex gap-1.5 flex-wrap">
          {depths.map(d => (
            <button
              key={d}
              onClick={() => { onPick(openIndex, d); onOpen(openIndex + 1 < bitting.length ? openIndex + 1 : null); }}
              className="w-11 h-11 rounded-lg bg-slate-700 hover:bg-blue-600 text-white text-base font-bold tabular-nums active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => { onPick(openIndex, null); onOpen(null); }}
            className="px-3 h-11 rounded-lg bg-slate-800 text-slate-400 text-sm hover:text-white"
          >
            стереть
          </button>
        </motion.div>
      )}
    </div>
  );
};

export const MasterKey: React.FC = () => {
  const {
    systems, activeId, createSystem, deleteSystem, setActive,
    renameSystem, setAddress, setBrand, setChambers, setMasterDepth,
    addDoor, removeDoor, renameDoor, setDoorDepth, setDoorBitting, setDoorStatus,
  } = useMasterKeyStore();

  const system = systems.find(s => s.id === activeId) || null;
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ target: string; index: number } | null>(null);
  const [showDiagram, setShowDiagram] = useState(false);
  const [newDoorName, setNewDoorName] = useState('');

  const preset = presetFor(system?.brand ?? 'kwikset-kw1');
  const door = system?.doors.find(d => d.id === selectedDoorId) || null;

  const result = useMemo(
    () => (system && door ? calcPinning(system.masterBitting, door.bitting, preset) : null),
    [system, door, preset],
  );

  const masterComplete = !!system && system.masterBitting.every(d => d !== null);

  const interchange = useMemo(() => {
    if (!system || !masterComplete) return [];
    return findInterchange(system.masterBitting as number[], system.doors);
  }, [system, masterComplete]);

  const summary = useMemo(() => {
    if (!system || !masterComplete) return null;
    const s = pinSummary(system.masterBitting as number[], system.doors, preset);
    return s.bottoms.length ? s : null;
  }, [system, masterComplete, preset]);

  // Native confirm() is swallowed in the installed PWA, so deletes are confirmed
  // by tapping the same button twice. Arms for 3s, then disarms itself.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const [suggestFailed, setSuggestFailed] = useState(false);
  const suggest = () => {
    if (!system || !door || !masterComplete) return;
    const others = system.doors.filter(d => d.id !== door.id);
    const cand = suggestBitting(system.masterBitting as number[], others, preset);
    setSuggestFailed(cand === null);
    if (cand) setDoorBitting(system.id, door.id, cand);
  };

  // --- System picker -------------------------------------------------------
  if (!system) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3">
        <div className="flex items-center gap-3 mb-2">
          <KeyRound className="text-blue-400" size={22} />
          <h2 className="text-xl font-bold text-white">Мастер-ки</h2>
        </div>

        {systems.length === 0 && (
          <Card className="text-center py-10">
            <Building2 className="mx-auto text-slate-600 mb-3" size={36} />
            <p className="text-slate-400 text-sm mb-1">Пока нет ни одного объекта</p>
            <p className="text-slate-500 text-xs">Создай объект — дом или здание, где ставишь мастер-систему.</p>
          </Card>
        )}

        {systems.map(s => {
          const p = presetFor(s.brand);
          const done = s.doors.filter(d => d.status === 'pinned').length;
          return (
            <button
              key={s.id}
              onClick={() => { setActive(s.id); setSelectedDoorId(null); }}
              className="w-full text-left bg-slate-800/50 border border-white/10 rounded-2xl p-4 hover:border-blue-500/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{s.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.name} {p.keyway} · мастер {formatBitting(s.masterBitting)} · {s.doors.length} двер{s.doors.length === 1 ? 'ь' : 'ей'}
                    {done > 0 && ` · ${done} готово`}
                  </div>
                </div>
                <ChevronRight className="text-slate-600 shrink-0" size={18} />
              </div>
            </button>
          );
        })}

        <div className="flex flex-wrap gap-2 pt-1">
          {BRAND_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => { createSystem('Новый объект', p.id); setSelectedDoorId(null); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold active:scale-95 transition"
            >
              <Plus size={16} /> {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Active system -------------------------------------------------------
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={() => setActive(null)} className="p-2 -ml-2 text-slate-400 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <input
          value={system.name}
          onChange={e => renameSystem(system.id, e.target.value)}
          className="flex-1 bg-transparent text-lg font-bold text-white outline-none focus:bg-slate-800/60 rounded px-2 py-1 min-w-0"
        />
        {confirmId === '__system__' ? (
          <button
            onClick={() => { deleteSystem(system.id); setConfirmId(null); }}
            className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold shrink-0 active:scale-95 transition"
          >
            Удалить объект?
          </button>
        ) : (
          <button
            onClick={() => setConfirmId('__system__')}
            aria-label="Удалить объект"
            className="p-2 text-slate-500 hover:text-rose-400 shrink-0"
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>

      <input
        value={system.address ?? ''}
        onChange={e => setAddress(system.id, e.target.value)}
        placeholder="Адрес"
        className="w-full bg-slate-800/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
      />

      <Card label="1 · Замок">
        <div className="flex gap-2 flex-wrap">
          {BRAND_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setBrand(system.id, p.id as MasterKeyBrand)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors ${
                system.brand === p.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {preset.chamberOptions.length > 1 && (
          <div className="flex gap-2 mt-3 items-center">
            <span className="text-xs text-slate-500">камер:</span>
            {preset.chamberOptions.map(n => (
              <button
                key={n}
                onClick={() => setChambers(system.id, n)}
                className={`w-9 h-8 rounded-lg text-sm font-semibold ${
                  system.chambers === n ? 'bg-blue-500 text-white' : 'bg-slate-900/60 border border-white/10 text-slate-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="text-xs text-slate-500 mt-3 leading-relaxed">
          {preset.keyway} · глубины {preset.minDepth}–{preset.maxDepth} · шаг {preset.increment}″ · MACS {preset.macs} · шайбы #{preset.masterPinRange[0]}–#{preset.masterPinRange[1]}
          {preset.note && <div className="text-amber-400/70 mt-1">{preset.note}</div>}
        </div>
      </Card>

      <Card label="2 · Мастер-ключ">
        <BittingRow
          bitting={system.masterBitting}
          minDepth={preset.minDepth}
          maxDepth={preset.maxDepth}
          openIndex={editing?.target === 'master' ? editing.index : null}
          onOpen={i => setEditing(i === null ? null : { target: 'master', index: i })}
          onPick={(i, d) => setMasterDepth(system.id, i, d)}
        />
      </Card>

      <Card label={`3 · Двери (${system.doors.length})`}>
        <div className="space-y-1">
          {system.doors.map(d => {
            const st = STATUS[d.status];
            const isSel = d.id === selectedDoorId;
            return (
              <div
                key={d.id}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 border transition-colors ${
                  isSel ? 'border-blue-500/50 bg-blue-500/10' : 'border-transparent hover:bg-slate-900/40'
                }`}
              >
                <button onClick={() => setSelectedDoorId(isSel ? null : d.id)} className="flex-1 text-left min-w-0">
                  <div className="text-sm text-white truncate">{d.name}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums tracking-widest">{formatBitting(d.bitting)}</div>
                </button>
                <button
                  onClick={() => setDoorStatus(system.id, d.id, st.next)}
                  title="Сменить статус"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/60 border border-white/10 text-[10px] text-slate-400 shrink-0 active:scale-95 transition"
                >
                  <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                  {st.label}
                </button>
                {confirmId === d.id ? (
                  <button
                    onClick={() => { removeDoor(system.id, d.id); setConfirmId(null); if (selectedDoorId === d.id) setSelectedDoorId(null); }}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-[10px] font-bold shrink-0 active:scale-95 transition"
                  >
                    Удалить?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmId(d.id)}
                    aria-label={`Удалить дверь ${d.name}`}
                    className="p-1.5 text-slate-600 hover:text-rose-400 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form
          onSubmit={e => { e.preventDefault(); addDoor(system.id, newDoorName); setNewDoorName(''); }}
          className="flex gap-2 mt-3"
        >
          <input
            value={newDoorName}
            onChange={e => setNewDoorName(e.target.value)}
            placeholder="Кв. 2 — вход"
            className="flex-1 bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
          />
          <button type="submit" className="px-4 rounded-xl bg-slate-700 hover:bg-blue-600 text-white active:scale-95 transition">
            <Plus size={17} />
          </button>
        </form>
      </Card>

      {!door && (
        <Card className="text-center py-8">
          <DoorClosed className="mx-auto text-slate-600 mb-2" size={28} />
          <p className="text-sm text-slate-400">Выбери дверь, чтобы посчитать пиновку</p>
        </Card>
      )}

      {system && door && result && (
        <>
          <Card label="4 · Ключ двери">
            <input
              value={door.name}
              onChange={e => renameDoor(system.id, door.id, e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-white outline-none mb-3 focus:bg-slate-900/60 rounded px-2 py-1 -mx-2"
            />
            <BittingRow
              bitting={door.bitting}
              minDepth={preset.minDepth}
              maxDepth={preset.maxDepth}
              openIndex={editing?.target === door.id ? editing.index : null}
              onOpen={i => setEditing(i === null ? null : { target: door.id, index: i })}
              onPick={(i, d) => setDoorDepth(system.id, door.id, i, d)}
            />
            <button
              onClick={suggest}
              disabled={!masterComplete}
              className="flex items-center gap-2 mt-3 px-3.5 py-2 rounded-xl bg-slate-900/60 border border-white/10 text-sm text-slate-300 hover:text-white hover:border-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
            >
              <Wand2 size={15} className="text-blue-400" />
              Предложить нарезку
            </button>
            {!masterComplete && (
              <div className="text-[11px] text-slate-500 mt-1.5">Сначала заполни мастер-ключ — подберу нарезку сам.</div>
            )}
            {suggestFailed && (
              <div className="text-[12px] text-amber-400 mt-1.5">
                Не нашёл безопасной нарезки — слишком много дверей на этом мастере. Попробуй сменить мастер-ключ.
              </div>
            )}
          </Card>

          {result.positions.length > 0 && (
            <Card>
              <button
                onClick={() => setShowDiagram(v => !v)}
                className="flex items-center gap-2 text-sm text-slate-300 hover:text-white w-full"
              >
                <ChevronDown size={16} className={`transition-transform ${showDiagram ? '' : '-rotate-90'}`} />
                Показать что внутри цилиндра
              </button>
              {showDiagram && (
                <div className="mt-4">
                  <CylinderDiagram positions={result.positions} maxDepth={preset.maxDepth} />
                </div>
              )}
            </Card>
          )}

          <Card label="5 · Что заряжать в камеры">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium pb-2">Поз.</th>
                  <th className="text-left font-medium pb-2">Мастер</th>
                  <th className="text-left font-medium pb-2">Дверь</th>
                  <th className="text-left font-medium pb-2">Нижний</th>
                  <th className="text-left font-medium pb-2">Шайба</th>
                </tr>
              </thead>
              <tbody>
                {result.positions.map(p => (
                  <tr key={p.position} className="border-t border-white/5">
                    <td className="py-2 text-slate-500">{p.position}</td>
                    <td className="py-2 text-slate-300">{p.master}</td>
                    <td className="py-2 text-slate-300">{p.change}</td>
                    <td className="py-2 text-white font-semibold">#{p.bottomPin}</td>
                    <td className="py-2">
                      {p.masterWafer > 0
                        ? <span className="text-blue-400 font-semibold">#{p.masterWafer}</span>
                        : <span className="text-slate-600">— нет</span>}
                    </td>
                  </tr>
                ))}
                {result.positions.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-slate-500 text-xs">Заполни обе нарезки</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          {result.warnings.length > 0 && (
            <Card label="6 · Проверки">
              <div className="space-y-0">
                {result.warnings.map((w, i) => {
                  const { cls, Icon } = WARN_STYLE[w.level];
                  return (
                    <div key={i} className={`flex gap-2.5 py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                      <Icon size={15} className={`${cls} shrink-0 mt-0.5`} />
                      <div className="text-[13px] leading-relaxed">
                        <div className={`font-semibold ${cls}`}>{w.title}</div>
                        <div className="text-slate-400">{w.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {interchange.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-rose-400" size={17} />
            <span className="text-sm font-bold text-rose-400">Пересечение ключей</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Эти ключи открывают больше одной двери, хотя не должны. Поменяй нарезку одной из дверей.
          </p>
          <div className="space-y-1.5">
            {interchange.slice(0, 8).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px]">
                <span className="tabular-nums tracking-widest text-white font-semibold">{f.bitting}</span>
                <span className="text-slate-500">открывает</span>
                <span className="text-slate-300">{f.doorA}</span>
                <span className="text-slate-500">и</span>
                <span className="text-slate-300">{f.doorB}</span>
                {f.kind === 'real-key' && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold">реальный ключ</span>
                )}
              </div>
            ))}
            {interchange.length > 8 && (
              <div className="text-xs text-slate-500 pt-1">…и ещё {interchange.length - 8}</div>
            )}
          </div>
        </div>
      )}

      {interchange.length === 0 && system.doors.filter(d => d.bitting.every(x => x !== null)).length > 1 && (
        <div className="flex items-center gap-2 text-[13px] text-emerald-400/90 px-1">
          <CircleCheck size={15} />
          Пересечений между дверьми нет
        </div>
      )}

      {summary && (
        <Card label="Штифты на объект — что взять с собой">
          <div className="flex items-start gap-2.5">
            <Package size={16} className="text-slate-500 shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-[13px]">
              <div>
                <span className="text-slate-500 mr-2">Нижние:</span>
                {summary.bottoms.map(([size, n]) => (
                  <span key={size} className="inline-block mr-2.5 text-white font-semibold tabular-nums">
                    #{size}<span className="text-slate-500 font-normal">×{n}</span>
                  </span>
                ))}
              </div>
              {summary.wafers.length > 0 && (
                <div>
                  <span className="text-slate-500 mr-2">Шайбы:</span>
                  {summary.wafers.map(([size, n]) => (
                    <span key={size} className="inline-block mr-2.5 text-blue-400 font-semibold tabular-nums">
                      #{size}<span className="text-slate-500 font-normal">×{n}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-slate-500">
                По {system.doors.filter(d => d.bitting.every(x => x !== null)).length} заполненным дверям · плюс верхние штифты и пружины на каждую камеру
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
