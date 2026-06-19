import { describe, expect, mock, test } from 'bun:test';
import type { TransmissionConfig } from './transmission';
import { getTransmissionTorrents, transmissionAction } from './transmission';

describe('Transmission client', () => {
  test('reports missing config', async () => {
    expect(await getTransmissionTorrents({})).toEqual({ error: 'TRANSMISSION_URL not configured' });
    expect(await transmissionAction({}, 'abc', 'pause')).toEqual({
      error: 'TRANSMISSION_URL not configured',
    });
  });

  test('maps torrent payload with 409 session handshake', async () => {
    const config: TransmissionConfig = {
      url: 'http://transmission.test/transmission/rpc',
      user: 'admin',
      pass: 'secret',
    };
    let calls = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (calls === 1) {
        return new Response('', {
          status: 409,
          headers: { 'X-Transmission-Session-Id': 'sess-1' },
        });
      }
      if (body.method === 'torrent-get') {
        return Response.json({
          result: 'success',
          arguments: {
            torrents: [
              {
                name: 'test.iso',
                status: 4,
                percentDone: 0.5,
                rateDownload: 1024,
                rateUpload: 256,
                eta: 60,
                uploadRatio: 1.2,
                hashString: 'deadbeef',
              },
            ],
          },
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getTransmissionTorrents(config);
    globalThis.fetch = originalFetch;

    expect('torrents' in result).toBe(true);
    if ('torrents' in result) {
      expect(result.torrents[0].name).toBe('test.iso');
      expect(result.torrents[0].progress).toBe(50);
      expect(result.torrents[0].state).toBe('downloading');
      expect(result.aggregateDlSpeed).toBe(1024);
    }
  });

  test('returns error on RPC failure', async () => {
    const config: TransmissionConfig = { url: 'http://transmission.test/rpc' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await getTransmissionTorrents(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Transmission RPC error: 500' });
  });

  test('returns error when fetch throws', async () => {
    const config: TransmissionConfig = { url: 'http://transmission.test/rpc' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('unreachable');
    }) as unknown as typeof fetch;

    const result = await getTransmissionTorrents(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'unreachable' });
  });

  test('pause and resume torrents', async () => {
    const config: TransmissionConfig = { url: 'http://transmission.test/rpc' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return Response.json({ result: 'success', arguments: {}, method: body.method });
    }) as unknown as typeof fetch;

    const pause = await transmissionAction(config, 'hash1', 'pause');
    const resume = await transmissionAction(config, 'hash1', 'resume');
    globalThis.fetch = originalFetch;

    expect(pause).toEqual({ ok: true });
    expect(resume).toEqual({ ok: true });
  });
});
