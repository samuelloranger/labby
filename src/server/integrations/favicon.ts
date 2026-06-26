import { TIMEOUT_MS } from './http';

// ponytail: regex parse, not a full HTML parser — swap in a parser if it misses real-world sites
const LINK_ICON_RE =
  /<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/i;
const HREF_RE = /href=["']([^"']+)["']/i;

export async function resolveFavicon(pageUrl: string): Promise<{ icon: string | null }> {
  let base: URL;
  try {
    base = new URL(pageUrl);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return { icon: null };
  } catch {
    return { icon: null };
  }

  const fallback = new URL('/favicon.ico', base).href;

  try {
    const res = await fetch(base.href, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return { icon: fallback };
    const html = await res.text();
    const tag = LINK_ICON_RE.exec(html);
    const href = tag ? HREF_RE.exec(tag[0])?.[1] : undefined;
    if (href) {
      try {
        return { icon: new URL(href, base).href };
      } catch {
        return { icon: fallback };
      }
    }
    return { icon: fallback };
  } catch {
    // unreachable host / timeout: still offer the conventional path
    return { icon: fallback };
  }
}
