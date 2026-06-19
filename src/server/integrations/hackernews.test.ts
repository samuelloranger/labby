import { describe, expect, mock, test } from 'bun:test';
import { getHackerNews } from './hackernews';

describe('Hacker News client', () => {
  test('maps Algolia front page hits', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('hn.algolia.com')) {
        return Response.json({
          hits: [
            {
              objectID: '123',
              title: 'Show HN: Labby',
              url: 'https://example.com',
              num_comments: 5,
              points: 42,
              author: 'alice',
              created_at_i: 1_700_000_000,
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getHackerNews({ max: 5 });
    globalThis.fetch = originalFetch;

    expect('posts' in result).toBe(true);
    if ('posts' in result) {
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0]).toMatchObject({
        id: '123',
        title: 'Show HN: Labby',
        url: 'https://example.com',
        comments: 5,
        score: 42,
        author: 'alice',
      });
    }
  });

  test('returns error on non-ok response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 503 }),
    ) as unknown as typeof fetch;

    const result = await getHackerNews();
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Hacker News error: 503' });
  });

  test('returns error when fetch throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('timeout');
    }) as unknown as typeof fetch;

    const result = await getHackerNews();
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'timeout' });
  });
});
