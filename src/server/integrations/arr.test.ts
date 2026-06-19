import { describe, expect, mock, test } from 'bun:test';
import type { ArrConfig } from './arr';
import { getArrSummary } from './arr';

describe('Arr client', () => {
  test('reports missing config', async () => {
    expect(await getArrSummary({}, 'radarr')).toEqual({ error: 'RADARR_URL not configured' });
    expect(await getArrSummary({ url: 'http://radarr.test' }, 'radarr')).toEqual({
      error: 'RADARR_API_KEY not configured',
    });
    expect(await getArrSummary({}, 'sonarr')).toEqual({ error: 'SONARR_URL not configured' });
  });

  test('maps radarr summary', async () => {
    const config: ArrConfig = { url: 'http://radarr.test/', apiKey: 'arr-key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Api-Key']).toBe('arr-key');

      if (url.includes('/api/v3/system/status')) {
        return Response.json({ version: '5.0.0' });
      }
      if (url.includes('/api/v3/queue')) {
        return Response.json({ totalRecords: 3 });
      }
      if (url.includes('/api/v3/wanted/missing')) {
        return Response.json({ totalRecords: 1 });
      }
      if (url.includes('/api/v3/calendar')) {
        return Response.json([
          {
            id: 10,
            title: 'Movie',
            inCinemas: '2026-07-01',
            status: 'announced',
            images: [{ coverType: 'poster', remoteUrl: 'https://img/poster.jpg' }],
          },
        ]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getArrSummary(config, 'radarr');
    globalThis.fetch = originalFetch;

    expect('version' in result).toBe(true);
    if ('version' in result) {
      expect(result.version).toBe('5.0.0');
      expect(result.queue).toBe(3);
      expect(result.missing).toBe(1);
      expect(result.upcoming[0].title).toBe('Movie');
      expect(result.upcoming[0].posterUrl).toBe('https://img/poster.jpg');
    }
  });

  test('maps sonarr episode calendar entries', async () => {
    const config: ArrConfig = { url: 'http://sonarr.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/system/status')) return Response.json({ version: '4.0' });
      if (url.includes('/queue')) return Response.json({ records: [] });
      if (url.includes('/wanted/missing')) return Response.json({ totalRecords: 0 });
      if (url.includes('/calendar')) {
        return Response.json([
          {
            id: 1,
            seasonNumber: 1,
            episodeNumber: 2,
            airDateUtc: '2026-07-02',
            series: {
              title: 'Series',
              images: [{ coverType: 'poster', remoteUrl: 'https://img/ep.jpg' }],
            },
          },
        ]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getArrSummary(config, 'sonarr');
    globalThis.fetch = originalFetch;

    expect('upcoming' in result).toBe(true);
    if ('upcoming' in result) {
      expect(result.upcoming[0].title).toContain('Series');
      expect(result.upcoming[0].title).toContain('S01E02');
    }
  });

  test('returns error on failed status fetch', async () => {
    const config: ArrConfig = { url: 'http://radarr.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/system/status')) return new Response('fail', { status: 503 });
      return Response.json({});
    }) as unknown as typeof fetch;

    const result = await getArrSummary(config, 'radarr');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'radarr error: 503' });
  });

  test('returns error when fetch throws', async () => {
    const config: ArrConfig = { url: 'http://radarr.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('arr down');
    }) as unknown as typeof fetch;

    const result = await getArrSummary(config, 'radarr');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'arr down' });
  });
});
