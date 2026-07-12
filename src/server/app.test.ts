import { expect, test } from 'bun:test';
import { app } from './app';
import { getConfig, loadConfig } from './config/loader';
import { createIntegration, deleteIntegration, listIntegrations } from './db';

const TEST_NAME = '__test_app_routes__';

function cleanup() {
  for (const row of listIntegrations().filter((r) => r.name.startsWith(TEST_NAME))) {
    deleteIntegration(row.id);
  }
}

test('GET /api/config returns sanitized dashboard', async () => {
  await loadConfig();
  const res = await app.request('/api/config');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { title?: string };
  expect(body.title).toBeTruthy();
});

test('POST /api/theme validates and saves theme settings', async () => {
  await loadConfig();
  const bad = await app.request('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: 'not-a-theme' }),
  });
  expect(bad.status).toBe(400);

  const ok = await app.request('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: 'dark-ocean', layout: 'columns', customCss: '.x{}' }),
  });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true });
});

test('POST /api/theme persists motion alongside the other fields', async () => {
  await loadConfig();
  const res = await app.request('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: 'system-nord', motion: true }),
  });
  expect(res.status).toBe(200);
  expect(getConfig()?.theme.default).toBe('system-nord');
  expect(getConfig()?.theme.motion).toBe(true);

  const reset = await app.request('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: 'system', motion: false }),
  });
  expect(reset.status).toBe(200);
  expect(getConfig()?.theme.motion).toBe(false);
});

test('GET /api/integrations/types is gzip-compressed when requested', async () => {
  // Chosen over /api/config: /api/config's default-seed response is ~85 bytes,
  // well under compress()'s 1024-byte default threshold, so it would never
  // compress regardless of whether the middleware works. /api/integrations/types
  // is a stable ~3.8KB response independent of DB seed state.
  const res = await app.request('/api/integrations/types', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Encoding')).toBe('gzip');
});

test('GET /api/stream is never compressed, even when requested', async () => {
  const res = await app.request('/api/stream', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  expect(res.headers.get('Content-Encoding')).toBeNull();
  res.body?.cancel();
});

test('GET /api/integrations/:id/data returns 404 for missing row', async () => {
  const res = await app.request('/api/integrations/999999/data');
  expect(res.status).toBe(404);
});

test('GET jellyfin-image and logs routes enforce integration type', async () => {
  cleanup();
  let id: number | undefined;
  try {
    const row = createIntegration({
      name: `${TEST_NAME}_radarr`,
      type: 'radarr',
      config: {},
      enabled: true,
      refreshSeconds: 60,
    });
    id = row.id;

    const img = await app.request(`/api/integrations/${id}/jellyfin-image/item-1`);
    expect(img.status).toBe(404);

    const logs = await app.request(`/api/integrations/${id}/logs/cid`);
    expect(logs.status).toBe(404);
  } finally {
    if (id !== undefined) deleteIntegration(id);
  }
});

test('GET jellyfin-image proxies image bytes', async () => {
  cleanup();
  let id: number | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/Items/poster/Images/Primary')) {
      return new Response(new Uint8Array([0xff, 0xd8]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const row = createIntegration({
      name: `${TEST_NAME}_jellyfin`,
      type: 'jellyfin',
      config: { url: 'http://jellyfin.test', apiKey: 'key' },
      enabled: true,
      refreshSeconds: 60,
    });
    id = row.id;

    const res = await app.request(`/api/integrations/${id}/jellyfin-image/poster`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  } finally {
    globalThis.fetch = originalFetch;
    if (id !== undefined) deleteIntegration(id);
  }
});

test('GET logs returns container logs for docker integration', async () => {
  cleanup();
  let id: number | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/containers/cid/logs')) {
      return new Response(new TextEncoder().encode('line1'));
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const row = createIntegration({
      name: `${TEST_NAME}_docker`,
      type: 'docker',
      config: { roHost: 'tcp://docker.test:2375' },
      enabled: true,
      refreshSeconds: 60,
    });
    id = row.id;

    const res = await app.request(`/api/integrations/${id}/logs/cid?tail=10`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs?: string };
    expect(body.logs).toBe('line1');
  } finally {
    globalThis.fetch = originalFetch;
    if (id !== undefined) deleteIntegration(id);
  }
});

test('GET unknown static asset returns 404', async () => {
  const res = await app.request('/assets/does-not-exist.js');
  expect(res.status).toBe(404);
});

test('GET * serves SPA or reports missing build', async () => {
  const res = await app.request('/some-spa-route');
  expect([200, 404, 503]).toContain(res.status);
});
