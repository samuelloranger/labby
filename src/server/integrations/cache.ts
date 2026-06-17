// Shared-IP rate-limit guard for public upstreams (Reddit, HN). Every browser
// hits our REST endpoint, which proxies to the upstream — without this, N tabs
// = N upstream fetches and Reddit 429s the server's IP. This collapses them to
// one fetch per TTL and, on upstream error (429/timeout), serves the last good
// payload instead of blanking the widget.

type Entry = { at: number; value: unknown };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function isError(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T | { error: string }>,
): Promise<T | { error: string }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  // Single-flight: concurrent cold requests (many tabs on a fresh server)
  // share one upstream call instead of each firing their own.
  let p = inflight.get(key) as Promise<T | { error: string }> | undefined;
  if (!p) {
    p = (async () => {
      const fresh = await fetcher();
      if (!isError(fresh)) cache.set(key, { at: Date.now(), value: fresh });
      return fresh;
    })();
    inflight.set(key, p);
    p.finally(() => inflight.delete(key));
  }

  const fresh = await p;
  // Upstream failed: ride it out with stale data if we ever had a good payload.
  if (isError(fresh) && hit) return hit.value as T;
  return fresh;
}

// ponytail: test-only — lets the cache test start from a clean slate.
export function _clearCache(): void {
  cache.clear();
  inflight.clear();
}
