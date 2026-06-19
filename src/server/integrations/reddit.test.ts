import { describe, expect, mock, test } from 'bun:test';
import { getRedditPosts, parseRedditFeed } from './reddit';

describe('parseRedditFeed', () => {
  const xml = `<feed>
    <entry>
      <title>Hello &amp; World &#39;quoted&#39;</title>
      <author><name>/u/bob</name></author>
      <link href="https://www.reddit.com/r/selfhosted/comments/a/title/" />
      <updated>2024-06-15T12:00:00+00:00</updated>
    </entry>
    <entry>
      <title>Second post</title>
      <link href="https://www.reddit.com/r/selfhosted/comments/b/two/" />
      <updated>2024-06-15T11:00:00+00:00</updated>
    </entry>
  </feed>`;

  test('extracts title/url/author and decodes entities', () => {
    const posts = parseRedditFeed(xml, 'selfhosted', 12);
    expect(posts.length).toBe(2);
    expect(posts[0].title).toBe("Hello & World 'quoted'");
    expect(posts[0].url).toBe('https://www.reddit.com/r/selfhosted/comments/a/title/');
    expect(posts[0].author).toBe('/u/bob');
    expect(posts[0].subreddit).toBe('r/selfhosted');
    expect(posts[0].createdUtc).toBeGreaterThan(0);
  });

  test('respects the limit', () => {
    expect(parseRedditFeed(xml, 'selfhosted', 1).length).toBe(1);
  });

  test('reads per-entry subreddit from category in a merged feed', () => {
    const merged = `<feed>
      <entry>
        <title>From homelab</title>
        <category term="homelab" label="r/homelab" />
        <link href="https://www.reddit.com/r/homelab/comments/x/p/" />
        <updated>2024-06-15T12:00:00+00:00</updated>
      </entry>
      <entry>
        <title>No category falls back to first sub</title>
        <link href="https://www.reddit.com/r/selfhosted/comments/y/q/" />
        <updated>2024-06-15T11:00:00+00:00</updated>
      </entry>
    </feed>`;
    const posts = parseRedditFeed(merged, 'homelab+selfhosted', 12);
    expect(posts[0].subreddit).toBe('r/homelab');
    expect(posts[1].subreddit).toBe('r/homelab');
  });
});

describe('getRedditPosts', () => {
  const feedXml = `<feed>
    <entry>
      <title>Hot post</title>
      <link href="https://www.reddit.com/r/selfhosted/comments/a/title/" />
      <updated>2024-06-15T12:00:00+00:00</updated>
    </entry>
  </feed>`;

  test('returns empty posts when no subreddits configured', async () => {
    expect(await getRedditPosts({})).toEqual({ subreddit: '', posts: [] });
  });

  test('fetches and merges subreddit feeds', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('/r/selfhosted/hot.rss');
      return new Response(feedXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }) as unknown as typeof fetch;

    const result = await getRedditPosts({ subreddits: ['selfhosted'], max: 5 });
    globalThis.fetch = originalFetch;

    expect('posts' in result).toBe(true);
    if ('posts' in result) {
      expect(result.subreddit).toBe('selfhosted');
      expect(result.posts[0].title).toBe('Hot post');
    }
  });

  test('returns error when all feeds fail', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 503 }),
    ) as unknown as typeof fetch;

    const result = await getRedditPosts({ subreddits: ['selfhosted'] });
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Reddit feed unavailable' });
  });

  test('returns error when fetch throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('reddit down');
    }) as unknown as typeof fetch;

    const result = await getRedditPosts({ subreddits: ['selfhosted'] });
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Reddit feed unavailable' });
  });
});
