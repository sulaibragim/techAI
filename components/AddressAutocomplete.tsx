import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import {
  autocompleteAddress, resolveAddress, newSessionToken,
  AddressSuggestion, GeoPrecision,
} from '../placesClient';

export interface AddressPick {
  address: string;
  zip: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  precision?: GeoPrecision;
}

interface Props {
  address: string;
  zip: string;
  precision?: GeoPrecision;
  onChange: (v: AddressPick) => void;
  autoFocus?: boolean;
}

const card = 'bg-slate-900 p-4 rounded-2xl border border-white/10';
const label = 'text-xs font-bold text-slate-400 uppercase block mb-1.5';
const field = 'w-full bg-transparent border-none text-sm font-semibold text-white outline-none placeholder:text-slate-600';

// Address field with ZIP-biased autocomplete + a verification badge. The customer's ZIP
// narrows the suggestion radius (enter it first for the tightest match), and once a real
// address is picked we keep its exact coordinates so map links and ETAs hit the right pin.
export const AddressAutocomplete: React.FC<Props> = ({ address, zip, precision, onChange, autoFocus }) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const sessionRef = useRef<string>(newSessionToken());
  const blurTimer = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete on the address text, re-biased whenever the ZIP changes.
  useEffect(() => {
    const q = address.trim();
    if (q.length < 3) { setSuggestions([]); setLoading(false); return; }
    setLoading(true);
    const t = window.setTimeout(async () => {
      const items = await autocompleteAddress(q, zip, sessionRef.current);
      setSuggestions(items);
      setLoading(false);
      if (items.length) setOpen(true);
    }, 350);
    return () => window.clearTimeout(t);
  }, [address, zip]);

  // Manual edits invalidate any verified pin — drop coords and force re-verification.
  const onType = (text: string) => {
    onChange({ address: text, zip, lat: undefined, lng: undefined, placeId: undefined, precision: text.trim() ? 'none' : undefined });
  };

  const pick = useCallback(async (s: AddressSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    // OSM suggestions already carry coordinates; Google needs a details call.
    if (s.lat != null && s.lng != null) {
      onChange({ address: s.description, zip: s.zip || zip, lat: s.lat, lng: s.lng, placeId: s.placeId, precision: s.precision || 'approx' });
      sessionRef.current = newSessionToken();
      return;
    }
    setResolving(true);
    const r = await resolveAddress(s.placeId, sessionRef.current);
    setResolving(false);
    sessionRef.current = newSessionToken(); // close the Places billing session
    if (r) {
      onChange({ address: r.formattedAddress || s.description, zip: r.zip || zip, lat: r.lat, lng: r.lng, placeId: r.placeId, precision: r.precision });
    } else {
      // Details lookup failed — keep the text but mark it unverified so the warning shows.
      onChange({ address: s.description, zip, precision: 'none' });
    }
  }, [onChange, zip]);

  const handleBlur = () => { blurTimer.current = window.setTimeout(() => setOpen(false), 150); };
  const handleFocus = () => { if (blurTimer.current) window.clearTimeout(blurTimer.current); if (suggestions.length) setOpen(true); };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* ZIP first — biases the suggestions below to this postal area */}
      <div className={card}>
        <label className={label}>ZIP Code *</label>
        <input
          inputMode="numeric"
          className={field}
          value={zip}
          onChange={(e) => onChange({ address, zip: e.target.value, precision })}
          placeholder="33139"
        />
        <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">Enter first — narrows the address search.</p>
      </div>

      <div className="md:col-span-2 relative" ref={boxRef}>
        <div className={card}>
          <label className={`${label} flex items-center gap-1.5`}>
            <Search size={11} className="text-blue-400" /> Service Address *
          </label>
          <div className="flex items-center gap-2">
            <textarea
              className={`${field} min-h-[44px] resize-none`}
              value={address}
              onChange={(e) => onType(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Start typing — pick a suggestion"
              autoFocus={autoFocus}
            />
            {(loading || resolving) && <Loader2 size={15} className="text-slate-500 animate-spin shrink-0" />}
          </div>

          {/* Verification badge */}
          {precision === 'exact' && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 size={13} /> Address verified — exact location pinned.
            </p>
          )}
          {precision === 'approx' && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-amber-400 leading-snug">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>This looks like a street or area, not an exact address. Better to double-check than confirm — the pin may land off-road.</span>
            </p>
          )}
          {precision === 'none' && address.trim().length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <MapPin size={12} /> Pick a suggestion to verify the exact location.
            </p>
          )}
        </div>

        {open && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-2xl z-50 shadow-2xl overflow-hidden max-h-72 overflow-y-auto scrollbar-hide">
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-blue-600/20 transition-colors border-b border-white/5 last:border-0"
              >
                <MapPin size={14} className={`shrink-0 mt-0.5 ${s.precision === 'approx' ? 'text-amber-400' : 'text-blue-400'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white truncate">{s.mainText}</span>
                  {s.secondaryText && <span className="block text-xs text-slate-400 truncate">{s.secondaryText}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
