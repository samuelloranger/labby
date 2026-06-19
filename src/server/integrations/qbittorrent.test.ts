import { describe, expect, mock, test } from 'bun:test';
import type { QbitConfig } from './qbittorrent';
import { getQBittorrentTorrents, qbittorrentAction } from './qbittorrent';

describe('qBittorrent client', () => {
  test('reports missing config', async () => {
    const result = await getQBittorrentTorrents({});
    expect(result).toEqual({ error: 'QBIT_URL not configured' });
  });

  test('maps torrent payload', async () => {
    const config: QbitConfig = { url: 'http://qb.test', user: 'admin', pass: 'admin' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc123; path=/' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            name: 'test.iso',
            progress: 0.42,
            dlspeed: 1024,
            upspeed: 256,
            state: 'downloading',
            hash: 'deadbeef',
            eta: 120,
            ratio: 1.5,
          },
        ]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getQBittorrentTorrents(config);
    globalThis.fetch = originalFetch;

    expect('torrents' in result).toBe(true);
    if ('torrents' in result) {
      expect(result.torrents[0].name).toBe('test.iso');
      expect(result.torrents[0].progress).toBe(42);
    }
  });

  // qBittorrent 5.x reads `hashes` from the x-www-form-urlencoded body and
  // rejects it as a query param with 400. Regression test: the action must
  // send hashes in the body, never the URL.
  test('pause sends hashes in the request body, not the query string', async () => {
    const config: QbitConfig = { url: 'http://qb.test', user: 'admin', pass: 'admin' };
    let captured: { url: string; body: string; contentType: string | null } | null = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', { status: 200, headers: { 'set-cookie': 'SID=x; path=/' } });
      }
      captured = {
        url,
        body: init?.body ? String(init.body) : '',
        contentType: new Headers(init?.headers).get('Content-Type'),
      };
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await qbittorrentAction(config, 'HASH123', 'pause');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
    expect(captured).not.toBeNull();
    expect(captured?.url).not.toContain('hashes=');
    expect(captured?.body).toContain('hashes=HASH123');
    expect(captured?.contentType).toContain('application/x-www-form-urlencoded');
  });
});
