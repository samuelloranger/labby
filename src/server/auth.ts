import {
  getAuth,
  getAuthorizationServer,
  initOidcAuthMiddleware,
  type OidcClaimsHook,
  oidcAuthMiddleware,
  processOAuthCallback,
  revokeSession,
} from '@hono/oidc-auth';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { type AuthScreen, readShell, renderShell } from './shell';

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

const SESSION_COOKIE = 'oidc-auth'; // library default name
const PUBLIC_PATH = /^\/(assets|fonts|icons)\/|^\/(manifest\.webmanifest|sw\.js)$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function isAllowed(cfg: AuthConfig, claims: { email?: unknown; groups?: unknown }): boolean {
  if (cfg.allowedEmails.length === 0 && cfg.allowedGroups.length === 0) return true;
  const email = str(claims.email).toLowerCase();
  if (email && cfg.allowedEmails.includes(email)) return true;
  return strings(claims.groups).some((g) => cfg.allowedGroups.includes(g));
}

/**
 * What the session cookie keeps. Only groups named in the allowlist are stored:
 * a user in hundreds of groups would otherwise push the cookie past the
 * browser's ~4 KB limit, the cookie gets dropped, and login loops.
 */
export function claimsHook(cfg: AuthConfig): OidcClaimsHook {
  return async (orig, claims) => {
    const groups = claims ? strings(claims.groups) : strings(orig?.groups);
    return {
      sub: str(claims?.sub) || str(orig?.sub),
      email: str(claims?.email) || str(orig?.email),
      name: str(claims?.name) || str(claims?.preferred_username) || str(orig?.name),
      groups: groups.filter((g) => cfg.allowedGroups.includes(g)),
    };
  };
}

/**
 * "Not allowed" / "Signed out" in Labby's own UI: the shared shell (theme,
 * palette, custom CSS) with a marker the web app renders as AuthScreen.svelte.
 * Plain text only when the web app isn't built (dev without `bun run build`).
 */
async function authScreen(c: Context, screen: AuthScreen, status: 200 | 403): Promise<Response> {
  const html = await readShell();
  c.header('Cache-Control', 'no-cache');
  if (html) return c.html(renderShell(html, { authScreen: screen }), status);
  return c.text(
    screen.kind === 'forbidden' ? `Not allowed: signed in as ${screen.user}` : 'Signed out',
    status,
  );
}

async function logout(c: Context, cfg: AuthConfig): Promise<Response> {
  let endSession: string | undefined;
  try {
    endSession = (await getAuthorizationServer(c)).end_session_endpoint;
  } catch {
    // provider unreachable: still clear the local session below
  }
  try {
    await revokeSession(c); // deletes the cookie first, then revokes the refresh token
  } catch {
    // revocation is best effort
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  // Drops service-worker caches, including a cached index.html that inlines widget data.
  c.header('Clear-Site-Data', '"cache"');
  if (endSession) {
    // Without provider logout, the next visit signs straight back in via the provider session.
    const url = new URL(endSession);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('post_logout_redirect_uri', `${cfg.publicUrl}/`);
    return c.redirect(url.toString());
  }
  return authScreen(c, { kind: 'signed-out' }, 200);
}

function gate(cfg: AuthConfig): MiddlewareHandler {
  const login = oidcAuthMiddleware();
  return async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PATH.test(path)) return next();

    // ponytail: SSE auth is checked at connect; an open stream outlives session
    // expiry until it reconnects. Close streams at ssnexp if that ever matters.
    const auth = await getAuth(c);
    if (path.startsWith('/api/')) {
      // fetch/EventSource can't follow a redirect to a cross-origin login page.
      if (!auth) return c.json({ error: 'unauthenticated' }, 401);
      if (!isAllowed(cfg, auth)) return c.json({ error: 'forbidden' }, 403);
      return next();
    }
    if (auth && !isAllowed(cfg, auth)) {
      const user = str(auth.email) || str(auth.name) || str(auth.sub);
      return authScreen(c, { kind: 'forbidden', user }, 403);
    }
    return login(c, next);
  };
}

/**
 * Auth off → the app itself, untouched. Auth on → a root app whose middleware
 * runs before everything in `app`, including the index route that inlines
 * live widget data.
 */
export function withAuth(app: Hono, cfg: AuthConfig | null): Hono {
  if (!cfg) return app;
  const root = new Hono();
  root.use(
    initOidcAuthMiddleware({
      OIDC_ISSUER: cfg.issuer,
      OIDC_CLIENT_ID: cfg.clientId,
      OIDC_CLIENT_SECRET: cfg.clientSecret,
      OIDC_AUTH_SECRET: cfg.sessionSecret,
      OIDC_REDIRECT_URI: `${cfg.publicUrl}/auth/callback`,
      OIDC_AUTH_EXTERNAL_URL: cfg.publicUrl,
      OIDC_SCOPES: cfg.scopes,
    }),
  );
  const hook = claimsHook(cfg);
  root.use(async (c, next) => {
    c.set('oidcClaimsHook', hook);
    await next();
  });
  // Explicit route: the library's own callback detection compares origins, and
  // behind a TLS-terminating proxy the request URL is http:// — it would never match.
  root.get('/auth/callback', (c) => processOAuthCallback(c));
  root.get('/auth/logout', (c) => logout(c, cfg));
  root.use(gate(cfg));
  root.get('/api/auth/me', async (c) => {
    const auth = await getAuth(c);
    return c.json({ name: str(auth?.name), email: str(auth?.email) });
  });
  root.route('/', app);
  return root;
}
