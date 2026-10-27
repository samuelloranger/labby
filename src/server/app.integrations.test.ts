import { expect, test } from 'bun:test';
import { app } from './app';
import { createIntegration, deleteIntegration, listIntegrations } from './db';

const TEST_NAME = '__test_app_integration__';

test('C411 avatar route validates the integration and proxies only its account image', async () => {
  expect((await app.request('/api/integrations/999999/c411-avatar')).status).toBe(404);
  const row = createIntegration({
    name: '__test_c411_avatar__',
    type: 'c411',
    config: { apiToken: 'route-avatar-secret' },
    enabled: false,
    refreshSeconds: 300,
  });
  const originalFetch = globalThis.fetch;
  const image = new Uint8Array([1, 2, 3]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer route-avatar-secret');
    if (String(input).endsWith('/api/user/profile')) {
      return Response.json({
        username: 'member',
        avatarUrl: '/uploads/avatars/member.webp',
        level: { level: 71, xpIntoLevel: 3, xpToNextLevel: 982 },
        zen: { balance: 0 },
        class: null,
        team: null,
        transfer: {
          uploaded: { actual: 0, credit: 0, total: 0 },
          downloaded: { actual: 0, credit: 0, total: 0 },
        },
        download: { allowed: true, blockedReason: null },
        freeleech: { active: false, sources: [] },
      });
    }
    expect(String(input)).toBe('https://c411.org/uploads/avatars/member.webp');
    return new Response(image, { headers: { 'Content-Type': 'image/webp' } });
  }) as typeof fetch;
  try {
    const res = await app.request(`/api/integrations/${row.id}/c411-avatar?url=https://other.test`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Authorization')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(image);
  } finally {
    globalThis.fetch = originalFetch;
    deleteIntegration(row.id);
  }
});

function cleanup() {
  for (const row of listIntegrations().filter((r) => r.name === TEST_NAME)) {
    deleteIntegration(row.id);
  }
}

test('GET /api/integrations/types returns metadata without fetch', async () => {
  const res = await app.request('/api/integrations/types');
  expect(res.status).toBe(200);
  const body = (await res.json()) as any[];
  expect(body.length).toBe(20);
  for (const item of body) {
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('label');
    expect(item).toHaveProperty('fields');
    expect(item).not.toHaveProperty('fetch');
  }
});

test('POST /api/integrations creates a row; GET /api/integrations includes it', async () => {
  cleanup();
  let id: number | undefined;
  try {
    const createRes = await app.request('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: TEST_NAME, type: 'radarr', config: {}, enabled: true }),
    });
    expect(createRes.status).toBe(200);
    const row = (await createRes.json()) as any;
    expect(row.id).toBeGreaterThan(0);
    expect(row.name).toBe(TEST_NAME);
    id = row.id;

    const listRes = await app.request('/api/integrations');
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as any[];
    expect(list.some((r: any) => r.id === id)).toBe(true);
  } finally {
    if (id !== undefined) deleteIntegration(id);
  }
});

test('integration responses redact secrets and blank updates preserve them', async () => {
  cleanup();
  let id: number | undefined;
  try {
    const createRes = await app.request('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: TEST_NAME,
        type: 'qbittorrent',
        config: { url: 'http://qbit', user: 'sam', pass: 'stored-secret' },
        enabled: true,
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as any;
    id = created.id;
    expect(created.config).not.toHaveProperty('pass');

    const list = (await (await app.request('/api/integrations')).json()) as any[];
    expect(list.find((row) => row.id === id)?.config).not.toHaveProperty('pass');

    const updateRes = await app.request(`/api/integrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: TEST_NAME,
        type: 'qbittorrent',
        config: { url: 'http://qbit', user: 'sam', pass: '' },
        enabled: true,
      }),
    });
    expect(updateRes.status).toBe(200);
    expect((await updateRes.json()).config).not.toHaveProperty('pass');
    expect(listIntegrations().find((row) => row.id === id)?.config.pass).toBe('stored-secret');
  } finally {
    if (id !== undefined) deleteIntegration(id);
  }
});

test('GET /api/integrations/:id/data for radarr with empty config returns error (no network)', async () => {
  cleanup();
  let id: number | undefined;
  try {
    const createRes = await app.request('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: TEST_NAME, type: 'radarr', config: {}, enabled: true }),
    });
    const row = (await createRes.json()) as any;
    id = row.id;

    const dataRes = await app.request(`/api/integrations/${id}/data`);
    expect(dataRes.status).toBe(200);
    const data = (await dataRes.json()) as any;
    expect(data).toHaveProperty('error');
  } finally {
    if (id !== undefined) deleteIntegration(id);
  }
});

test('POST /api/integrations/:id/action/:action with unknown action returns 400', async () => {
  cleanup();
  let id: number | undefined;
  try {
    const createRes = await app.request('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: TEST_NAME, type: 'radarr', config: {}, enabled: true }),
    });
    const row = (await createRes.json()) as any;
    id = row.id;

    const actionRes = await app.request(`/api/integrations/${id}/action/nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [] }),
    });
    expect(actionRes.status).toBe(400);
  } finally {
    if (id !== undefined) deleteIntegration(id);
  }
});

test('POST /api/integrations without name returns 400', async () => {
  const res = await app.request('/api/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'radarr', config: {}, enabled: true }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as any;
  expect(body).toHaveProperty('error');
});

test('POST /api/integrations without type returns 400', async () => {
  const res = await app.request('/api/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: TEST_NAME, config: {}, enabled: true }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as any;
  expect(body).toHaveProperty('error');
});

test('PUT updates name; DELETE removes it from list', async () => {
  cleanup();
  let id: number | undefined;
  try {
    const createRes = await app.request('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: TEST_NAME, type: 'radarr', config: {}, enabled: true }),
    });
    const row = (await createRes.json()) as any;
    id = row.id;

    const putRes = await app.request(`/api/integrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${TEST_NAME}_updated`,
        type: 'radarr',
        config: {},
        enabled: true,
      }),
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as any;
    expect(updated.name).toBe(`${TEST_NAME}_updated`);

    const delRes = await app.request(`/api/integrations/${id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    id = undefined; // deleted

    const listRes = await app.request('/api/integrations');
    const list = (await listRes.json()) as any[];
    expect(list.some((r: any) => r.name === `${TEST_NAME}_updated`)).toBe(false);
  } finally {
    if (id !== undefined) deleteIntegration(id);
    cleanup();
  }
});

test('C411 tokens are redacted and preserved when editing settings', async () => {
  const name = '__test_c411_secrets__';
  let id: number | undefined;
  try {
    const res = await app.request('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type: 'c411',
        config: { apiToken: 'private-token' },
        enabled: false,
      }),
    });
    expect(res.status).toBe(200);
    const row = await res.json();
    id = row.id;
    expect(row.config).not.toHaveProperty('apiToken');
    const list = await (await app.request('/api/integrations')).json();
    expect(list.find((r: any) => r.id === id).config).not.toHaveProperty('apiToken');
    const update = await app.request(`/api/integrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 'c411', config: { apiToken: '' }, enabled: false }),
    });
    expect(update.status).toBe(200);
    expect((await update.json()).config).not.toHaveProperty('apiToken');
    expect(listIntegrations().find((r) => r.id === id)?.config.apiToken).toBe('private-token');
  } finally {
    if (id !== undefined) deleteIntegration(id);
  }
});
