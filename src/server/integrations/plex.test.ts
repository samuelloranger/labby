import { describe, expect, mock, test } from 'bun:test';
import type { PlexConfig } from './plex';
import { getPlexImage, getPlexRecent, getPlexSessions } from './plex';

describe('Plex client', () => {
  test('reports missing config', async () => {
    expect(await getPlexSessions({})).toEqual({ error: 'PLEX_URL not configured' });
    expect(await getPlexSessions({ url: 'http://plex.test' })).toEqual({
      error: 'PLEX_TOKEN not configured',
    });
    expect(await getPlexImage({}, '/library/x')).toEqual({ error: 'PLEX_URL not configured' });
  });

  test('maps active sessions', async () => {
    const config: PlexConfig = { url: 'http://plex.test:32400/', token: 'plex-tok' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/status/sessions')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Plex-Token']).toBe('plex-tok');
        expect(headers.Accept).toBe('application/json');
        return Response.json({
          MediaContainer: {
            size: 2,
            Metadata: [
              {
                type: 'episode',
                title: 'Pilot',
                grandparentTitle: 'The Show',
                parentIndex: 1,
                index: 3,
                year: 2024,
                viewOffset: 600000,
                duration: 1200000,
                thumb: '/library/metadata/668/thumb/1386095832',
                grandparentThumb: '/library/metadata/100/thumb/1',
                User: { title: 'alice' },
                Player: { title: 'Living Room', product: 'Plex for Apple TV' },
                TranscodeSession: { videoDecision: 'transcode' },
                Media: [{ videoResolution: '1080' }],
              },
              {
                type: 'movie',
                title: 'Some Movie',
                year: 2020,
                viewOffset: 0,
                duration: 0,
                User: { title: 'bob' },
                Player: { product: 'Plex Web' },
              },
            ],
          },
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;

    expect('sessions' in result).toBe(true);
    if ('sessions' in result) {
      expect(result.playing).toBe(2);
      expect(result.sessions[0].title).toBe('The Show — S01E03');
      expect(result.sessions[0].user).toBe('alice');
      expect(result.sessions[0].device).toBe('Living Room');
      expect(result.sessions[0].progress).toBe(50);
      expect(result.sessions[0].isTranscoding).toBe(true);
      expect(result.sessions[0].posterUrl).toContain(
        encodeURIComponent('/library/metadata/668/thumb/1386095832'),
      );
      expect(result.sessions[1].title).toBe('Some Movie');
      expect(result.sessions[1].device).toBe('Plex Web');
      expect(result.sessions[1].progress).toBe(0);
      expect(result.sessions[1].isTranscoding).toBe(false);
    }
  });

  test('returns empty when nothing playing', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      Response.json({ MediaContainer: { size: 0 } }),
    ) as unknown as typeof fetch;
    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ sessions: [], playing: 0 });
  });

  test('returns error on non-ok response', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 401 }),
    ) as unknown as typeof fetch;
    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'Plex error: 401' });
  });

  test('returns error when fetch throws', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'down' });
  });

  test('image proxy rejects non-relative paths (SSRF guard)', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    expect(await getPlexImage(config, 'http://evil.com/x')).toEqual({
      error: 'Invalid image path',
    });
    expect(await getPlexImage(config, '//evil.com/x')).toEqual({ error: 'Invalid image path' });
    expect(await getPlexImage(config, 'library/x')).toEqual({ error: 'Invalid image path' });
  });

  test('image proxy fetches a relative path with token', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 'plex-tok' };
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    let calledUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Plex-Token']).toBe('plex-tok');
      return new Response(imageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const result = await getPlexImage(config, '/library/metadata/668/thumb/1');
    globalThis.fetch = originalFetch;
    expect(result instanceof Response).toBe(true);
    expect(calledUrl).toContain('/library/metadata/668/thumb/1');
  });

  test('maps newest movies and episodes from the library', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/library/all');
      expect(url.searchParams.get('type')).toBe('1,4');
      expect(url.searchParams.get('sort')).toBe('addedAt:desc');
      expect((init?.headers as Record<string, string> | undefined)?.['X-Plex-Token']).toBe('token');
      return Response.json({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: '12',
              type: 'movie',
              title: 'Film',
              year: 2025,
              addedAt: Date.parse('2026-10-02T12:00:00Z') / 1000,
              thumb: '/library/metadata/12/thumb/1',
            },
            {
              ratingKey: '13',
              type: 'episode',
              title: 'Pilot',
              grandparentTitle: 'Series',
              parentIndex: 2,
              index: 3,
              addedAt: Date.parse('2026-10-01T12:00:00Z') / 1000,
              grandparentThumb: '/library/metadata/10/thumb/1',
            },
          ],
        },
      });
    }) as unknown as typeof fetch;
    try {
      const result = await getPlexRecent({ url: 'http://plex.test', token: 'token' });
      expect(result).toEqual({
        items: [
          {
            id: '12',
            kind: 'movie',
            title: 'Film',
            subtitle: '2025',
            addedAt: '2026-10-02T12:00:00.000Z',
            posterUrl: '/api/plex/image?path=%2Flibrary%2Fmetadata%2F12%2Fthumb%2F1',
          },
          {
            id: '13',
            kind: 'tv',
            title: 'Series',
            subtitle: 'S02E03 · Pilot',
            addedAt: '2026-10-01T12:00:00.000Z',
            posterUrl: '/api/plex/image?path=%2Flibrary%2Fmetadata%2F10%2Fthumb%2F1',
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
