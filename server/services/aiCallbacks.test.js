import { describe, it, expect } from 'vitest';
import { callbackPromised, callbackText, prettyPhone } from './aiCallbacks.js';
import { smsInfo } from './smsText.js';

const OURS = '+16232004499';
const CALLER = '+16025551708';
const sona = (content) => ({ identifier: OURS, content });
const caller = (content) => ({ identifier: CALLER, content });

// The real 2026-09-10 call that started this: Sona took a message and closed with a promise.
const TAKEN_SUMMARY = {
  status: 'completed',
  summary: ['The caller requested a quote for key fob programming. Since the pricing information was unavailable, a message was taken for the team to follow up.'],
  jobs: [
    { name: 'Answer questions', result: { data: [{ name: 'What is the quote for key fob programming?', value: "I don't have that specific price listed." }] } },
    { name: 'Message taking', result: { data: [{ name: 'First and last name', value: 'Liam Templaburger' }, { name: 'Message summary', value: 'Quote for key fob programming' }] } },
  ],
};

describe('callbackPromised', () => {
  it('fires when Sona took a message', () => {
    expect(callbackPromised({ summary: TAKEN_SUMMARY, dialogue: null, ownNumber: OURS })).toBe(true);
  });

  it('fires on her spoken promise alone, before the summary exists', () => {
    const dialogue = [
      caller('Need a quote for a key fob programming.'),
      sona("I've noted that down, and someone will follow-up with you as soon as possible."),
    ];
    expect(callbackPromised({ summary: null, dialogue, ownNumber: OURS })).toBe(true);
  });

  it('hears the other ways she says it, English and Spanish', () => {
    for (const line of [
      "We'll call you back shortly.",
      'Someone from the team will get back to you today.',
      'A technician will be reaching out in a few minutes.',
      'Alguien le devolverá la llamada lo antes posible.',
      'Nuestro equipo se comunicará con usted pronto.',
    ]) {
      expect(callbackPromised({ summary: null, dialogue: [sona(line)], ownNumber: OURS }), line).toBe(true);
    }
  });

  it('hears the promise our own call script ends every call on', () => {
    const dialogue = [
      sona('So: dead Schlage on a locked unit at 1840 W Emelita in Mesa, you want it open and rekeyed with two keys. Right?'),
      caller('Right.'),
      sona("I'm sending this to our available technician now. He'll call you within five minutes."),
    ];
    expect(callbackPromised({ summary: null, dialogue, ownNumber: OURS })).toBe(true);
    for (const line of [
      "I'm sending this to our available technician now.",
      "He'll call you within five minutes.",
      'Let me have dispatch confirm a window with you.',
    ]) {
      expect(callbackPromised({ summary: null, dialogue: [sona(line)], ownNumber: OURS }), line).toBe(true);
    }
  });

  it('does not take an offer for a promise', () => {
    for (const line of [
      'Would you like me to have someone call you?',
      'Do you want the technician to call you back?',
      'Should I have dispatch confirm a window with you?',
    ]) {
      expect(callbackPromised({ summary: null, dialogue: [sona(line)], ownNumber: OURS }), line).toBe(false);
    }
  });

  it('stays quiet when the caller turned the message down', () => {
    const summary = { status: 'completed', summary: ['The caller asked about hours.'], jobs: [
      { name: 'Answer questions', result: { data: [{ name: 'Hours?', value: 'Open 24/7.' }] } },
    ] };
    const dialogue = [
      caller('Are you open on Sunday?'),
      sona('Yes, we are open 24/7. Would you like me to take a message so someone can follow-up with you?'),
      caller('No thanks.'),
      sona('Have a wonderful day.'),
    ];
    expect(callbackPromised({ summary, dialogue, ownNumber: OURS })).toBe(false);
  });

  it("ignores a message job that captured nothing, and the caller's own words", () => {
    const summary = { status: 'completed', jobs: [{ name: 'Message taking', result: { data: [{ name: 'First and last name', value: '' }] } }] };
    const dialogue = [caller("I'll get back to you, I will call you back later.")];
    expect(callbackPromised({ summary, dialogue, ownNumber: OURS })).toBe(false);
  });

  it('is false when there is nothing to read yet', () => {
    expect(callbackPromised({ summary: null, dialogue: null, ownNumber: OURS })).toBe(false);
  });
});

describe('callbackText', () => {
  it('reads as one short, tappable text', () => {
    const text = callbackText({ phone: CALLER, name: 'Liam Templaburger', note: 'Quote for key fob programming' });
    expect(text).toBe('Call back: (602) 555-1708, Liam Templaburger\nSona: Quote for key fob programming');
    expect(smsInfo(text)).toMatchObject({ encoding: 'GSM-7', segments: 1 });
  });

  it('cuts a long message, never the number', () => {
    const text = callbackText({ phone: CALLER, name: 'Maria de los Angeles Gutierrez-Fernandez', note: 'x '.repeat(200) });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain('(602) 555-1708');
    expect(smsInfo(text).segments).toBe(1);
  });

  it('still works with no name or note', () => {
    expect(callbackText({ phone: CALLER })).toBe('Call back: (602) 555-1708');
  });
});

describe('prettyPhone', () => {
  it('formats US numbers and leaves the rest alone', () => {
    expect(prettyPhone('+16025551708')).toBe('(602) 555-1708');
    expect(prettyPhone('6025551708')).toBe('(602) 555-1708');
    expect(prettyPhone('+447911123456')).toBe('+447911123456');
  });
});
