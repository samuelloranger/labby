import { describe, expect, mock, test } from 'bun:test';
import { checkSites } from './monitor';

describe('monitor client', () => {
  test('returns empty summary when no sites configured', async () => {
    expect(await checkSites({})).toEqual({
      sites: [],
      summary: { up: 0, warn: 0, down: 0 },
    });
  });

  test('marks ok status codes as up', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await checkSites({
      sites: [
        {
          title: 'Test',
          url: 'https://test.example',
          checkUrl: 'http://test:8080',
          icon: 'lucide:check',
        },
      ],
    });
    globalThis.fetch = originalFetch;

    expect(result.summary.up).toBe(1);
    expect(result.sites[0].status).toBe('up');
    expect(result.sites[0].latencyMs).not.toBeNull();
  });

  test('marks 5xx as down', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 503 }),
    ) as unknown as typeof fetch;

    const result = await checkSites({
      sites: [
        {
          title: 'Test',
          url: 'https://test.example',
          checkUrl: 'http://test:8080',
          icon: 'lucide:check',
        },
      ],
    });
    globalThis.fetch = originalFetch;

    expect(result.summary.down).toBe(1);
    expect(result.sites[0].status).toBe('down');
  });

  test('marks fetch failure as down', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const result = await checkSites({
      sites: [
        {
          title: 'Test',
          url: 'https://test.example',
          checkUrl: 'http://test:8080',
          icon: 'lucide:check',
        },
      ],
    });
    globalThis.fetch = originalFetch;

    expect(result.summary.down).toBe(1);
    expect(result.sites[0].status).toBe('down');
    expect(result.sites[0].latencyMs).toBeNull();
  });

  test('marks timeout as warn', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      const err = new Error('The operation timed out');
      err.name = 'TimeoutError';
      throw err;
    }) as unknown as typeof fetch;

    const result = await checkSites({
      sites: [
        {
          title: 'Test',
          url: 'https://test.example',
          checkUrl: 'http://test:8080',
          icon: 'lucide:check',
        },
      ],
    });
    globalThis.fetch = originalFetch;

    expect(result.summary.warn).toBe(1);
    expect(result.sites[0].status).toBe('warn');
  });
});
