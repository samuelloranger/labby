import { expect, test } from 'bun:test';
import { app } from './app';
import { getConfig, loadConfig } from './config/loader';
import { createIntegration, deleteIntegration, listIntegrations } from './db';
import { hub } from './sse/hub';

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

test('inlined snapshot escapes payload text that could close the script tag', async () => {
  await loadConfig();
  // A feed title or torrent name is upstream text we do not control, so it has
  // to be unable to break out of <script id="labby-snapshot">.
  hub.publish('int:999999', { error: '</script><img src=x onerror=alert(1)>' });

  const res = await app.request('/');
  // No built frontend in the test env is fine — that path serves plain text.
  if (res.headers.get('content-type')?.includes('text/html')) {
    const html = await res.text();
    const start = html.indexOf('<script id="labby-snapshot"');
    expect(start).toBeGreaterThan(-1);
    const block = html.slice(start, html.indexOf('</script>', start));
    expect(block).not.toContain('<img');
    expect(block).toContain('\\u003c/script');

    const json = block.slice(block.indexOf('>') + 1);
    const parsed = JSON.parse(json) as Record<string, { error: string }>;
    // Escaping must be transport-only: the value round-trips unchanged.
    expect(parsed['int:999999'].error).toBe('</script><img src=x onerror=alert(1)>');
  }
});

test('inlined snapshot drops channels over the size budget', async () => {
  await loadConfig();
  const big = {
    torrents: Array.from({ length: 4000 }, (_, i) => ({ name: `torrent-${i}`, hash: `${i}` })),
  };
  hub.publish('int:999998', big as never);
  hub.publish('int:999997', { queries: 1 } as never);

  const res = await app.request('/');
  if (res.headers.get('content-type')?.includes('text/html')) {
    const html = await res.text();
    const start = html.indexOf('<script id="labby-snapshot"');
    const block = html.slice(start, html.indexOf('</script>', start));
    const parsed = JSON.parse(block.slice(block.indexOf('>') + 1)) as Record<string, unknown>;
    expect(parsed['int:999998']).toBeUndefined(); // over budget, falls back to the skeleton
    expect(parsed['int:999997']).toBeDefined(); // small payloads still inline
  }
});

test('cross-site POST to an action route is rejected', async () => {
  const res = await app.request('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'sec-fetch-site': 'cross-site' },
    body: JSON.stringify({ theme: 'dark-ocean' }),
  });
  expect(res.status).toBe(403);
});

test('unknown /api paths return 404 JSON instead of the SPA shell', async () => {
  const res = await app.request('/api/does-not-exist');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Not found' });
});

test('GET /api/panel.jpg serves a JPEG and answers 304 to a matching ETag', async () => {
  const res = await app.request('/api/panel.jpg');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  const etag = res.headers.get('etag');
  expect(etag).toBeTruthy();
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);

  const again = await app.request('/api/panel.jpg', {
    headers: { 'if-none-match': etag as string },
  });
  // The clock is part of the frame, so a minute boundary between requests yields a new frame.
  expect([200, 304]).toContain(again.status);
  if (again.status === 304) expect(await again.text()).toBe('');
});

test('GET /api/panel/layout explains the current layout', async () => {
  const res = await app.request('/api/panel/layout');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { mode: string; placements: unknown[]; issues: unknown[] };
  expect(['grid', 'night']).toContain(body.mode);
  expect(Array.isArray(body.placements)).toBe(true);
  expect(Array.isArray(body.issues)).toBe(true);
});

test('POST /api/panel/settings validates and saves the panel size', async () => {
  await loadConfig();
  const post = (body: unknown) =>
    app.request('/api/panel/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  expect((await post({ width: 480, height: 800 })).status).toBe(400); // portrait
  expect((await post({ width: 100, height: 60 })).status).toBe(400); // too small
  expect((await post({ width: 1024.5, height: 600 })).status).toBe(400);
  const bad = await post({ width: 1000, height: 1000 });
  expect(((await bad.json()) as { error: string }).error).toContain('landscape');

  expect((await post({ width: 1024, height: 600 })).status).toBe(200);
  expect(getConfig()?.panel).toEqual({ width: 1024, height: 600 });
  const frame = await app.request('/api/panel.jpg');
  const bytes = new Uint8Array(await frame.arrayBuffer());
  const sof = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0);
  const view = new DataView(bytes.buffer, bytes.byteOffset + sof);
  expect([view.getUint16(7), view.getUint16(5)]).toEqual([1024, 600]);

  expect((await post({ width: 800, height: 480 })).status).toBe(200);
});
