import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal browser surface the module touches. Declared before the import so the module's
// top-level `load()` sees a working store.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const {
  sendWrite, flushWrites, resetWriteQueue, pendingWriteCount,
  subscribeToWrites, setSessionExpiredHandler, clearWriteError,
} = await import('./writeQueue');

const res = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) });
const write = (over: Partial<Parameters<typeof sendWrite>[0]> = {}) =>
  ({ url: '/api/jobs/1', method: 'PUT' as const, body: { a: 1 }, label: 'job #1', ...over });

let state: { pending: number; lastError: string | null };
beforeEach(() => {
  resetWriteQueue();
  clearWriteError();
  setSessionExpiredHandler(() => {});
  subscribeToWrites(s => { state = s; });
  vi.restoreAllMocks();
});

describe('write outbox', () => {
  it('reports success and queues nothing', async () => {
    (globalThis as any).fetch = vi.fn(async () => res(200));
    await expect(sendWrite(write())).resolves.toBe(true);
    expect(pendingWriteCount()).toBe(0);
    expect(state.lastError).toBeNull();
  });

  it('holds a write when the server is down, then delivers it on flush', async () => {
    // This is the whole point: the old code was `.catch(() => {})`, so a tech's edit in a
    // basement vanished and the next poll reverted the screen with no explanation.
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('offline'); });
    await expect(sendWrite(write())).resolves.toBe(false);
    expect(pendingWriteCount()).toBe(1);

    (globalThis as any).fetch = vi.fn(async () => res(200));
    await flushWrites();
    expect(pendingWriteCount()).toBe(0);
  });

  it('retries a 500 but gives up on a 403, telling the user why', async () => {
    (globalThis as any).fetch = vi.fn(async () => res(500));
    await sendWrite(write());
    expect(pendingWriteCount()).toBe(1); // server's fault — keep it

    resetWriteQueue();
    (globalThis as any).fetch = vi.fn(async () => res(403));
    await expect(sendWrite(write({ label: 'stock for Ilco H84' }))).resolves.toBe(false);
    expect(pendingWriteCount()).toBe(0); // never going to succeed — don't retry forever
    expect(state.lastError).toMatch(/permission/i);
    expect(state.lastError).toContain('stock for Ilco H84');
  });

  it('signals an expired session on 401 and keeps the work', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    (globalThis as any).fetch = vi.fn(async () => res(401));
    await sendWrite(write());
    expect(onExpired).toHaveBeenCalled();
    expect(pendingWriteCount()).toBe(1); // flushes after they sign in again
    expect(state.lastError).toMatch(/session expired/i);
  });

  it('collapses repeated edits of the same record to the newest', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('offline'); });
    await sendWrite(write({ body: { v: 1 }, dedupe: 'job:1' }));
    await sendWrite(write({ body: { v: 2 }, dedupe: 'job:1' }));
    await sendWrite(write({ body: { v: 3 }, dedupe: 'job:1' }));
    expect(pendingWriteCount()).toBe(1);

    const sent: any[] = [];
    (globalThis as any).fetch = vi.fn(async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return res(200); });
    await flushWrites();
    expect(sent).toEqual([{ v: 3 }]);
  });

  it('does NOT collapse settings deltas, which each carry different keys', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('offline'); });
    await sendWrite({ url: '/api/settings', method: 'PUT', body: { expenses: [1] }, label: 'your expense' });
    await sendWrite({ url: '/api/settings', method: 'PUT', body: { priceBook: [2] }, label: 'your price book' });
    expect(pendingWriteCount()).toBe(2); // losing either would lose the keys only it carried
  });

  it('survives a reload — the queue is persisted', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('offline'); });
    await sendWrite(write());
    expect(store.get('techai-write-queue-v1')).toContain('/api/jobs/1');
  });
});
