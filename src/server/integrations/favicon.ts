import { TIMEOUT_MS } from './http';

// ponytail: regex parse, not a full HTML parser — swap in a parser if it misses real-world sites
const LINK_ICON_RE =
  /<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/i;
const HREF_RE = /href=["']([^"']+)["']/i;

const MAX_HTML_BYTES = 512 * 1024;

// ponytail: literal-host SSRF guard, not DNS-rebind proof — blocks the obvious
// loopback/private/link-local (incl. cloud metadata 169.254.169.254) targets a
// bookmark URL could otherwise point the server at. Redirects still `follow`, so
// a public host redirecting to a private IP is not covered; upgrade to a
// resolve-then-check + redirect:'manual' loop if that becomes a real concern.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

export async function resolveFavicon(pageUrl: string): Promise<{ icon: string | null }> {
  let base: URL;
  try {
    base = new URL(pageUrl);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return { icon: null };
    if (isBlockedHost(base.hostname)) return { icon: null };
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
    // Cap how much we buffer: a hostile/misconfigured host could stream MBs.
    if (Number(res.headers.get('content-length') ?? 0) > MAX_HTML_BYTES) return { icon: fallback };
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
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
