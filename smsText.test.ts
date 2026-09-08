import { describe, it, expect } from 'vitest';
import { sanitizeSms, smsInfo } from './smsText';
import { SMS_TEMPLATES, SPANISH_INVITE, fillSmsTemplate } from './smsTemplates';

describe('sanitizeSms', () => {
  it('replaces typographic chars with GSM twins', () => {
    expect(sanitizeSms('10–15 min — ok')).toBe('10-15 min - ok');
    expect(sanitizeSms('‘hi’ “there”…')).toBe(`'hi' "there"...`);
    expect(sanitizeSms('SUEÑO SÍ')).toBe('SUEÑO SI'); // Ñ is GSM-safe, Í is not
    expect(sanitizeSms('está aquí')).toBe('esta aqui');
  });
  it('normalizes invisible spaces', () => {
    expect(sanitizeSms('a b c​d')).toBe('a b cd');
  });
  it('keeps GSM-safe Spanish characters', () => {
    expect(sanitizeSms('¿mañana? ¡sí!')).toBe('¿mañana? ¡si!');
  });
  it('rescues the symbols our own templates use', () => {
    // The digest's warning sign and multiplication sign are not in GSM-7: one of them
    // alone re-encoded the whole wrap at 70 chars a segment, tripling its price.
    expect(sanitizeSms('⚠️ Watch: 2× $0 completions')).toBe('! Watch: 2x $0 completions');
    expect(sanitizeSms('a	b')).toBe('a b');
  });
  it('keeps a digest with fraud flags on one segment', () => {
    const wrap = sanitizeSms('TrustKey daily wrap - 2026-09-08: $1,240 from 5 jobs today. '
      + '3 unpaid ($712 outstanding). 4 booked tomorrow. ⚠ Watch: Mike: 3 no-sale visits, 2× $0.');
    const info = smsInfo(wrap);
    expect(info.encoding).toBe('GSM-7');
    expect(info.segments).toBe(1);
  });
});

describe('smsInfo', () => {
  it('prices plain GSM text at 160 per segment', () => {
    expect(smsInfo('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', segments: 1 });
    expect(smsInfo('a'.repeat(161))).toMatchObject({ encoding: 'GSM-7', segments: 2 });
    expect(smsInfo('a'.repeat(306))).toMatchObject({ segments: 2 });
    expect(smsInfo('a'.repeat(307))).toMatchObject({ segments: 3 });
  });
  it('a single non-GSM char flips the whole message to UCS-2 (70 per segment)', () => {
    const text = 'a'.repeat(100) + '—';
    expect(smsInfo(text)).toMatchObject({ encoding: 'UCS-2', segments: 2 });
    expect(smsInfo(sanitizeSms(text))).toMatchObject({ encoding: 'GSM-7', segments: 1 });
  });
  it('counts GSM extension chars twice', () => {
    expect(smsInfo('€'.repeat(80))).toMatchObject({ encoding: 'GSM-7', segments: 1 }); // 160 septets
    expect(smsInfo('€'.repeat(81))).toMatchObject({ segments: 2 });
  });
  it('counts astral emoji as two UCS-2 units', () => {
    expect(smsInfo('\u{1F600}'.repeat(35))).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(smsInfo('\u{1F600}'.repeat(36))).toMatchObject({ segments: 2 });
  });
});

describe('sms templates', () => {
  const vars = { name: 'John', tech: 'Alex', company: 'TrustKey', eta: 15 };
  it('every default template fits one GSM segment with realistic values', () => {
    for (const def of SMS_TEMPLATES) {
      for (const lang of ['en', 'es'] as const) {
        const text = fillSmsTemplate(lang === 'es' ? def.es : def.en, vars, lang);
        const info = smsInfo(text);
        expect(info.encoding, `${def.id}/${lang} must stay GSM-7: ${text}`).toBe('GSM-7');
        expect(info.segments, `${def.id}/${lang} must fit 1 segment: ${text}`).toBe(1);
      }
    }
  });
  it('the Spanish invite is GSM-safe', () => {
    expect(smsInfo(sanitizeSms(SPANISH_INVITE)).encoding).toBe('GSM-7');
  });
  it('fills fallbacks when data is missing', () => {
    const text = fillSmsTemplate('Hi {name}! {tech} from {company} is about {eta} min out.', {}, 'en');
    expect(text).toBe('Hi there! your technician from our team is about 15 min out.');
  });
});
