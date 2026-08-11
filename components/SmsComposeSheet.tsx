import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, Sparkles, AlertTriangle } from 'lucide-react';
import { sendSms } from '../smsService';
import { smsInfo, sanitizeSms } from '../smsText';
import {
  SMS_TEMPLATES, SPANISH_INVITE, fillSmsTemplate, resolveSmsTemplate,
  SmsLang, SmsVars,
} from '../smsTemplates';
import { useSettingsStore } from '../settingsStore';
import { getClientLang, tipFor, Weather } from '../dispatchMessage';
import { formatPhone } from '../clientUtils';

interface SmsComposeSheetProps {
  open: boolean;
  onClose: () => void;
  phone: string;
  clientName?: string;
  techName: string;
  etaMinutes?: number | null;
  isCar?: boolean;
  weather?: Weather | null;
  initialTemplateId?: string;
  /** Called after the SMS actually went out, with the exact text sent. */
  onSent?: (text: string) => void;
}

// Preview-first client texting: a template chip fills the box, the tech edits freely,
// the counter shows what the message will really cost (1 SMS / 2 SMS / expensive
// encoding), and nothing is sent until they hit Send. Plain conditional render on
// purpose — an AnimatePresence overlay that misses its exit frame can lock the UI.
export const SmsComposeSheet: React.FC<SmsComposeSheetProps> = ({
  open, onClose, phone, clientName, techName, etaMinutes, isCar, weather,
  initialTemplateId, onSent,
}) => {
  const companyName = useSettingsStore(s => s.companyName);
  const overrides = useSettingsStore(s => s.smsTemplates);

  const [templateId, setTemplateId] = useState('on-my-way');
  const [lang, setLang] = useState<SmsLang>('en');
  const [text, setText] = useState('');
  const [tipOn, setTipOn] = useState(false);
  const [inviteOn, setInviteOn] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const tipTextRef = useRef('');

  const vars: SmsVars = useMemo(() => ({
    name: (clientName || '').trim().split(/\s+/)[0],
    tech: techName,
    company: companyName,
    eta: etaMinutes,
  }), [clientName, techName, companyName, etaMinutes]);

  const buildText = (id: string, l: SmsLang) => {
    const def = SMS_TEMPLATES.find(t => t.id === id) || SMS_TEMPLATES[0];
    return fillSmsTemplate(resolveSmsTemplate(def, overrides, l), vars, l);
  };

  // Opening resets the sheet to the requested template; the client's opted-in language
  // is looked up once and pre-selects the ES toggle for Spanish speakers.
  useEffect(() => {
    if (!open) return;
    const id = initialTemplateId || 'on-my-way';
    tipTextRef.current = tipFor(!!isCar, weather || null); // stable pick per open
    setTemplateId(id);
    setTipOn(false);
    setInviteOn(false);
    setError('');
    setLang('en');
    setText(buildText(id, 'en'));
    let alive = true;
    getClientLang(phone).then(l => {
      if (alive && l === 'es') { setLang('es'); setText(buildText(id, 'es')); }
    });
    return () => { alive = false; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching template or language rebuilds the text (add-on chips reset with it).
  const pickTemplate = (id: string) => {
    setTemplateId(id);
    setTipOn(false); setInviteOn(false);
    setText(buildText(id, lang));
  };
  const pickLang = (l: SmsLang) => {
    if (l === lang) return;
    setLang(l);
    setTipOn(false); setInviteOn(false);
    setText(buildText(templateId, l));
  };

  // Add-on chips do plain text surgery so manual edits elsewhere survive the toggle.
  const toggleAddon = (on: boolean, setOn: (v: boolean) => void, addon: string) => {
    const clean = sanitizeSms(addon);
    if (on) {
      setText(t => t.replace(` ${clean}`, '').replace(clean, '').trimEnd());
      setOn(false);
    } else {
      setText(t => `${t.trimEnd()} ${clean}`);
      setOn(true);
    }
  };

  const info = useMemo(() => smsInfo(sanitizeSms(text)), [text]);
  const counterTone = info.encoding === 'UCS-2' ? 'text-red-400'
    : info.segments <= 1 ? 'text-emerald-400'
    : info.segments === 2 ? 'text-amber-400' : 'text-red-400';

  const handleSend = async () => {
    const clean = sanitizeSms(text).trim();
    if (!clean || sending) return;
    setSending(true);
    setError('');
    const ok = await sendSms(phone, clean);
    setSending(false);
    if (ok) {
      onSent?.(clean);
      onClose();
    } else {
      setError('Send failed - check the number or OpenPhone credits, then try again.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={sending ? undefined : onClose} />
      <div className="relative w-full md:max-w-lg bg-slate-900 border border-white/10 md:rounded-3xl rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-base flex items-center gap-2"><Send size={15} className="text-blue-400" /> Text the client</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{(clientName || '').trim() || 'Client'} · {formatPhone(phone)}</p>
          </div>
          <button onClick={onClose} disabled={sending} className="p-2 -m-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"><X size={17} /></button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {SMS_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => pickTemplate(t.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 border ${
                templateId === t.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
              }`}
            >{t.label}</button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-sm font-medium text-white outline-none focus:border-blue-500/50 resize-none leading-relaxed"
          placeholder="Message to the client…"
        />

        <div className="flex items-center justify-between gap-2 mt-2 mb-4">
          <span className={`text-[11px] font-bold tabular-nums ${counterTone}`}>
            {info.chars} chars · {info.segments || 1} SMS
            {info.encoding === 'UCS-2' && ' · emoji/symbols make this 2-3x pricier'}
          </span>
          <span className="flex gap-1.5 shrink-0">
            <button
              onClick={() => toggleAddon(tipOn, setTipOn, tipTextRef.current)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${tipOn ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
              title="Weather-aware safety tip"
            >+ tip</button>
            <button
              onClick={() => toggleAddon(inviteOn, setInviteOn, SPANISH_INVITE)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${inviteOn ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
              title="Offer to continue in Spanish"
            >+ Spanish</button>
            <span className="flex rounded-lg border border-white/10 overflow-hidden">
              {(['en', 'es'] as SmsLang[]).map(l => (
                <button
                  key={l}
                  onClick={() => pickLang(l)}
                  className={`px-2.5 py-1.5 text-[10px] font-bold uppercase transition-all ${lang === l ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                >{l}</button>
              ))}
            </span>
          </span>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 mb-3"><AlertTriangle size={13} /> {error}</p>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-slate-300 hover:text-white transition-all active:scale-95"
          >Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
          >
            {sending ? (<><Sparkles size={15} className="animate-pulse" /> Sending…</>)
              : (<><Send size={15} /> Send {info.segments > 1 ? `${info.segments} SMS` : 'SMS'}</>)}
          </button>
        </div>
      </div>
    </div>
  );
};
