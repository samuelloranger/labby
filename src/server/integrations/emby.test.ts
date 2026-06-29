import { describe, expect, mock, test } from 'bun:test';
import type { EmbyConfig } from './emby';
import { getEmbyImage, getEmbySessions } from './emby';

describe('Emby client', () => {
  test('reports missing config', async () => {
    expect(await getEmbySessions({})).toEqual({ error: 'EMBY_URL not configured' });
    expect(await getEmbySessions({ url: 'http://emby.test' })).toEqual({
      error: 'EMBY_API_KEY not configured',
    });
    expect(await getEmbyImage({}, 'item-1')).toEqual({ error: 'EMBY_URL not configured' });
  });

  test('maps active sessions', async () => {
    const config: EmbyConfig = { url: 'http://emby.test/', apiKey: 'emby-key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/Sessions')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Emby-Token']).toBe('emby-key');
        return Response.json([
          {
            Id: 'sess-1',
            UserName: 'bob',
            Client: 'Chrome',
            TranscodingInfo: { IsVideoDirect: false },
            PlayState: { PositionTicks: 1_800_000_000 },
            NowPlayingItem: {
              Id: 'item-99',
              Name: 'Episode 1',
              SeriesName: 'Show',
              ParentIndexNumber: 1,
              IndexNumber: 1,
              ProductionYear: 2024,
              RunTimeTicks: 3_600_000_000,
              MediaStreams: [{ Type: 'Video', Height: 1080 }],
            },
          },
          { Id: 'sess-2', UserName: 'idle' },
        ]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getEmbySessions(config);
    globalThis.fetch = originalFetch;

    expect('sessions' in result).toBe(true);
    if ('sessions' in result) {
      expect(result.playing).toBe(1);
      expect(result.sessions[0].title).toContain('Show');
      expect(result.sessions[0].user).toBe('bob');
      expect(result.sessions[0].progress).toBe(50);
      expect(result.sessions[0].isTranscoding).toBe(true);
      expect(result.sessions[0].posterUrl).toContain('item-99');
    }
  });

  test('returns error on non-ok sessions response', async () => {
    const config: EmbyConfig = { url: 'http://emby.test', apiKey: 'key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 401 }),
    ) as unknown as typeof fetch;
    const result = await getEmbySessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'Emby error: 401' });
  });

  test('returns error when fetch throws', async () => {
    const config: EmbyConfig = { url: 'http://emby.test', apiKey: 'key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await getEmbySessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'down' });
  });

  test('fetches item image', async () => {
    const config: EmbyConfig = { url: 'http://emby.test', apiKey: 'key' };
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/Items/item-1/Images/Primary')) {
        return new Response(imageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    const result = await getEmbyImage(config, 'item-1');
    globalThis.fetch = originalFetch;
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.headers.get('Content-Type')).toBe('image/jpeg');
    }
  });
});
