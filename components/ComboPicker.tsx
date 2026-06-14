import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X, Check, ChevronDown, CornerDownLeft } from 'lucide-react';

interface ComboPickerProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;             // shown on the trigger when empty
  title?: string;                  // sheet header
  searchPlaceholder?: string;
  leading?: React.ReactNode;       // icon at the start of the trigger
  disabled?: boolean;
  allowCustom?: boolean;           // let the tech keep a typed value not in the list
  emptyHint?: string;
  renderOption?: (opt: string) => React.ReactNode;
  className?: string;              // extra classes on the trigger
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// A modern, searchable single-select. Opens as a bottom sheet on phones and a
// centered modal on desktop — replaces the native <select>/<datalist>, which
// looks dated on desktop and is unreliable on mobile.
export const ComboPicker: React.FC<ComboPickerProps> = ({
  value, onChange, options, placeholder, title, searchPlaceholder,
  leading, disabled, allowCustom, emptyHint, renderOption, className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) => norm(o).includes(q));
  }, [options, query]);

  const exact = useMemo(
    () => options.some((o) => norm(o) === norm(query)),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  const commit = () => {
    if (filtered.length > 0) pick(filtered[0]);
    else if (allowCustom && query.trim()) pick(query.trim());
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 w-full bg-slate-900 border rounded-xl px-3 py-3 text-sm text-left transition-colors outline-none disabled:opacity-40 ${
          value ? 'border-white/15 text-white' : 'border-white/10 text-slate-500'
        } hover:border-white/25 focus:border-blue-500 ${className}`}
      >
        {leading && <span className="text-slate-400 shrink-0">{leading}</span>}
        <span className="flex-1 truncate font-semibold">{value || placeholder}</span>
        <ChevronDown size={16} className="text-slate-500 shrink-0" />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[850] flex items-end sm:items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="relative w-full sm:max-w-md bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[70vh] sm:m-4 overflow-hidden"
              >
                {/* grab handle (mobile) */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                  <div className="w-10 h-1.5 rounded-full bg-white/15" />
                </div>

                <div className="flex items-center justify-between gap-3 px-4 pt-2 sm:pt-4 pb-3 shrink-0">
                  <h3 className="text-sm font-bold text-white">{title || 'Select'}</h3>
                  <button type="button" onClick={() => setOpen(false)}
                    className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-95">
                    <X size={18} />
                  </button>
                </div>

                <div className="px-4 pb-3 shrink-0">
                  <div className="flex items-center gap-2 bg-slate-800 border border-white/10 rounded-xl px-3 focus-within:border-blue-500">
                    <Search size={16} className="text-slate-500 shrink-0" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                      placeholder={searchPlaceholder || 'Search…'}
                      className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder:text-slate-500 outline-none"
                    />
                    {query && (
                      <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                        className="p-1 rounded text-slate-500 hover:text-white">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {allowCustom && query.trim() && !exact && (
                    <button
                      type="button"
                      onClick={() => pick(query.trim())}
                      className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-left text-sm text-blue-300 hover:bg-blue-500/10 active:scale-[0.99]"
                    >
                      <CornerDownLeft size={15} className="shrink-0" />
                      Use “<span className="font-bold">{query.trim()}</span>”
                    </button>
                  )}

                  {filtered.length === 0 && !(allowCustom && query.trim()) ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-500">
                      {emptyHint || 'Nothing matches that.'}
                    </p>
                  ) : (
                    filtered.map((opt) => {
                      const selected = norm(opt) === norm(value);
                      return (
                        <button
                          type="button"
                          key={opt}
                          onClick={() => pick(opt)}
                          className={`flex items-center justify-between gap-3 w-full px-3 py-3 rounded-xl text-left text-sm transition-colors active:scale-[0.99] ${
                            selected ? 'bg-blue-600/15 text-white' : 'text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          <span className="truncate font-semibold">{renderOption ? renderOption(opt) : opt}</span>
                          {selected && <Check size={16} className="text-blue-400 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};
