export type RedditPost = {
  title: string;
  url: string;
  comments: number;
  score: number;
  author: string;
  subreddit: string;
  createdUtc: number;
};

export type RedditPayload = { subreddit: string; posts: RedditPost[] };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#32;/g, ' ');
}

// Reddit's public JSON 403s datacenter IPs, but the Atom feed (.rss) still
// serves. It carries title/link/author/time but no score or comment counts.
export function parseRedditFeed(xml: string, subreddit: string, limit: number): RedditPost[] {
  // For a merged feed (r/a+b+c.rss) each entry carries its own subreddit in a
  // <category term="a" label="r/a"/>; fall back to the first requested sub.
  const fallbackSub = `r/${subreddit.split('+')[0]}`;
  const posts: RedditPost[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const url = entry.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const author = entry.match(/<name>([\s\S]*?)<\/name>/)?.[1];
    const updated = entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1];
    const cat = entry.match(/<category[^>]*\blabel="([^"]+)"/)?.[1];
    if (!title || !url) continue;
    posts.push({
      title: decodeEntities(title.trim()),
      url: decodeEntities(url.trim()),
      comments: 0,
      score: 0,
      author: author ? decodeEntities(author.trim()) : '',
      subreddit: cat ? decodeEntities(cat.trim()) : fallbackSub,
      createdUtc: updated ? Math.floor(Date.parse(updated) / 1000) : 0,
    });
    if (posts.length >= limit) break;
  }
  return posts;
}

export async function getRedditPosts(
  subreddit: string,
  limit = 25,
): Promise<RedditPayload | { error: string }> {
  // accept "a+b+c" (merged) or "r/a" — strip r/ per-part, keep + as Reddit's join
  const sub = subreddit
    .split('+')
    .map((s) => encodeURIComponent(s.replace(/^\/?r\//, '').trim()))
    .join('+');
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.rss?limit=${limit + 4}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/atom+xml, text/xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `Reddit error: ${res.status}` };
    return { subreddit: sub, posts: parseRedditFeed(await res.text(), sub, limit) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Reddit unreachable' };
  }
}
