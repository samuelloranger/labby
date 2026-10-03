import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { app as realApp } from './app';
import {
  type AuthConfig,
  claimsHook,
  crossSiteGuard,
  isAllowed,
  readAuthConfig,
  withAuth,
} from './auth';

const FULL = {
  LABBY_OIDC_ISSUER: 'https://idp.example.com/application/o/labby/',
  LABBY_OIDC_CLIENT_ID: 'labby',
  LABBY_OIDC_CLIENT_SECRET: 'secret',
  LABBY_URL: 'https://labby.example.com/',
};

test('readAuthConfig returns null when no LABBY_OIDC_* var is set', () => {
  expect(readAuthConfig({})).toBeNull();
  expect(readAuthConfig({ LABBY_URL: 'https://labby.example.com' })).toBeNull();
});

test('readAuthConfig treats blank LABBY_OIDC_* values as unset', () => {
  expect(readAuthConfig({ LABBY_OIDC_ISSUER: '', LABBY_OIDC_CLIENT_ID: '  ' })).toBeNull();
});

test('readAuthConfig parses a full config with defaults', () => {
  const cfg = readAuthConfig(FULL);
  expect(cfg).not.toBeNull();
  expect(cfg?.issuer).toBe(FULL.LABBY_OIDC_ISSUER);
  expect(cfg?.clientId).toBe('labby');
  expect(cfg?.clientSecret).toBe('secret');
  expect(cfg?.publicUrl).toBe('https://labby.example.com');
  expect(cfg?.scopes).toBe('openid email profile');
  expect(cfg?.allowedEmails).toEqual([]);
  expect(cfg?.allowedGroups).toEqual([]);
  expect(cfg?.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
});

test('readAuthConfig generates a different random session secret per call', () => {
  expect(readAuthConfig(FULL)?.sessionSecret).not.toBe(readAuthConfig(FULL)?.sessionSecret);
});

test('readAuthConfig names each missing required variable', () => {
  for (const key of Object.keys(FULL)) {
    const env = Object.fromEntries(Object.entries(FULL).filter(([k]) => k !== key));
    expect(() => readAuthConfig(env)).toThrow(key);
  }
});

test('readAuthConfig fails closed when only a non-issuer OIDC var is set', () => {
  expect(() => readAuthConfig({ LABBY_OIDC_CLIENT_ID: 'labby' })).toThrow('LABBY_OIDC_ISSUER');
});

test('readAuthConfig rejects a plain-http or malformed issuer', () => {
  expect(() => readAuthConfig({ ...FULL, LABBY_OIDC_ISSUER: 'http://idp.example.com' })).toThrow(
    'https',
  );
  expect(() => readAuthConfig({ ...FULL, LABBY_OIDC_ISSUER: 'not a url' })).toThrow(
    'LABBY_OIDC_ISSUER',
  );
});

test('readAuthConfig rejects LABBY_URL with a path', () => {
  expect(() => readAuthConfig({ ...FULL, LABBY_URL: 'https://example.com/labby' })).toThrow(
    'LABBY_URL',
  );
});

test('readAuthConfig rejects a plain-http LABBY_URL outside localhost', () => {
  expect(() => readAuthConfig({ ...FULL, LABBY_URL: 'http://labby.example.com' })).toThrow(
    'LABBY_URL',
  );
});

test('readAuthConfig allows a plain-http LABBY_URL on localhost', () => {
  const cfg = readAuthConfig({ ...FULL, LABBY_URL: 'http://localhost:8080' });
  expect(cfg?.publicUrl).toBe('http://localhost:8080');
});

test('readAuthConfig rejects a short session secret and keeps a valid one', () => {
  expect(() => readAuthConfig({ ...FULL, LABBY_OIDC_SESSION_SECRET: 'short' })).toThrow(
    'LABBY_OIDC_SESSION_SECRET',
  );
  const secret = 'x'.repeat(32);
  expect(readAuthConfig({ ...FULL, LABBY_OIDC_SESSION_SECRET: secret })?.sessionSecret).toBe(
    secret,
  );
});

test('readAuthConfig parses allowlists and scopes', () => {
  const cfg = readAuthConfig({
    ...FULL,
    LABBY_OIDC_SCOPES: 'openid email groups',
    LABBY_OIDC_ALLOWED_EMAILS: ' Alice@Example.com, ,bob@example.com ',
    LABBY_OIDC_ALLOWED_GROUPS: 'admins, Family',
  });
  expect(cfg?.scopes).toBe('openid email groups');
  expect(cfg?.allowedEmails).toEqual(['alice@example.com', 'bob@example.com']);
  expect(cfg?.allowedGroups).toEqual(['admins', 'Family']);
});

function guarded() {
  const app = new Hono();
  app.use(crossSiteGuard());
  app.get('/x', (c) => c.text('ok'));
  app.post('/x', (c) => c.text('ok'));
  app.delete('/x', (c) => c.text('ok'));
  return app;
}

const post = (headers: Record<string, string>) =>
  guarded().request('http://labby.example.com/x', { method: 'POST', headers });

test('crossSiteGuard blocks cross-site and same-site browser writes', async () => {
  expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  expect((await post({ 'sec-fetch-site': 'same-site' })).status).toBe(403);
  const del = await guarded().request('http://labby.example.com/x', {
    method: 'DELETE',
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  expect(del.status).toBe(403);
});

test('crossSiteGuard allows same-origin browser writes and header-less scripts', async () => {
  expect((await post({ 'sec-fetch-site': 'same-origin' })).status).toBe(200);
  expect((await post({ 'sec-fetch-site': 'none' })).status).toBe(200);
  expect((await post({})).status).toBe(200);
});

test('crossSiteGuard falls back to Origin vs Host when Sec-Fetch-Site is absent', async () => {
  expect(
    (await post({ origin: 'https://evil.example.net', host: 'labby.example.com' })).status,
  ).toBe(403);
  expect(
    (await post({ origin: 'https://labby.example.com', host: 'labby.example.com' })).status,
  ).toBe(200);
  expect((await post({ origin: 'null', host: 'labby.example.com' })).status).toBe(403);
});

test('crossSiteGuard accepts Origin matching X-Forwarded-Host when the proxy rewrote Host', async () => {
  const res = await post({
    origin: 'https://labby.example.com',
    host: 'labby:8080',
    'x-forwarded-host': 'labby.example.com',
  });
  expect(res.status).toBe(200);
});

test('crossSiteGuard never blocks GET', async () => {
  const res = await guarded().request('http://labby.example.com/x', {
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  expect(res.status).toBe(200);
});

const SECRET = 's'.repeat(32);
const ISSUER = 'https://idp.example.com/app/';

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    issuer: ISSUER,
    clientId: 'labby',
    clientSecret: 'secret',
    publicUrl: 'https://labby.example.com',
    scopes: 'openid email profile',
    sessionSecret: SECRET,
    allowedEmails: [],
    allowedGroups: [],
    ...over,
  };
}

function stubApp() {
  const inner = new Hono();
  inner.get('/', (c) => c.text('index'));
  inner.get('/api/data', (c) => c.json({ ok: true }));
  inner.get('/assets/app.js', (c) => c.text('js'));
  inner.get('/sw.js', (c) => c.text('sw'));
  inner.get('*', (c) => c.text('spa'));
  return inner;
}

async function sessionCookie(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await sign(
    { sub: 'u1', rtk: '', rtkexp: now + 900, ssnexp: now + 3600, ...claims },
    SECRET,
    'HS256',
  );
  return `oidc-auth=${jwt}`;
}

const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: 'https://idp.example.com/authorize',
  token_endpoint: 'https://idp.example.com/token',
  jwks_uri: 'https://idp.example.com/jwks',
  end_session_endpoint: 'https://idp.example.com/logout',
  scopes_supported: ['openid', 'email', 'profile', 'groups'],
  response_types_supported: ['code'],
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockDiscovery(doc: Record<string, unknown> = DISCOVERY) {
  globalThis.fetch = mock(async () =>
    Response.json(doc, { headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

test('withAuth returns the original app when auth is off', () => {
  const inner = stubApp();
  expect(withAuth(inner, null)).toBe(inner);
});

test('auth off: real app serves the stream and has no auth routes', async () => {
  const off = withAuth(realApp, null);
  expect((await off.request('/api/auth/me')).status).toBe(404);
  const stream = await off.request('/api/stream');
  expect(stream.status).toBe(200);
  stream.body?.cancel();
});

test('static build output stays public', async () => {
  const app = withAuth(stubApp(), cfg());
  expect((await app.request('/assets/app.js')).status).toBe(200);
  expect((await app.request('/sw.js')).status).toBe(200);
});

test('api without a session is 401 JSON, not a redirect', async () => {
  const app = withAuth(stubApp(), cfg());
  const res = await app.request('/api/data');
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'unauthenticated' });
});

test('real app api is gated when mounted behind withAuth', async () => {
  const res = await withAuth(realApp, cfg()).request('/api/config');
  expect(res.status).toBe(401);
});

test('page without a session redirects to the provider with PKCE', async () => {
  mockDiscovery();
  const res = await withAuth(stubApp(), cfg()).request('http://labby:8080/some/page');
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location') ?? '');
  expect(location.origin + location.pathname).toBe('https://idp.example.com/authorize');
  expect(location.searchParams.get('client_id')).toBe('labby');
  expect(location.searchParams.get('redirect_uri')).toBe('https://labby.example.com/auth/callback');
  expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  expect(location.searchParams.get('scope')).toBe('openid email profile');
});

test('callback is handled even when the request URL is plain http', async () => {
  mockDiscovery();
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  const res = await withAuth(stubApp(), cfg()).request(
    'http://labby:8080/auth/callback?code=abc&state=xyz',
  );
  // No state/nonce cookies → the library rejects the callback. What matters is
  // that it was treated as a callback, not bounced back to the provider.
  expect(res.headers.get('location') ?? '').not.toContain('idp.example.com/authorize');
  expect(res.status).toBe(400);
  expect(await res.text()).toMatch(/"kind":"sign-in-failed"|Sign-in did not complete/);
  warn.mockRestore();
});

test('failed callback with an existing valid session redirects home', async () => {
  mockDiscovery();
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  const cookie = await sessionCookie({ email: 'a@example.com' });
  const res = await withAuth(stubApp(), cfg()).request(
    'http://labby:8080/auth/callback?code=abc&state=xyz',
    { headers: { cookie } },
  );
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/');
  warn.mockRestore();
});

test('valid session reaches the app and /api/auth/me', async () => {
  const app = withAuth(stubApp(), cfg());
  const cookie = await sessionCookie({ email: 'a@example.com', name: 'Alice' });
  expect(await (await app.request('/', { headers: { cookie } })).text()).toBe('index');
  expect((await app.request('/api/data', { headers: { cookie } })).status).toBe(200);
  const me = await app.request('/api/auth/me', { headers: { cookie } });
  expect(await me.json()).toEqual({ name: 'Alice', email: 'a@example.com' });
});

test('session signed with another secret is treated as no session', async () => {
  const cookie = await sessionCookie({ email: 'a@example.com' });
  const app = withAuth(stubApp(), cfg({ sessionSecret: 'o'.repeat(32) }));
  expect((await app.request('/api/data', { headers: { cookie } })).status).toBe(401);
});

test('allowlist: email or group grants access, otherwise 403', async () => {
  const app = withAuth(
    stubApp(),
    cfg({ allowedEmails: ['alice@example.com'], allowedGroups: ['admins'] }),
  );
  const byEmail = await sessionCookie({ email: 'alice@example.com', groups: [] });
  const byGroup = await sessionCookie({ email: 'bob@example.com', groups: ['admins'] });
  const denied = await sessionCookie({ email: 'eve@example.com', groups: ['guests'] });

  expect((await app.request('/api/data', { headers: { cookie: byEmail } })).status).toBe(200);
  expect((await app.request('/api/data', { headers: { cookie: byGroup } })).status).toBe(200);

  const api = await app.request('/api/data', { headers: { cookie: denied } });
  expect(api.status).toBe(403);
  expect(await api.json()).toEqual({ error: 'forbidden' });

  // Built web app → Labby shell with the auth-screen marker; not built → plain
  // text. Both name the account. Marker shape/escaping is covered in shell.test.ts.
  const page = await app.request('/', { headers: { cookie: denied } });
  expect(page.status).toBe(403);
  const html = await page.text();
  expect(html).toContain('eve@example.com');
  expect(html).not.toContain('labby-snapshot');
});

test('isAllowed: open when no lists, case-insensitive email, exact group', () => {
  expect(isAllowed(cfg(), {})).toBe(true);
  const c = cfg({ allowedEmails: ['alice@example.com'], allowedGroups: ['Admins'] });
  expect(isAllowed(c, { email: 'Alice@Example.com' })).toBe(true);
  expect(isAllowed(c, { groups: ['Admins'] })).toBe(true);
  expect(isAllowed(c, { groups: ['admins'] })).toBe(false);
  expect(isAllowed(c, { email: 42, groups: 'Admins' })).toBe(false);
});

test('claims hook keeps only allowlisted groups', async () => {
  const hook = claimsHook(cfg({ allowedGroups: ['admins'] }));
  const many = Array.from({ length: 500 }, (_, i) => `group-${i}`);
  const out = await hook(
    undefined,
    { sub: 'u1', email: 'a@example.com', name: 'Alice', groups: [...many, 'admins'] } as never,
    {} as never,
  );
  expect(out).toEqual({ sub: 'u1', email: 'a@example.com', name: 'Alice', groups: ['admins'] });
  // No group allowlist → no groups stored at all.
  const none = await claimsHook(cfg())(
    undefined,
    { sub: 'u1', groups: many } as never,
    {} as never,
  );
  expect(none.groups).toEqual([]);
});

test('claims hook keeps previous claims when a refresh carries no id token', async () => {
  const hook = claimsHook(cfg({ allowedGroups: ['admins'] }));
  const orig = { sub: 'u1', email: 'a@example.com', name: 'Alice', groups: ['admins'] };
  const out = await hook({ ...orig, rtk: 'r', rtkexp: 0, ssnexp: 0 }, undefined, {} as never);
  expect(out).toEqual(orig);
});

test('claims hook keeps previous groups when a refreshed id token omits them', async () => {
  const hook = claimsHook(cfg({ allowedGroups: ['admins'] }));
  const orig = {
    sub: 'u1',
    email: 'a@example.com',
    name: 'Alice',
    groups: ['admins'],
    rtk: 'r',
    rtkexp: 0,
    ssnexp: 0,
  };
  const out = await hook(orig, { sub: 'u1', email: 'a@example.com' } as never, {} as never);
  expect(out.groups).toEqual(['admins']);
});

test('logout clears the session and goes to the provider end-session endpoint', async () => {
  mockDiscovery();
  const app = withAuth(stubApp(), cfg());
  const cookie = await sessionCookie({ email: 'a@example.com' });
  const res = await app.request('/auth/logout', { headers: { cookie } });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location') ?? '');
  expect(location.origin + location.pathname).toBe('https://idp.example.com/logout');
  expect(location.searchParams.get('client_id')).toBe('labby');
  expect(location.searchParams.get('post_logout_redirect_uri')).toBe('https://labby.example.com/');
  expect(res.headers.get('clear-site-data')).toBe('"cache"');
  expect(res.headers.get('set-cookie') ?? '').toContain('oidc-auth=;');
});

test('logout without a provider end-session endpoint shows a signed-out page', async () => {
  const { end_session_endpoint: _drop, ...noEndSession } = DISCOVERY;
  mockDiscovery(noEndSession);
  const res = await withAuth(stubApp(), cfg()).request('/auth/logout');
  expect(res.status).toBe(200);
  expect(await res.text()).toMatch(/"kind":"signed-out"|Signed out/);
});
