import React, { useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../settingsStore';
import { ReviewLink, ReviewPlatform } from '../types';
import {
  REVIEW_PLATFORMS, REVIEW_PLATFORM_IDS, checkReviewUrl, detectReviewPlatform, displayReviewUrl,
} from '../reviewLinks';

const PLATFORM_TONE: Record<ReviewPlatform, string> = {
  google: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  yelp: 'bg-red-500/15 text-red-300 border-red-500/30',
  facebook: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  nextdoor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  other: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const PLACEHOLDER: Record<ReviewPlatform, string> = {
  google: 'https://g.page/r/…/review',
  yelp: 'https://www.yelp.com/writeareview/biz/…',
  facebook: 'https://www.facebook.com/…/reviews',
  nextdoor: 'https://nextdoor.com/…',
  other: 'https://…',
};

interface Draft {
  id?: string;
  platform: ReviewPlatform;
  label: string;
  url: string;
  // Pasting a link fills platform and name — until the owner sets them by hand.
  platformTouched: boolean;
  labelTouched: boolean;
}

const fieldCls = 'w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all';

// Settings → Review Links. Saves each change on its own (like the price book), so there
// is no page-level Save to forget. Every link becomes a one-tap "Review" text in
// Messages and on the job card.
export const ReviewLinksEditor: React.FC = () => {
  const links = useSettingsStore(s => s.reviewLinks);
  const addReviewLink = useSettingsStore(s => s.addReviewLink);
  const updateReviewLink = useSettingsStore(s => s.updateReviewLink);
  const removeReviewLink = useSettingsStore(s => s.removeReviewLink);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startAdd = () => {
    setDraft({ platform: 'google', label: REVIEW_PLATFORMS.google.label, url: '', platformTouched: false, labelTouched: false });
    setError('');
    setConfirmDeleteId(null);
  };

  const startEdit = (l: ReviewLink) => {
    setDraft({ id: l.id, platform: l.platform, label: l.label, url: l.url, platformTouched: true, labelTouched: true });
    setError('');
    setConfirmDeleteId(null);
  };

  const onUrl = (url: string) => {
    setError('');
    setDraft(d => {
      if (!d) return d;
      const platform = (!d.platformTouched && detectReviewPlatform(url)) || d.platform;
      return { ...d, url, platform, label: d.labelTouched ? d.label : REVIEW_PLATFORMS[platform].label };
    });
  };

  const onPlatform = (platform: ReviewPlatform) => {
    setDraft(d => d && ({ ...d, platform, platformTouched: true, label: d.labelTouched ? d.label : REVIEW_PLATFORMS[platform].label }));
  };

  const save = () => {
    if (!draft) return;
    const check = checkReviewUrl(draft.url, draft.platform);
    if (check.error) { setError(check.error); return; }
    const label = draft.label.trim().slice(0, 40) || REVIEW_PLATFORMS[draft.platform].label;
    const others = links.filter(l => l.id !== draft.id);
    if (others.some(l => l.url === check.url)) { setError('This link is already on the list.'); return; }
    // Two chips both saying "Review · Google" would leave the sender guessing which is which.
    if (others.some(l => l.label.toLowerCase() === label.toLowerCase())) {
      setError(`Another link is already called "${label}". Name this one by city, e.g. "${REVIEW_PLATFORMS[draft.platform].label} Mesa".`);
      return;
    }
    if (draft.id) updateReviewLink({ id: draft.id, platform: draft.platform, label, url: check.url });
    else addReviewLink({ platform: draft.platform, label, url: check.url });
    setDraft(null);
    setError('');
  };

  const live = draft && draft.url.trim() ? checkReviewUrl(draft.url, draft.platform) : null;
  const info = draft ? REVIEW_PLATFORMS[draft.platform] : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 -mt-1">
        The client taps the link in a text and lands right on the review form. Each link becomes a one-tap review request in Messages and on the job card.
      </p>

      {links.length === 0 && !draft && (
        <p className="text-xs text-slate-500 italic">No review links yet. Start with Google: that is where clients look for a locksmith.</p>
      )}

      <div className="space-y-2">
        {links.map(l => {
          if (draft?.id === l.id) return null;
          const warning = checkReviewUrl(l.url, l.platform).warning;
          const caution = REVIEW_PLATFORMS[l.platform].caution;
          return (
            <div key={l.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 ${PLATFORM_TONE[l.platform]}`}>
                  {REVIEW_PLATFORMS[l.platform].label}
                </span>
                <span className="text-sm font-bold text-white truncate">{l.label}</span>
                <span className="flex-1" />
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the link to check it lands on the review form"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                ><ExternalLink size={13} /></a>
                <button
                  onClick={() => startEdit(l)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  aria-label={`Edit ${l.label}`}
                ><Pencil size={13} /></button>
                {confirmDeleteId === l.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => { removeReviewLink(l.id); setConfirmDeleteId(null); }}
                      className="px-2 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-bold hover:bg-red-500/25 transition-all"
                    >Delete</button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[10px] font-bold hover:text-white transition-all"
                    >Keep</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(l.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    aria-label={`Delete ${l.label}`}
                  ><Trash2 size={13} /></button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{displayReviewUrl(l.url)}</p>
              {warning && <p className="flex items-start gap-1.5 text-[11px] text-amber-400 mt-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{warning}</p>}
              {caution && <p className="flex items-start gap-1.5 text-[11px] text-amber-400/80 mt-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{caution}</p>}
            </div>
          );
        })}
      </div>

      {draft && info ? (
        <div className="p-3.5 rounded-xl bg-white/5 border border-blue-500/30 space-y-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Link</label>
            <input
              autoFocus
              type="url"
              inputMode="url"
              value={draft.url}
              onChange={e => onUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder={PLACEHOLDER[draft.platform]}
              className={fieldCls}
            />
            {live?.warning && !error && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-400 mt-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{live.warning}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {REVIEW_PLATFORM_IDS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onPlatform(p)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                  draft.platform === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                }`}
              >{REVIEW_PLATFORMS[p].label}</button>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">{info.howTo}</p>
          {info.caution && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-400/90 leading-relaxed"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{info.caution}</p>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Name on the button</label>
            <input
              value={draft.label}
              maxLength={40}
              onChange={e => { const label = e.target.value; setError(''); setDraft(d => d && ({ ...d, label, labelTouched: true })); }}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder={info.label}
              className={fieldCls}
            />
            <p className="text-[11px] text-slate-500 mt-1.5">Several Google pages? Name each by city: Google Mesa, Google Tempe.</p>
          </div>

          {error && <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-400"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!draft.url.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
            ><Check size={13} /> Save link</button>
            <button
              onClick={() => { setDraft(null); setError(''); }}
              className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:text-white transition-all active:scale-95"
            >Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={startAdd}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 text-slate-300 text-xs font-bold hover:text-white hover:border-blue-500/40 hover:bg-blue-500/5 transition-all active:scale-[0.99]"
        ><Plus size={14} /> Add review link</button>
      )}
    </div>
  );
};
