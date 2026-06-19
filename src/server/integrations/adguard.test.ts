import { describe, expect, mock, test } from 'bun:test';
import type { AdGuardConfig } from './adguard';
import { getAdGuardStats, setAdGuardProtection } from './adguard';

describe('AdGuard client', () => {
  test('reports missing config', async () => {
    expect(await getAdGuardStats({})).toEqual({ error: 'ADGUARD_URL not configured' });
    expect(await setAdGuardProtection({}, true)).toEqual({ error: 'ADGUARD_URL not configured' });
  });

  test('maps stats payload', async () => {
    const config: AdGuardConfig = { url: 'http://adguard.test', user: 'admin', pass: 'secret' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/control/stats')) {
        return Response.json({
          num_dns_queries: 1000,
          num_blocked_filtering: 250,
          avg_processing_time: 0.012,
        });
      }
      if (url.endsWith('/control/status')) {
        return Response.json({ rules_count: 42, protection_enabled: true });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getAdGuardStats(config);
    globalThis.fetch = originalFetch;

    expect('queries' in result).toBe(true);
    if ('queries' in result) {
      expect(result.queries).toBe(1000);
      expect(result.blockedPercent).toBe(25);
      expect(result.avgLatencyMs).toBe(12);
      expect(result.rulesCount).toBe(42);
      expect(result.protectionEnabled).toBe(true);
    }
  });

  test('returns error on failed stats response', async () => {
    const config: AdGuardConfig = { url: 'http://adguard.test' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/control/stats')) return new Response('fail', { status: 500 });
      if (url.endsWith('/control/status')) return Response.json({ protection_enabled: true });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getAdGuardStats(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'AdGuard stats error: 500' });
  });

  test('returns error when fetch throws', async () => {
    const config: AdGuardConfig = { url: 'http://adguard.test' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await getAdGuardStats(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'network down' });
  });

  test('toggles protection', async () => {
    const config: AdGuardConfig = { url: 'http://adguard.test' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/control/protection')) {
        expect(init?.method).toBe('POST');
        return new Response('', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await setAdGuardProtection(config, false, 60_000);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
  });
});
