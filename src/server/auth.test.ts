import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { crossSiteGuard } from './auth';

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
