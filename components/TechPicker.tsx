import React, { useEffect, useState } from 'react';
import { MapPin, Check, Loader2 } from 'lucide-react';
import { User } from '../types';
import { geocodeAddress } from '../geocoding';
import { haversineMiles, approxEtaMinutes, formatMiles, LatLng } from '../geoUtils';

interface TechPickerProps {
  technicians: User[];
  address?: string;
  value?: string;                       // selected technician id ('' / undefined = unassigned)
  onChange: (id: string | undefined) => void;
}

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  available: { label: 'Free',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  onJob:     { label: 'On a job', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',       dot: 'bg-amber-400' },
  offDuty:   { label: 'Off',      cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30',       dot: 'bg-slate-500' },
};

const initials = (name: string) => name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

// Picks a technician for a job, ranked by straight-line distance to the client's
// (geocoded) address. Shows each tech's status and rough ETA. No map / API key.
export const TechPicker: React.FC<TechPickerProps> = ({ technicians, address, value, onChange }) => {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    let active = true;
    const addr = (address || '').trim();
    if (!addr) { setCoords(null); setGeocoding(false); return; }
    setGeocoding(true);
    const t = setTimeout(() => {
      geocodeAddress(addr).then(c => { if (active) { setCoords(c); setGeocoding(false); } });
    }, 600); // debounce typing
    return () => { active = false; clearTimeout(t); };
  }, [address]);

  const ranked = technicians
    .map(t => ({ tech: t, miles: (coords && t.lastLocation) ? haversineMiles(coords, t.lastLocation) : null }))
    .sort((a, b) => {
      if (a.miles == null && b.miles == null) return 0;
      if (a.miles == null) return 1;
      if (b.miles == null) return -1;
      return a.miles - b.miles;
    });

  return (
    <div className="space-y-2">
      {address?.trim() && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          {geocoding ? <><Loader2 size={11} className="animate-spin" /> Locating address…</>
            : coords ? <><MapPin size={11} className="text-emerald-400" /> Sorted by distance to client</>
            : <>Couldn’t locate that address — showing all techs</>}
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`w-full p-3 rounded-2xl border text-left text-sm font-semibold transition-all active:scale-[0.99] ${!value ? 'bg-blue-600/15 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}
      >
        Unassigned
      </button>

      {ranked.map(({ tech, miles }, i) => {
        const s = STATUS[tech.techStatus || 'offDuty'];
        const selected = value === tech.id;
        const isNearest = i === 0 && miles != null;
        return (
          <button
            type="button"
            key={tech.id}
            onClick={() => onChange(tech.id)}
            className={`w-full flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all active:scale-[0.99] text-left ${selected ? 'bg-blue-600/15 border-blue-500/50' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {initials(tech.name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white truncate">{tech.name}</p>
                  {isNearest && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Nearest</span>}
                </div>
                <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 flex items-center gap-2">
              <div>
                {miles != null ? (
                  <>
                    <p className="text-sm font-bold text-white tabular-nums leading-none">{formatMiles(miles)} mi</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">~{approxEtaMinutes(miles)} min</p>
                  </>
                ) : (
                  <p className="text-[10px] font-semibold text-slate-500">{coords ? 'No GPS' : '—'}</p>
                )}
              </div>
              {selected && <Check size={16} className="text-blue-400 shrink-0" />}
            </div>
          </button>
        );
      })}
    </div>
  );
};
