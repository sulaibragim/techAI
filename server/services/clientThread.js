// Everything we exchanged with ONE client: texts both ways and calls, picked out of the
// company-wide OpenPhone log by the other party's number. A job card shows this, so the
// tech sees the whole conversation without opening the inbox.
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const otherPartyOfMessage = (m) => (m.direction === 'incoming' ? m.from : m.to);
const otherPartyOfCall = (c) =>
  (c.direction === 'inbound' || c.direction === 'incoming' ? c.from : c.to);

export function clientThread(messages, calls, phones) {
  const keys = new Set((phones || []).map(last10).filter(k => k.length === 10));
  if (!keys.size) return { messages: [], calls: [] };
  return {
    messages: (messages || []).filter(m => keys.has(last10(otherPartyOfMessage(m)))),
    calls: (calls || []).filter(c => keys.has(last10(otherPartyOfCall(c)))),
  };
}

export function callOtherParty(call) {
  return call ? otherPartyOfCall(call) : '';
}
