import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  KeyRound, Search, Car, AlertTriangle, CircleCheck, Loader2,
  Fingerprint, ScanLine, Bot, Wrench, Gauge, Tag, BadgeCheck,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useCurrentUser } from '../authStore';
import { useVehicleKeyStore, COMMON_PROGRAMMERS, profileKey } from '../vehicleKeyStore';
import { ProcedureBlock } from './ProcedureBlock';
import { VinScanner } from './VinScanner';
import { GatedCodesBlock } from './GatedCodesBlock';
import { ComboPicker } from './ComboPicker';
import {
  decodeVin, findKeyProfiles, reverseLookup, KNOWN_MAKES, modelsForMake, stockForKeyway,
  type DecodedVin,
} from '../vehicleKeyLookup';
import type { VehicleKeyProfile, KeyConfidence, KeyVariant, Part } from '../types';

const CONFIDENCE: Record<KeyConfidence, { label: string; cls: string; Icon: React.ComponentType<{ size?: number }> }> = {
  verified:        { label: 'Verified · 2+ sources', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', Icon: CircleCheck },
  owner:           { label: 'Confirmed by you',      cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', Icon: BadgeCheck },
  'single-source': { label: 'Single source — check', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30',       Icon: AlertTriangle },
  unverified:      { label: 'AI draft — verify',     cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30',          Icon: Bot },
  ai:              { label: 'AI guess — verify',     cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30',          Icon: Bot },
};

const KEYTYPE_LABEL: Record<string, string> = {
  Mechanical: 'Mechanical key',
  Transponder: 'Transponder key',
  RemoteHead: 'Remote-head key',
  Flip: 'Flip / switchblade key',
  Smart: 'Smart / proximity (push-start)',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isOwned = (hint: string, owned: string[]) =>
  owned.some((o) => { const a = norm(o), b = norm(hint); return a && (a.includes(b) || b.includes(a)); });

// Heuristic difficulty/time so a tech can quote before driving out.
function difficulty(p: VehicleKeyProfile): { label: string; mins: string; cls: string } {
  const txt = `${p.programming || ''} ${p.notes || ''}`.toLowerCase();
  const smart = p.variants.some((v) => v.keyType === 'Smart');
  if (/fbs4|bdc2|bench|eeprom|dealer-only|dealer only|no aftermarket/.test(txt))
    return { label: 'Dealer / bench', mins: '60–120 min', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
  if (p.pinRequired || /akl|all-keys-lost|\bsgw\b|incode/.test(txt))
    return { label: 'Hard', mins: '40–70 min', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  if (smart) return { label: 'Medium', mins: '25–45 min', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
  return { label: 'Easy', mins: '15–25 min', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 border-t border-white/5">
    <span className="text-[11px] uppercase tracking-wider text-slate-500 shrink-0">{label}</span>
    <span className="text-xs font-semibold text-slate-200 text-right">{children}</span>
  </div>
);

const VariantCard: React.FC<{ v: KeyVariant; inventory: Part[] }> = ({ v, inventory }) => {
  const stock = stockForKeyway(v.keyway, inventory);
  const inStock = stock.reduce((n, p) => n + p.stock, 0);
  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 space-y-0.5">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={14} className="text-blue-400" />
        <span className="text-xs font-bold text-white">{KEYTYPE_LABEL[v.keyType] || v.keyType}</span>
        {v.trimDependent && (
          <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
            some trims
          </span>
        )}
      </div>
      {v.keyway && <Field label="Keyway / blade">{[v.keyway, v.bladeIlco, v.bladeSilca].filter(Boolean).join(' · ')}</Field>}
      {v.transponderChip && (
        <Field label="Chip">
          {v.transponderChip}
          {v.chipClonable && (
            <span className="ml-2 text-[10px] text-slate-400">
              {v.chipClonable === 'yes' ? 'clonable' : v.chipClonable === 'token' ? 'clone via token' : 'OBD only'}
            </span>
          )}
        </Field>
      )}
      {(v.fccId || v.partNumber) && (
        <Field label="FCC · part #">{[v.fccId, v.partNumber].filter(Boolean).join(' · ')}</Field>
      )}
      {v.frequency && (
        <Field label="Frequency">
          {String(v.frequency).replace(/\s*mhz\s*$/i, '')} MHz
          <span className="ml-2 text-[10px] text-amber-400">match the fob — 315 ≠ 433</span>
        </Field>
      )}
      {v.keyway && (
        <Field label="In stock">
          {inStock > 0 ? (
            <span className="text-emerald-400">{inStock}× {stock[0]?.sku || v.keyway}</span>
          ) : (
            <span className="text-amber-400">none — order {v.bladeIlco || v.keyway}</span>
          )}
        </Field>
      )}
    </div>
  );
};

const ProfileCard: React.FC<{ p: VehicleKeyProfile; inventory: Part[] }> = ({ p, inventory }) => {
  const conf = CONFIDENCE[p.confidence];
  const diff = difficulty(p);
  const isWeak = p.confidence === 'unverified' || p.confidence === 'ai' || p.confidence === 'single-source';
  const key = profileKey(p);
  const currentUser = useCurrentUser();
  const confirmation = useVehicleKeyStore((s) => s.confirmations[key]);
  const ownedProgrammers = useVehicleKeyStore((s) => s.ownedProgrammers);
  const toggleConfirm = useVehicleKeyStore((s) => s.toggleConfirm);
  const setNote = useVehicleKeyStore((s) => s.setNote);
  const confirmed = !!confirmation?.confirmed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-slate-800/60 border rounded-2xl p-4 space-y-3 ${confirmed ? 'border-emerald-500/40' : 'border-white/10'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Car size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{p.make} {p.model}</p>
            <p className="text-[11px] text-slate-400">{p.yearStart}–{p.yearEnd ?? 'now'} · {p.region || 'US'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {confirmed ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
              <BadgeCheck size={12} /> Confirmed by you
            </span>
          ) : (
            <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${conf.cls}`}>
              <conf.Icon size={12} /> {conf.label}
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${diff.cls}`}>
            <Gauge size={12} /> {diff.label} · {diff.mins}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {p.variants.map((v, i) => <VariantCard key={i} v={v} inventory={inventory} />)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {p.immobilizer && <Field label="Immobilizer">{p.immobilizer}{p.pinRequired ? ' · PIN needed' : ''}</Field>}
        {p.programming && <Field label="How to program">{p.programming}</Field>}
        {p.programmerHint?.length ? (
          <Field label="Programmers">
            {p.programmerHint.map((h, i) => (
              <span key={i} className={isOwned(h, ownedProgrammers) ? 'text-emerald-400 font-bold' : ''}>
                {isOwned(h, ownedProgrammers) ? '✓ ' : ''}{h}{i < p.programmerHint!.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </Field>
        ) : null}
        {p.notes && <Field label="Notes">{p.notes}</Field>}
      </div>

      <ProcedureBlock make={p.make} model={p.model} year={p.yearStart} />
      <GatedCodesBlock />

      {isWeak && !confirmed && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
          <AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-rose-200">
            Not yet double-verified. Check the chip & FCC ID on the actual fob before cutting.
          </span>
        </div>
      )}

      {/* Confirm-by-fact: build our own golden DB from real jobs */}
      <div className="pt-2 border-t border-white/5 space-y-2">
        <button
          onClick={() => toggleConfirm(key, currentUser?.name)}
          className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${
            confirmed
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
          }`}
        >
          <BadgeCheck size={14} />
          {confirmed ? 'Confirmed — this worked on a real job' : 'Confirm: this worked on a real job'}
        </button>
        {confirmed && (
          <input
            defaultValue={confirmation?.note || ''}
            onChange={(e) => setNote(key, e.target.value)}
            placeholder="Note / gotcha for the team (e.g. needed SGW bypass cable)"
            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 outline-none"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[10px] text-slate-500">
          {p.dataSource || 'source'}{p.lastVerified ? ` · ${p.lastVerified}` : ''}
        </span>
        {p.sources?.length ? <span className="text-[10px] text-slate-500 truncate max-w-[55%]">{p.sources.join(', ')}</span> : null}
      </div>
    </motion.div>
  );
};

export const AutoKey: React.FC = () => {
  const inventory = useAppStore((s) => s.inventory);
  const ownedProgrammers = useVehicleKeyStore((s) => s.ownedProgrammers);
  const toggleProgrammer = useVehicleKeyStore((s) => s.toggleProgrammer);
  const [mode, setMode] = useState<'vin' | 'manual' | 'fob'>('vin');
  const [showTools, setShowTools] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [vin, setVin] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [fob, setFob] = useState('');
  const [loading, setLoading] = useState(false);
  const [decoded, setDecoded] = useState<DecodedVin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<VehicleKeyProfile[] | null>(null);

  const modelOptions = useMemo(() => modelsForMake(make), [make]);

  const runManual = () => {
    setError(null); setDecoded(null);
    const y = year ? parseInt(year, 10) : null;
    setResults(findKeyProfiles({ make, model: model || undefined, year: y }));
  };
  const runFob = () => {
    setError(null); setDecoded(null);
    setResults(reverseLookup(fob));
  };
  const runVin = async (override?: string) => {
    const raw = (override ?? vin).trim();
    if (override) setVin(override);
    setError(null); setDecoded(null); setResults(null); setLoading(true);
    const d = await decodeVin(raw);
    setLoading(false);
    if (!d) { setError('Could not decode that VIN. Check it has 17 characters, or switch to make & year.'); return; }
    setDecoded(d);
    setResults(findKeyProfiles({ make: d.make, model: d.model, year: d.year }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center"><KeyRound size={22} /></div>
        <div>
          <h2 className="text-lg font-bold text-white">Auto-Key</h2>
          <p className="text-xs text-slate-400">VIN, make &amp; year, or a fob in hand → keyway, chip, immobilizer, how to program.</p>
        </div>
      </div>

      {/* mode toggle */}
      <div className="inline-flex flex-wrap bg-slate-800/60 border border-white/10 rounded-xl p-1 gap-1">
        {([['vin', 'VIN', ScanLine], ['manual', 'Make & Year', Car], ['fob', 'By fob / blank', Tag]] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResults(null); setError(null); setDecoded(null); }}
            className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors ${
              mode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* my tools selector */}
      <div className="bg-slate-800/40 border border-white/10 rounded-xl px-4 py-2">
        <button onClick={() => setShowTools((v) => !v)} className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white">
          <Wrench size={14} className="text-blue-400" /> My programmers
          {ownedProgrammers.length > 0 && <span className="text-emerald-400">({ownedProgrammers.length})</span>}
          <span className="text-slate-500">{showTools ? '▾' : '▸'}</span>
        </button>
        {showTools && (
          <div className="flex flex-wrap gap-2 mt-3">
            {COMMON_PROGRAMMERS.map((t) => {
              const on = ownedProgrammers.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleProgrammer(t)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                    on ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {on ? '✓ ' : ''}{t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* input area */}
      <div className="bg-slate-800/60 border border-white/10 rounded-2xl p-4">
        {mode === 'vin' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={vin} onChange={(e) => setVin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runVin()}
              placeholder="17-character VIN" maxLength={17}
              className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white uppercase tracking-wider placeholder:text-slate-500 focus:border-blue-500 outline-none"
            />
            <button onClick={() => setShowScan(true)} title="Scan VIN barcode"
              className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 text-sm font-bold px-4 py-3 rounded-xl transition-colors">
              <ScanLine size={16} /> Scan
            </button>
            <button onClick={() => runVin()} disabled={loading || vin.trim().length < 17}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold px-5 py-3 rounded-xl transition-colors">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Decode
            </button>
          </div>
        )}
        {mode === 'manual' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ComboPicker
              value={make}
              onChange={(v) => { setMake(v); setModel(''); }}
              options={KNOWN_MAKES}
              placeholder="Make"
              title="Pick a make"
              searchPlaceholder="Search makes…"
              leading={<Car size={16} />}
            />
            <ComboPicker
              value={model}
              onChange={setModel}
              options={modelOptions}
              placeholder={make ? 'Model' : 'Pick a make first'}
              title={make ? `${make} models` : 'Model'}
              searchPlaceholder="Search models…"
              disabled={!make}
              allowCustom
              emptyHint={make ? `No models for ${make} in the base yet — type to use your own.` : 'Pick a make first.'}
            />
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => e.key === 'Enter' && runManual()}
              placeholder="Year" inputMode="numeric"
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 outline-none" />
            <button onClick={runManual} disabled={!make.trim()}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors">
              <Search size={16} /> Find
            </button>
          </div>
        )}
        {mode === 'fob' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={fob} onChange={(e) => setFob(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runFob()}
              placeholder="FCC ID, part #, blade (HU101) or keyway"
              className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 outline-none"
            />
            <button onClick={runFob} disabled={fob.trim().length < 3}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold px-5 py-3 rounded-xl transition-colors">
              <Search size={16} /> What fits?
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><CircleCheck size={12} className="text-emerald-400" /> verified · 2+ sources</span>
          <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-amber-400" /> depends on trim</span>
          <span className="flex items-center gap-1"><Bot size={12} className="text-rose-400" /> AI draft — verify on the fob</span>
          <span className="flex items-center gap-1"><Gauge size={12} className="text-blue-400" /> difficulty + time</span>
        </div>
      </div>

      {showScan && <VinScanner onResult={(v) => { setShowScan(false); runVin(v); }} onClose={() => setShowScan(false)} />}

      {error && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {decoded && (
        <div className="bg-slate-800/40 border border-white/10 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-blue-400 mb-1"><Fingerprint size={13} /> Decoded VIN</div>
          <p className="text-sm font-bold text-white">{decoded.year ?? '—'} {decoded.make} {decoded.model}{decoded.trim ? ` · ${decoded.trim}` : ''}</p>
          {decoded.bodyClass && <p className="text-[11px] text-slate-400">{decoded.bodyClass}{decoded.plantCountry ? ` · ${decoded.plantCountry}` : ''}</p>}
        </div>
      )}

      {results && results.length === 0 && (
        <div className="bg-slate-800/40 border border-white/10 rounded-2xl px-4 py-8 text-center space-y-2">
          <Bot size={28} className="mx-auto text-slate-500" />
          <p className="text-sm font-semibold text-slate-300">No match in the base yet</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {mode === 'fob' ? 'No car in the base uses that fob/blank. Try the FCC ID or Ilco number.' : "This one isn't in the base yet — look it up the usual way and we'll add it."}
          </p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {mode === 'fob' && <p className="text-xs text-slate-400">{results.length} match{results.length > 1 ? 'es' : ''} for “{fob}”</p>}
          {results.map((p, i) => <ProfileCard key={i} p={p} inventory={inventory} />)}
        </div>
      )}
    </div>
  );
};
