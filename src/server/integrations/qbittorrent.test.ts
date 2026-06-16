import { describe, expect, mock, test } from 'bun:test';

describe('qBittorrent client', () => {
  test('reports missing env', async () => {
    const prev = process.env.QBIT_URL;
    delete process.env.QBIT_URL;
    const { getQBittorrentTorrents } = await import('./qbittorrent');
    const result = await getQBittorrentTorrents();
    expect(result).toEqual({ error: 'QBIT_URL not configured' });
    process.env.QBIT_URL = prev;
  });

  test('maps torrent payload', async () => {
    process.env.QBIT_URL = 'http://qb.test';
    process.env.QBIT_USER = 'admin';
    process.env.QBIT_PASS = 'admin';

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

    const { getQBittorrentTorrents } = await import('./qbittorrent');
    const result = await getQBittorrentTorrents();
    globalThis.fetch = originalFetch;

    expect('torrents' in result).toBe(true);
    if ('torrents' in result) {
      expect(result.torrents[0].name).toBe('test.iso');
      expect(result.torrents[0].progress).toBe(42);
    }
  });
});
