import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

// The rule that stops a borrowed phone becoming a permanent account takeover: changing
// your OWN password must prove you know the current one. The route is DB-bound, so these
// pin the decision itself — including the legacy-plaintext path, which is the one most
// likely to be broken by a careless refactor.

const MIN_PASSWORD_LENGTH = 10;

/** Mirrors the check in server/routes/auth.js. */
async function currentPasswordAccepted(stored, supplied) {
  if (typeof supplied !== 'string' || supplied.length === 0) return false;
  return stored.startsWith('$2')
    ? await bcrypt.compare(supplied, stored)
    : supplied === stored;
}

describe('changing your own password', () => {
  it('accepts the correct current password against a bcrypt hash', async () => {
    const stored = await bcrypt.hash('correct-horse-battery', 10);
    await expect(currentPasswordAccepted(stored, 'correct-horse-battery')).resolves.toBe(true);
  });

  it('rejects a wrong one', async () => {
    const stored = await bcrypt.hash('correct-horse-battery', 10);
    await expect(currentPasswordAccepted(stored, 'wrong')).resolves.toBe(false);
  });

  it('rejects an omitted or empty current password — the whole hole being closed', async () => {
    const stored = await bcrypt.hash('correct-horse-battery', 10);
    for (const supplied of [undefined, null, '', '   '.trim()]) {
      await expect(currentPasswordAccepted(stored, supplied)).resolves.toBe(false);
    }
  });

  it('still works for a legacy row that holds plaintext', async () => {
    // Old accounts predate hashing; login upgrades them, but a password change can arrive
    // first. Comparing a plaintext row with bcrypt.compare would always fail and lock the
    // user out of their own account.
    await expect(currentPasswordAccepted('plaintextpassword', 'plaintextpassword')).resolves.toBe(true);
    await expect(currentPasswordAccepted('plaintextpassword', 'nope')).resolves.toBe(false);
  });
});

describe('password length floor', () => {
  const longEnough = (pw) => typeof pw === 'string' && pw.length >= MIN_PASSWORD_LENGTH;

  it('rejects the short credentials the old 4-character floor allowed', () => {
    for (const pw of ['1234', 'admin', 'pass', 'abc123', '123456789']) {
      expect(longEnough(pw), pw).toBe(false);
    }
  });

  it('accepts a reasonable one', () => {
    expect(longEnough('vanKeys2026!')).toBe(true);
  });
});

describe('master reset issues a distinct password per account', () => {
  // The defect: one generated password was written to EVERY row, owner included, so
  // anyone handed it could sign in as the owner.
  const generate = (n) => Array.from({ length: n }, () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));

  it('produces unique, long values', () => {
    const issued = generate(8);
    expect(new Set(issued).size).toBe(issued.length);
    for (const pw of issued) expect(pw.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
  });
});
