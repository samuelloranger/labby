import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { TennisPayload } from '../types';
import { _clearTennisCache, getLiveTennis } from './live-tennis';

// Synthetic fixtures using the public OpenAPI Match/Score field shapes.
const match = {
  id: 123,
  tournament: 'Example Open',
  status: 'live',
  players: { p1: { name: 'Player One' }, p2: { name: 'Player Two' } },
  score: {
    games: [
      [6, 3],
      [4, 4],
    ],
    points: ['30', '40'],
    server: 2,
    is_tiebreak: false,
  },
};
const response = (data: unknown[] = [match], hasMore = false) => ({
  data,
  meta: { has_more: hasMore },
});
const config = { apiKey: 'test-key' };
const originalFetch = globalThis.fetch;
const interval = 900_000;
let now: number;
let clock: ReturnType<typeof spyOn>;

beforeEach(() => {
  now = Date.parse('2026-09-16T12:00:00Z');
  clock = spyOn(Date, 'now').mockImplementation(() => now);
  _clearTennisCache();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  clock.mockRestore();
  _clearTennisCache();
});

function serve(body: unknown = response()) {
  const fetcher = mock(async () => Response.json(body));
  globalThis.fetch = fetcher as unknown as typeof fetch;
  return fetcher;
}

describe('tennis snapshots', () => {
  test('missing or invalid credentials do not make a request', async () => {
    const fetcher = serve();
    for (const apiKey of [undefined, '', '   ', 123]) {
      expect(await getLiveTennis({ apiKey: apiKey as string })).toHaveProperty('error');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('uses only the free listing, header authentication and a bounded timeout', async () => {
    const fetcher = serve();
    const result = await getLiveTennis({ apiKey: ' test-key ' });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.livetennisapi.com/api/public/v1/matches?status=live&limit=200',
      { headers: { 'X-API-Key': 'test-key' }, signal: expect.any(AbortSignal), redirect: 'error' },
    );
    expect(result).toEqual({
      fetchedAt: '2026-09-16T12:00:00.000Z',
      hasMore: false,
      matches: [
        {
          id: 123,
          tournament: 'Example Open',
          players: ['Player One', 'Player Two'],
          games: [
            [6, 3],
            [4, 4],
          ],
          points: ['30', '40'],
          server: 2,
          tiebreak: false,
          stale: false,
          eventStatus: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('test-key');
  });

  test.each([null, { games: null, points: [null, null], server: null }, { games: [], points: [] }])(
    'missing scores never become zero scores: %j',
    async (score) => {
      serve(response([{ ...match, score }]));
      const result = (await getLiveTennis(config)) as TennisPayload;
      expect(result.matches[0].games).toBeNull();
      expect(result.matches[0].points).toEqual([null, null]);
      expect(result.matches[0].server).toBeNull();
    },
  );

  test('retains tiebreak, suspension and stale flags without deriving a winner', async () => {
    serve(
      response([
        {
          ...match,
          event_status: 'Interrupted',
          score: {
            ...match.score,
            games: [
              [6, 4, 10],
              [4, 6, 5],
            ],
            points: ['10', '5'],
            is_tiebreak: true,
            stale: true,
          },
        },
      ]),
    );
    const result = (await getLiveTennis(config)) as TennisPayload;
    expect(result.matches[0]).toMatchObject({
      games: [
        [6, 4, 10],
        [4, 6, 5],
      ],
      points: ['10', '5'],
      tiebreak: true,
      stale: true,
      eventStatus: 'Interrupted',
    });
  });

  test('empty lists are valid and completed matches are not shown as live', async () => {
    serve(response([{ ...match, status: 'completed', score: null }]));
    expect(((await getLiveTennis(config)) as TennisPayload).matches).toEqual([]);
  });

  test('reports pagination without spending more quota on another page', async () => {
    const fetcher = serve(response([match], true));
    expect(((await getLiveTennis(config)) as TennisPayload).hasMore).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each([{}, { data: null }, response([{ ...match, score: { games: [[1], [2, 3]] } }])])(
    'rejects malformed responses: %j',
    async (body) => {
      serve(body);
      expect(await getLiveTennis(config)).toEqual({
        error: 'Tennis service returned an invalid response.',
      });
    },
  );
});

describe('credential-wide request limits', () => {
  test('concurrent rows and manual reads share one request', async () => {
    let resolve!: (value: Response) => void;
    const fetcher = mock(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const requests = [getLiveTennis(config), getLiveTennis({ apiKey: ' test-key ' })];
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(Response.json(response()));
    const results = await Promise.all(requests);
    expect(results[0]).toEqual(results[1]);
    expect(await getLiveTennis(config)).toEqual(results[0]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('one-second refresh requests make only 96 upstream calls in 24 hours', async () => {
    const fetcher = serve(response([]));
    const start = now;
    for (let seconds = 0; seconds < 86_400; seconds++) {
      now = start + seconds * 1000;
      await getLiveTennis(config);
    }
    expect(fetcher).toHaveBeenCalledTimes(96);
  });

  test('keys have independent quotas and never reuse another credential snapshot', async () => {
    const fetcher = serve();
    await getLiveTennis(config);
    await getLiveTennis({ apiKey: 'second-key' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test.each([401, 403, 500])('HTTP %i failures also wait 15 minutes', async (status) => {
    const fetcher = mock(async () => new Response('test-key', { status }));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const result = await getLiveTennis(config);
    expect(result).toHaveProperty('error');
    expect(JSON.stringify(result)).not.toContain('test-key');
    now += interval - 1;
    expect(await getLiveTennis(config)).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now++;
    await getLiveTennis(config);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test.each(['3600', 'Wed, 16 Sep 2026 13:00:00 GMT'])('honors Retry-After %s', async (retry) => {
    const fetcher = mock(
      async () => new Response('', { status: 429, headers: { 'Retry-After': retry } }),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await getLiveTennis(config);
    now += 3_600_000 - 1;
    await getLiveTennis(config);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now++;
    await getLiveTennis(config);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test.each(['1', 'invalid', '-100'])(
    'Retry-After %s never shortens the minimum interval',
    async (retry) => {
      const fetcher = mock(
        async () => new Response('', { status: 429, headers: { 'Retry-After': retry } }),
      );
      globalThis.fetch = fetcher as unknown as typeof fetch;
      await getLiveTennis(config);
      now += interval - 1;
      await getLiveTennis(config);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  test('network failures are cached without exposing error details, then recover', async () => {
    const fetcher = mock(async () => {
      throw new Error('request with test-key failed');
    });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    expect(await getLiveTennis(config)).toEqual({
      error: 'Tennis service unavailable; the next attempt is delayed.',
    });
    await getLiveTennis(config);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += interval;
    serve();
    expect(await getLiveTennis(config)).toHaveProperty('matches');
  });
});
