import { describe, expect, test } from 'bun:test';
import { parseRedditFeed } from './reddit';

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
