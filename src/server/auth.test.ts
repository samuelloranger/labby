import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { crossSiteGuard, readAuthConfig } from './auth';

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
