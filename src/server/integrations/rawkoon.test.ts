import { describe, expect, mock, test } from 'bun:test';
import type { RawkoonPayload } from '../types';
import type { RawkoonConfig } from './rawkoon';
import { getRawkoonSummary } from './rawkoon';

describe('Rawkoon client', () => {
  test('reports missing config', async () => {
    expect(await getRawkoonSummary({})).toEqual({ error: 'RAWKOON_URL not configured' });
    expect(await getRawkoonSummary({ url: 'http://rawkoon.test' })).toEqual({
      error: 'RAWKOON_API_KEY not configured',
    });
  });

  test('maps summary payload', async () => {
    const config: RawkoonConfig = { url: 'http://rawkoon.test/', apiKey: 'key123' };
    // getRawkoonSummary passes the upstream JSON through unchanged; the exact
    // shape doesn't matter here, only that it round-trips.
    const payload = { pending: 2, watched: 10, total: 12 } as unknown as RawkoonPayload;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe('http://rawkoon.test/api/labby/summary');
      const headers = init?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('key123');
      return Response.json(payload);
    }) as unknown as typeof fetch;

    const result = await getRawkoonSummary(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual(payload);
  });

  test('returns error on non-ok response', async () => {
    const config: RawkoonConfig = { url: 'http://rawkoon.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 502 }),
    ) as unknown as typeof fetch;

    const result = await getRawkoonSummary(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Rawkoon error: 502' });
  });

  test('returns error when fetch throws', async () => {
    const config: RawkoonConfig = { url: 'http://rawkoon.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('unreachable');
    }) as unknown as typeof fetch;

    const result = await getRawkoonSummary(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'unreachable' });
  });
});
