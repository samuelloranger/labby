import { describe, expect, mock, test } from 'bun:test';
import type { QbitConfig } from './qbittorrent';
import { getQBittorrentTorrents, qbittorrentAction } from './qbittorrent';

describe('qBittorrent client', () => {
  test('reports missing config', async () => {
    const result = await getQBittorrentTorrents({});
    expect(result).toEqual({ error: 'QBIT_URL not configured' });
    expect(await qbittorrentAction({}, 'hash', 'pause')).toEqual({
      error: 'QBIT_URL not configured',
    });
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
      expect(result.aggregateDlSpeed).toBe(1024);
    }
  });

  test('re-authenticates on 403', async () => {
    const config: QbitConfig = { url: 'http://qb.test', user: 'admin', pass: 'admin' };
    let infoCalls = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=newsid; path=/' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        infoCalls++;
        if (infoCalls === 1) return new Response('forbidden', { status: 403 });
        return Response.json([]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getQBittorrentTorrents(config);
    globalThis.fetch = originalFetch;

    expect('torrents' in result).toBe(true);
    expect(infoCalls).toBe(2);
  });

  test('returns error on non-ok torrent list', async () => {
    const config: QbitConfig = { url: 'http://qb.test' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v2/torrents/info')) return new Response('fail', { status: 500 });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getQBittorrentTorrents(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'qBittorrent error: 500' });
  });

  test('returns error when fetch throws', async () => {
    const config: QbitConfig = { url: 'http://qb.test' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('qb down');
    }) as unknown as typeof fetch;

    const result = await getQBittorrentTorrents(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'qb down' });
  });

  test('pauses and resumes torrents', async () => {
    const config: QbitConfig = { url: 'http://qb.test' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/torrents/stop')) {
        expect(init?.method).toBe('POST');
        return new Response('', { status: 200 });
      }
      if (url.includes('/torrents/start')) {
        expect(init?.method).toBe('POST');
        return new Response('', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const pause = await qbittorrentAction(config, 'hash', 'pause');
    const resume = await qbittorrentAction(config, 'hash', 'resume');
    globalThis.fetch = originalFetch;

    expect(pause).toEqual({ ok: true });
    expect(resume).toEqual({ ok: true });
  });

  // qBittorrent 5.x reads `hashes` from the x-www-form-urlencoded body and
  // rejects it as a query param with 400. Regression test: the action must
  // send hashes in the body, never the URL.
  test('pause sends hashes in the request body, not the query string', async () => {
    const config: QbitConfig = { url: 'http://qb.test', user: 'admin', pass: 'admin' };
    // Array holder, not `let … | null`: a variable assigned only inside the mock
    // closure collapses to `null` under TS flow analysis, turning `captured?.url`
    // into a `never` access. Array element reads keep the element type.
    const captured: { url: string; body: string; contentType: string | null }[] = [];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', { status: 200, headers: { 'set-cookie': 'SID=x; path=/' } });
      }
      captured.push({
        url,
        body: init?.body ? String(init.body) : '',
        contentType: new Headers(init?.headers).get('Content-Type'),
      });
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await qbittorrentAction(config, 'HASH123', 'pause');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
    expect(captured).toHaveLength(1);
    expect(captured[0].url).not.toContain('hashes=');
    expect(captured[0].body).toContain('hashes=HASH123');
    expect(captured[0].contentType).toContain('application/x-www-form-urlencoded');
  });
});
