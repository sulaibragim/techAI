import React from 'react';
import type { Lang } from '../tours';

interface LanguageToggleProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
  className?: string;
}

/** Compact EN/RU pill used everywhere the onboarding text shows: the welcome card, the
 *  tour overlay, and the Guided Tours settings card. One component so the three surfaces
 *  can never drift into three different-looking switches. */
export const LanguageToggle: React.FC<LanguageToggleProps> = ({ lang, onChange, className }) => (
  <div
    role="group"
    aria-label="Onboarding language / Язык обучения"
    className={`inline-flex items-center rounded-lg bg-white/5 border border-white/10 p-0.5 shrink-0 ${className || ''}`}
  >
    {(['en', 'ru'] as Lang[]).map((l) => (
      <button
        key={l}
        type="button"
        onClick={() => onChange(l)}
        aria-pressed={lang === l}
        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
          lang === l ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
        }`}
      >
        {l.toUpperCase()}
      </button>
    ))}
  </div>
);
