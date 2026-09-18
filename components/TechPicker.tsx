import React, { useEffect, useState } from 'react';
import { MapPin, Check, Loader2, Home } from 'lucide-react';
import { User } from '../types';
import { geocodeAddress } from '../geocoding';
import { formatMiles, LatLng } from '../geoUtils';
import { rankTechs, skillsFor, formatDrive } from '../techRanking';
import { useTechDrives } from '../useTechDrives';
import { useSettingsStore } from '../settingsStore';

interface TechPickerProps {
  technicians: User[];
  address?: string;
  coords?: LatLng | null;               // verified pin from address autocomplete — skips the geocode
  value?: string;                       // selected technician id ('' / undefined = unassigned)
  onChange: (id: string | undefined) => void;
  jobType?: string;                     // lock type — drives the specialty match
  favoriteTechId?: string;              // client's preferred technician
}

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  available: { label: 'Free',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  onJob:     { label: 'On a job', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',       dot: 'bg-amber-400' },
  offDuty:   { label: 'Off',      cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30',       dot: 'bg-slate-500' },
};

const initials = (name: string) => name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

// Picks a technician for a job. Each tech is measured by the drive from their home
// (Settings → Team) to the client — a road time once the router answers — never from a
// stale GPS fix. Best match first, then nearest; the status chip says who is free.
export const TechPicker: React.FC<TechPickerProps> = ({ technicians, address, coords: pinnedCoords, value, onChange, jobType, favoriteTechId }) => {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const techHomes = useSettingsStore(s => s.techHomes);
  const wantSkills = skillsFor(jobType);

  useEffect(() => {
    let active = true;
    // A verified address pick already carries exact coordinates — rank straight off
    // them instead of re-geocoding the text (which can drift to a different pin).
    if (pinnedCoords) { setCoords(pinnedCoords); setGeocoding(false); return; }
    const addr = (address || '').trim();
    if (!addr) { setCoords(null); setGeocoding(false); return; }
    setGeocoding(true);
    const t = setTimeout(() => {
      geocodeAddress(addr).then(c => { if (active) { setCoords(c); setGeocoding(false); } });
    }, 600); // debounce typing
    return () => { active = false; clearTimeout(t); };
  }, [address, pinnedCoords?.lat, pinnedCoords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const drives = useTechDrives(technicians, coords);
  const ranked = rankTechs(technicians, drives, { jobType, favoriteTechId });
  const noHome = technicians.filter(t => !techHomes?.[t.id]).map(t => t.name);

  return (
    <div className="space-y-2">
      {address?.trim() && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          {geocoding ? <><Loader2 size={11} className="animate-spin" /> Locating address…</>
            : coords ? <><MapPin size={11} className="text-emerald-400" /> {ranked.some(r => r.isFavorite || r.isSpecialist) ? 'Best match first, then the drive from home' : 'Nearest first — drive from each tech’s home'}</>
            : <>Couldn’t locate that address — showing all techs</>}
        </p>
      )}
      {coords && noHome.length > 0 && (
        <p className="text-[11px] font-semibold text-amber-400/90 flex items-start gap-1.5 leading-snug">
          <Home size={12} className="shrink-0 mt-px" />
          <span>No home address for {noHome.join(', ')} — set it in Settings → Team to see the drive.</span>
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`w-full p-3 rounded-2xl border text-left text-sm font-semibold transition-all active:scale-[0.99] ${!value ? 'bg-blue-600/15 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}
      >
        Unassigned
      </button>

      {ranked.map(({ tech, drive, isFavorite, isSpecialist, isNearest }) => {
        const s = STATUS[tech.techStatus || 'offDuty'];
        const selected = value === tech.id;
        return (
          <button
            type="button"
            key={tech.id}
            onClick={() => onChange(tech.id)}
            className={`w-full flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all active:scale-[0.99] text-left ${selected ? 'bg-blue-600/15 border-blue-500/50' : isFavorite ? 'bg-pink-500/5 border-pink-500/30' : isSpecialist ? 'bg-purple-500/5 border-purple-500/25' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {initials(tech.name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-white truncate">{tech.name}</p>
                  {isFavorite && <span className="text-[9px] font-bold uppercase tracking-wider text-pink-300 bg-pink-500/15 px-1.5 py-0.5 rounded">Preferred</span>}
                  {isSpecialist && <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded">Specialist</span>}
                  {isNearest && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Nearest</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
                  </span>
                  {(tech.skills || []).slice(0, 3).map(sk => (
                    <span key={sk} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${wantSkills.includes(sk) ? 'text-purple-300 bg-purple-500/10 border-purple-500/25' : 'text-slate-400 bg-white/5 border-white/10'}`}>{sk}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 flex items-center gap-2">
              <div>
                {drive ? (
                  <>
                    <p className={`text-sm font-bold tabular-nums leading-none ${drive.exact ? 'text-white' : 'text-slate-300'}`}>{formatDrive(drive)}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5 tabular-nums">{formatMiles(drive.miles)} mi</p>
                  </>
                ) : (
                  <p className="text-[10px] font-semibold text-slate-500">{coords ? 'No home set' : '—'}</p>
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
