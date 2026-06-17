import { beforeEach, describe, expect, test } from 'bun:test';
import { _clearCache, cached } from './cache';

describe('cached', () => {
  beforeEach(() => _clearCache());

  test('serves a fresh fetch and reuses it within the TTL', async () => {
    let calls = 0;
    const fetcher = async () => ({ value: ++calls });

    expect(await cached('k', 1000, fetcher)).toEqual({ value: 1 });
    expect(await cached('k', 1000, fetcher)).toEqual({ value: 1 }); // cache hit
    expect(calls).toBe(1);
  });

  test('refetches once the TTL has elapsed', async () => {
    let calls = 0;
    const fetcher = async () => ({ value: ++calls });

    await cached('k', 0, fetcher); // ttl 0 → always stale
    await cached('k', 0, fetcher);
    expect(calls).toBe(2);
  });

  test('single-flights concurrent cold requests into one upstream call', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { value: calls };
    };

    const [a, b, c] = await Promise.all([
      cached('k', 1000, fetcher),
      cached('k', 1000, fetcher),
      cached('k', 1000, fetcher),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  test('serves the last good payload when the upstream errors (rides out 429)', async () => {
    let mode: 'ok' | 'fail' = 'ok';
    const fetcher = async () => (mode === 'ok' ? { value: 42 } : { error: 'Reddit error: 429' });

    expect(await cached('k', 0, fetcher)).toEqual({ value: 42 }); // prime cache
    mode = 'fail';
    expect(await cached('k', 0, fetcher)).toEqual({ value: 42 }); // stale, not the 429
  });

  test('returns the error when nothing has ever succeeded', async () => {
    const fetcher = async () => ({ error: 'Reddit error: 429' });
    expect(await cached('k', 0, fetcher)).toEqual({ error: 'Reddit error: 429' });
  });
});
