import { describe, expect, mock, test } from 'bun:test';
import type { JellyfinConfig } from './jellyfin';
import { getJellyfinImage, getJellyfinRecent, getJellyfinSessions } from './jellyfin';

describe('Jellyfin client', () => {
  test('reports missing config', async () => {
    expect(await getJellyfinSessions({})).toEqual({ error: 'JELLYFIN_URL not configured' });
    expect(await getJellyfinSessions({ url: 'http://jellyfin.test' })).toEqual({
      error: 'JELLYFIN_API_KEY not configured',
    });
    expect(await getJellyfinImage({}, 'item-1')).toEqual({ error: 'JELLYFIN_URL not configured' });
  });

  test('maps active sessions', async () => {
    const config: JellyfinConfig = { url: 'http://jellyfin.test/', apiKey: 'jf-key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/Sessions')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toContain('Token="jf-key"');
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

    const result = await getJellyfinSessions(config);
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
    const config: JellyfinConfig = { url: 'http://jellyfin.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 401 }),
    ) as unknown as typeof fetch;

    const result = await getJellyfinSessions(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Jellyfin error: 401' });
  });

  test('returns error when fetch throws', async () => {
    const config: JellyfinConfig = { url: 'http://jellyfin.test', apiKey: 'key' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    const result = await getJellyfinSessions(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'down' });
  });

  test('fetches item image', async () => {
    const config: JellyfinConfig = { url: 'http://jellyfin.test', apiKey: 'key' };
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/Items/item-1/Images/Primary')) {
        return new Response(imageBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getJellyfinImage(config, 'item-1');
    globalThis.fetch = originalFetch;

    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.headers.get('Content-Type')).toBe('image/jpeg');
    }
  });

  test('maps newest movies and episodes with series posters', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/Items');
      expect(url.searchParams.get('sortBy')).toBe('DateCreated');
      expect(url.searchParams.get('includeItemTypes')).toBe('Movie,Episode');
      expect(url.searchParams.get('fields')).toBe('DateCreated');
      return Response.json({
        Items: [
          {
            Id: 'movie-1',
            Type: 'Movie',
            Name: 'Film',
            ProductionYear: 2025,
            DateCreated: '2026-10-02T12:00:00Z',
            ImageTags: { Primary: 'tag' },
          },
          {
            Id: 'episode-1',
            Type: 'Episode',
            Name: 'Pilot',
            SeriesName: 'Series',
            SeriesId: 'series-1',
            SeriesPrimaryImageTag: 'series-tag',
            ParentIndexNumber: 2,
            IndexNumber: 3,
            DateCreated: '2026-10-01T12:00:00Z',
          },
          { Id: 'movie-2', Type: 'Movie', Name: 'No Art', DateCreated: '2026-09-30T12:00:00Z' },
        ],
      });
    }) as unknown as typeof fetch;
    try {
      const result = await getJellyfinRecent({ url: 'http://jellyfin.test', apiKey: 'key' });
      expect(result).toEqual({
        items: [
          {
            id: 'movie-1',
            kind: 'movie',
            title: 'Film',
            subtitle: '2025',
            addedAt: '2026-10-02T12:00:00Z',
            posterUrl: '/api/jellyfin/image/movie-1',
          },
          {
            id: 'episode-1',
            kind: 'tv',
            title: 'Series',
            subtitle: 'S02E03 · Pilot',
            addedAt: '2026-10-01T12:00:00Z',
            posterUrl: '/api/jellyfin/image/series-1',
          },
          {
            id: 'movie-2',
            kind: 'movie',
            title: 'No Art',
            subtitle: '',
            addedAt: '2026-09-30T12:00:00Z',
            posterUrl: undefined,
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
