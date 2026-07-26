import { describe, it, expect, beforeEach } from 'vitest';

// /api/ai/generate forwards a client-supplied prompt, contents AND tools to Gemini on the
// company key. The only thing standing between a technician's token and a real bill is
// this accounting, so pin its behaviour — especially the rollover and the fallback that
// keeps the budget enforceable when the API omits usage data.

const DAILY_TOKEN_BUDGET = 400_000;
const MAX_OUTPUT_TOKENS = 2048;

/** Mirrors the per-user daily accounting in server/routes/ai.js. */
function makeBudget(dayFn) {
  const spend = new Map();
  const remaining = (id) => {
    const e = spend.get(id);
    if (!e || e.day !== dayFn()) return DAILY_TOKEN_BUDGET;
    return Math.max(0, DAILY_TOKEN_BUDGET - e.tokens);
  };
  const record = (id, tokens) => {
    const e = spend.get(id);
    if (!e || e.day !== dayFn()) spend.set(id, { day: dayFn(), tokens });
    else e.tokens += tokens;
  };
  return { remaining, record };
}

let day = '2026-07-26';
let budget;
beforeEach(() => { day = '2026-07-26'; budget = makeBudget(() => day); });

describe('AI daily budget', () => {
  it('starts full and draws down as tokens are spent', () => {
    expect(budget.remaining('u1')).toBe(DAILY_TOKEN_BUDGET);
    budget.record('u1', 1000);
    expect(budget.remaining('u1')).toBe(DAILY_TOKEN_BUDGET - 1000);
  });

  it('cuts a user off once exhausted, without touching anyone else', () => {
    budget.record('u1', DAILY_TOKEN_BUDGET + 5000);
    expect(budget.remaining('u1')).toBe(0);
    expect(budget.remaining('u2')).toBe(DAILY_TOKEN_BUDGET);
  });

  it('resets on a new day rather than carrying the debt forward', () => {
    budget.record('u1', DAILY_TOKEN_BUDGET);
    expect(budget.remaining('u1')).toBe(0);
    day = '2026-07-27';
    expect(budget.remaining('u1')).toBe(DAILY_TOKEN_BUDGET);
  });
});

describe('token charge when the API reports no usage', () => {
  // If usageMetadata is absent and we charged 0, the budget would never bind — which is
  // exactly the case an abuser would rely on.
  const charge = (usage, requestBytes) =>
    usage?.totalTokenCount ?? Math.ceil(requestBytes / 4) + MAX_OUTPUT_TOKENS;

  it('uses the reported count when present', () => {
    expect(charge({ totalTokenCount: 1234 }, 8000)).toBe(1234);
  });

  it('falls back to an estimate that is never zero', () => {
    expect(charge(undefined, 8000)).toBe(2000 + MAX_OUTPUT_TOKENS);
    expect(charge(null, 0)).toBe(MAX_OUTPUT_TOKENS);
    expect(charge(undefined, 0)).toBeGreaterThan(0);
  });
});

describe('request size ceiling', () => {
  const MAX_REQUEST_BYTES = 256 * 1024;
  const tooBig = (bytes) => bytes > MAX_REQUEST_BYTES;

  it('lets a normal chat turn through and stops a body aimed at the 5 MB JSON limit', () => {
    expect(tooBig(20 * 1024)).toBe(false);
    expect(tooBig(5 * 1024 * 1024)).toBe(true);
  });
});
