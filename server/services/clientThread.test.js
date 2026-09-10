import { describe, it, expect } from 'vitest';
import { clientThread, callOtherParty } from './clientThread.js';

const OWN = '+14805550000';
const CLIENT = '+16023732379';

const messages = [
  { id: 'm1', from: CLIENT, to: OWN, direction: 'incoming', body: 'locked out' },
  { id: 'm2', from: OWN, to: CLIENT, direction: 'outgoing', body: 'on my way' },
  { id: 'm3', from: '+15205551111', to: OWN, direction: 'incoming', body: 'someone else' },
  { id: 'm4', from: OWN, to: '+15205551111', direction: 'outgoing', body: 'reply to someone else' },
];
const calls = [
  { id: 'c1', from: CLIENT, to: OWN, direction: 'incoming', status: 'completed' },
  { id: 'c2', from: OWN, to: CLIENT, direction: 'outgoing', status: 'completed' },
  { id: 'c3', from: '+15205551111', to: OWN, direction: 'inbound', status: 'missed' },
];

describe('clientThread', () => {
  it('keeps both directions of texts and calls with the client, nobody else', () => {
    const t = clientThread(messages, calls, ['(602) 373-2379']);
    expect(t.messages.map(m => m.id)).toEqual(['m1', 'm2']);
    expect(t.calls.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('matches the client on a second number too', () => {
    const t = clientThread(messages, calls, ['602-373-2379', '520 555 1111']);
    expect(t.messages).toHaveLength(4);
    expect(t.calls).toHaveLength(3);
  });

  it('does not let our own number or an empty phone pull in the whole company log', () => {
    // Our number is the "from" of every outgoing text — matching on it would leak every thread.
    expect(clientThread(messages, calls, ['', null, '123']).messages).toEqual([]);
    expect(clientThread(messages, calls, [OWN]).messages).toEqual([]);
  });

  it('names the client side of a call for either direction', () => {
    expect(callOtherParty(calls[0])).toBe(CLIENT);
    expect(callOtherParty(calls[1])).toBe(CLIENT);
    expect(callOtherParty(calls[2])).toBe('+15205551111');
  });
});
