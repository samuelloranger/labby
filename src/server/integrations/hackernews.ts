export type HNPost = {
  id: string;
  title: string;
  url: string;
  comments: number;
  score: number;
  author: string;
  createdUtc: number;
};

export type HNConfig = { max?: number };

export type HNPayload = { posts: HNPost[] };

export async function getHackerNews(config: HNConfig = {}): Promise<HNPayload | { error: string }> {
  const limit = config.max ?? 15;
  try {
    // Algolia front-page search returns title/url/points/comments in one call —
    // no per-item fetches like the Firebase API needs.
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return { error: `Hacker News error: ${res.status}` };
    const json = (await res.json()) as { hits?: Array<Record<string, unknown>> };
    const posts: HNPost[] = (json.hits ?? []).map((h) => {
      const id = String(h.objectID ?? '');
      return {
        id,
        title: String(h.title ?? ''),
        url: (h.url as string) || `https://news.ycombinator.com/item?id=${id}`,
        comments: Number(h.num_comments ?? 0),
        score: Number(h.points ?? 0),
        author: String(h.author ?? ''),
        createdUtc: Number(h.created_at_i ?? 0),
      };
    });
    return { posts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Hacker News unreachable' };
  }
}
