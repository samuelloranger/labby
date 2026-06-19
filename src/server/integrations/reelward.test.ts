import { describe, expect, mock, test } from 'bun:test';
import type { ReelwardConfig } from './reelward';
import { getReelwardSummary } from './reelward';

describe('Reelward client', () => {
  test('reports missing config', async () => {
    expect(await getReelwardSummary({})).toEqual({ error: 'REELWARD_URL not configured' });
    expect(await getReelwardSummary({ url: 'http://reelward.test' })).toEqual({
      error: 'REELWARD_API_KEY not configured',
    });
  });

  test('maps summary payload', async () => {
    const config: ReelwardConfig = { url: 'http://reelward.test/', apiKey: 'key123' };
    const payload = { pending: 2, watched: 10, total: 12 };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe('http://reelward.test/api/labby/summary');
      const headers = init?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('key123');
      return Response.json(payload);
    }) as unknown as typeof fetch;

    const result = await getReelwardSummary(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual(payload);
  });

  test('returns error on non-ok response', async () => {
    const config: ReelwardConfig = { url: 'http://reelward.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 502 }),
    ) as unknown as typeof fetch;

    const result = await getReelwardSummary(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Reelward error: 502' });
  });

  test('returns error when fetch throws', async () => {
    const config: ReelwardConfig = { url: 'http://reelward.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('unreachable');
    }) as unknown as typeof fetch;

    const result = await getReelwardSummary(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'unreachable' });
  });
});
