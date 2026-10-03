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

export type AuthConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Public origin without trailing slash, e.g. https://labby.example.com */
  publicUrl: string;
  scopes: string;
  sessionSecret: string;
  /** Lowercased. */
  allowedEmails: string[];
  allowedGroups: string[];
};

type Env = Record<string, string | undefined>;

function value(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

function required(env: Env, key: string): string {
  const v = value(env, key);
  if (!v) throw new Error(`${key} is required when OIDC login is configured`);
  return v;
}

function parseUrl(raw: string, key: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${key} is not a valid URL`);
  }
}

function list(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * OIDC login is on as soon as any LABBY_OIDC_* var has a value. A partial setup
 * throws instead of returning null: a typo must never leave Labby unprotected.
 */
export function readAuthConfig(env: Env): AuthConfig | null {
  const enabled = Object.keys(env).some((k) => k.startsWith('LABBY_OIDC_') && value(env, k));
  if (!enabled) return null;

  const issuer = required(env, 'LABBY_OIDC_ISSUER');
  if (parseUrl(issuer, 'LABBY_OIDC_ISSUER').protocol !== 'https:') {
    throw new Error('LABBY_OIDC_ISSUER must be an https:// URL');
  }
  const clientId = required(env, 'LABBY_OIDC_CLIENT_ID');
  const clientSecret = required(env, 'LABBY_OIDC_CLIENT_SECRET');
  const publicUrl = parseUrl(required(env, 'LABBY_URL'), 'LABBY_URL');
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('LABBY_URL must be an origin without a path, e.g. https://labby.example.com');
  }

  const providedSecret = value(env, 'LABBY_OIDC_SESSION_SECRET');
  if (providedSecret !== undefined && providedSecret.length < 32) {
    throw new Error('LABBY_OIDC_SESSION_SECRET must be at least 32 characters');
  }

  return {
    issuer,
    clientId,
    clientSecret,
    publicUrl: publicUrl.origin,
    scopes: value(env, 'LABBY_OIDC_SCOPES') ?? 'openid email profile',
    // ponytail: unset → per-process secret; a restart sends users back through the provider
    sessionSecret: providedSecret ?? randomSecret(),
    allowedEmails: list(env.LABBY_OIDC_ALLOWED_EMAILS).map((e) => e.toLowerCase()),
    allowedGroups: list(env.LABBY_OIDC_ALLOWED_GROUPS),
  };
}
