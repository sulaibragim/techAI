// One-tap client texts. Every default is written to fit ONE GSM-7 segment (160 chars)
// with realistic names — that is the whole economy of the feature; see smsText.ts.
// Spanish variants avoid á/í/ó/ú on purpose (not in GSM-7; ñ/¿/¡/é are fine).
// Owner/manager can override any text in Settings; overrides live in
// settingsStore.smsTemplates and sync like every other keyed map.
import { sanitizeSms } from './smsText';

export type SmsLang = 'en' | 'es';

export interface SmsTemplateDef {
  id: string;
  label: string; // what the tech sees on the chip
  en: string;
  es: string;
}

export const SMS_TEMPLATES: SmsTemplateDef[] = [
  {
    id: 'on-my-way', label: 'On my way',
    en: 'Hi {name}! {tech} from {company} is on the way, about {eta} min out. Reply here with any questions.',
    es: 'Hola {name}! {tech} de {company} va en camino, llega en unos {eta} min. Responda aqui si tiene preguntas.',
  },
  {
    id: 'eta-update', label: 'ETA update',
    en: '{company}: about {eta} min away now.',
    es: '{company}: a unos {eta} min de llegar.',
  },
  {
    id: 'running-late', label: 'Running late',
    en: 'Hi {name}, sorry - running about {eta} min behind. Thanks for your patience! - {company}',
    es: 'Hola {name}, disculpe - voy unos {eta} min atrasado. Gracias por su paciencia. - {company}',
  },
  {
    id: 'outside', label: "I'm outside",
    en: 'Hi {name}, {tech} from {company} is outside now.',
    es: 'Hola {name}, {tech} de {company} ya esta afuera.',
  },
  {
    id: 'no-answer', label: 'No answer',
    en: "Hi {name}, {tech} from {company} is at your address but can't reach you. Please call when you see this.",
    es: 'Hola {name}, {tech} de {company} esta en su direccion pero no logra contactarle. Llame cuando pueda, por favor.',
  },
  {
    id: 'done', label: 'All done',
    en: 'Hi {name}, all done! Thanks for choosing {company}. - {tech}',
    es: 'Hola {name}, el trabajo esta terminado. Gracias por elegir {company}. - {tech}',
  },
];

// Offered as a one-tap add-on for a client's FIRST message, not glued to every text.
// "SI" not "SÍ": the accented Í alone would flip a whole message to the 70-char encoding.
export const SPANISH_INVITE = 'Para español, responda SI.';

export interface SmsVars {
  name?: string;
  tech?: string;
  company?: string;
  eta?: number | null;
}

/** Substitute {name}/{tech}/{company}/{eta} and GSM-sanitize. eta falls back to 15 —
 *  the preview-first flow means the tech always SEES the number before it sends. */
export function fillSmsTemplate(template: string, vars: SmsVars, lang: SmsLang = 'en'): string {
  const map: Record<string, string> = {
    name: (vars.name || '').trim() || (lang === 'es' ? 'hola' : 'there'),
    tech: (vars.tech || '').trim() || (lang === 'es' ? 'su tecnico' : 'your technician'),
    company: (vars.company || '').trim() || 'our team',
    eta: String(Math.max(1, Math.round(vars.eta ?? 15))),
  };
  return sanitizeSms(template.replace(/\{(\w+)\}/g, (m, k) => map[k] ?? m));
}

export type SmsTemplateOverrides = Record<string, { en?: string; es?: string }>;

/** The effective template text: the owner's Settings override when present, else the default. */
export function resolveSmsTemplate(def: SmsTemplateDef, overrides: SmsTemplateOverrides | undefined, lang: SmsLang): string {
  const o = overrides?.[def.id];
  const text = lang === 'es' ? o?.es : o?.en;
  return (text || '').trim() || (lang === 'es' ? def.es : def.en);
}
