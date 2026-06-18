import { describe, expect, mock, test } from 'bun:test';
import { getSpeedtestSummary, triggerSpeedtestRun } from './speedtest';
import type { SpeedtestConfig } from './speedtest';

describe('Speedtest Tracker client', () => {
  test('reports missing config', async () => {
    expect(await getSpeedtestSummary({})).toEqual({
      error: 'SPEEDTEST_TRACKER_URL not configured',
    });

    expect(await getSpeedtestSummary({ url: 'http://speedtest.test' })).toEqual({
      error: 'SPEEDTEST_TRACKER_API_TOKEN not configured',
    });
  });

  test('maps speedtest results payload', async () => {
    const config: SpeedtestConfig = { url: 'http://speedtest.test', apiToken: 'test_token' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.headers).toBeDefined();
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test_token');
      expect(headers.Accept).toBe('application/json');

      if (url.includes('/api/v1/results')) {
        return Response.json({
          data: [
            {
              id: 10,
              ping: 15.5,
              download: 62_500_000,
              upload: 31_250_000,
              created_at: '2026-06-17T12:00:00.000Z',
            },
            {
              id: 9,
              ping: 18.2,
              download: 56_250_000,
              upload: 25_000_000,
              created_at: '2026-06-17T11:00:00.000Z',
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getSpeedtestSummary(config);
    globalThis.fetch = originalFetch;

    expect('history' in result).toBe(true);
    if ('history' in result) {
      expect(result.latest).toBeDefined();
      expect(result.latest?.ping).toBe(15.5);
      expect(result.latest?.download).toBe(500_000_000);
      expect(result.latest?.upload).toBe(250_000_000);
      expect(result.history.length).toBe(2);
      expect(result.history[1].id).toBe(9);
    }
  });

  test('triggers speedtest run', async () => {
    const config: SpeedtestConfig = { url: 'http://speedtest.test', apiToken: 'test_token' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/speedtests/run')) {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ message: 'queued' }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await triggerSpeedtestRun(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
  });
});
