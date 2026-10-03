import type { MiddlewareHandler } from 'hono';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Refuse writes a browser sent on behalf of another site. Browsers tag every
 * request with Sec-Fetch-Site; older ones still send Origin on writes. Scripts
 * send neither and pass, so curl/automation keeps working. Cross-origin JSON
 * already fails CORS preflight — this stops the "simple" form/text requests
 * that don't preflight.
 */
export function crossSiteGuard(): MiddlewareHandler {
  return async (c, next) => {
    if (UNSAFE_METHODS.has(c.req.method)) {
      const site = c.req.header('sec-fetch-site');
      if (site === 'cross-site' || site === 'same-site') {
        return c.json({ error: 'Cross-site request blocked' }, 403);
      }
      const origin = c.req.header('origin');
      if (site === undefined && origin !== undefined) {
        const originHost = hostOf(origin);
        const forwarded = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
        const hosts = [forwarded, c.req.header('host'), hostOf(c.req.url)];
        if (originHost === null || !hosts.includes(originHost)) {
          return c.json({ error: 'Cross-site request blocked' }, 403);
        }
      }
    }
    await next();
  };
}
