import { describe, expect, mock, test } from 'bun:test';
import type { SabnzbdConfig } from './sabnzbd';
import { getSabnzbdQueue, sabnzbdAction } from './sabnzbd';

describe('SABnzbd client', () => {
  test('reports missing config', async () => {
    expect(await getSabnzbdQueue({})).toEqual({ error: 'SABNZBD_URL not configured' });
    expect(await getSabnzbdQueue({ url: 'http://sab.test' })).toEqual({
      error: 'SABNZBD_API_KEY not configured',
    });
  });

  test('maps the queue', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test/', apiKey: 'sab-key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('mode=queue');
      expect(url).toContain('apikey=sab-key');
      expect(url).toContain('output=json');
      return Response.json({
        queue: {
          paused: false,
          kbpersec: '2048.0',
          timeleft: '0:12:34',
          mbleft: '500.0',
          slots: [
            {
              nzo_id: 'SABnzbd_nzo_abc',
              filename: 'Big.Linux.ISO',
              percentage: '42',
              mbleft: '500.0',
              timeleft: '0:12:34',
              status: 'Downloading',
            },
          ],
        },
      });
    }) as unknown as typeof fetch;

    const result = await getSabnzbdQueue(config);
    globalThis.fetch = originalFetch;

    expect('slots' in result).toBe(true);
    if ('slots' in result) {
      expect(result.paused).toBe(false);
      expect(result.speedBps).toBe(2048 * 1024);
      expect(result.timeLeft).toBe('0:12:34');
      expect(result.slots[0].id).toBe('SABnzbd_nzo_abc');
      expect(result.slots[0].name).toBe('Big.Linux.ISO');
      expect(result.slots[0].progress).toBe(42);
      expect(result.slots[0].status).toBe('Downloading');
    }
  });

  test('surfaces a bad-apikey error body', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test', apiKey: 'wrong' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      Response.json({ error: 'API Key Incorrect' }),
    ) as unknown as typeof fetch;
    const result = await getSabnzbdQueue(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'API Key Incorrect' });
  });

  test('returns error on non-ok response', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test', apiKey: 'key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 500 }),
    ) as unknown as typeof fetch;
    const result = await getSabnzbdQueue(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'SABnzbd error: 500' });
  });

  test('pause action hits the right URL', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test', apiKey: 'sab-key' };
    let calledUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return Response.json({ status: true, nzo_ids: ['SABnzbd_nzo_abc'] });
    }) as unknown as typeof fetch;

    const result = await sabnzbdAction(config, 'SABnzbd_nzo_abc', 'pause');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
    expect(calledUrl).toContain('mode=queue');
    expect(calledUrl).toContain('name=pause');
    expect(calledUrl).toContain('value=SABnzbd_nzo_abc');
    expect(calledUrl).toContain('apikey=sab-key');
  });
});
