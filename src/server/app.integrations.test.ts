import { expect, test } from 'bun:test';
import { app } from './app';
import { deleteIntegration, listIntegrations } from './db';

const TEST_NAME = '__test_app_integration__';

function cleanup() {
  for (const row of listIntegrations().filter((r) => r.name === TEST_NAME)) {
    deleteIntegration(row.id);
  }
}

test('GET /api/integrations/types returns metadata without fetch', async () => {
  const res = await app.request('/api/integrations/types');
  expect(res.status).toBe(200);
  const body = (await res.json()) as any[];
  expect(body.length).toBe(18);
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
