import { expect, test } from 'bun:test';
import { app } from './app';
import { deleteIntegration, listIntegrations, replaceAllIntegrations } from './db';

const TAG = '__test_backup__';

function cleanup() {
  for (const r of listIntegrations().filter((r) => r.name.startsWith(TAG))) deleteIntegration(r.id);
}

test('replaceAllIntegrations wipes then restores rows preserving ids', () => {
  cleanup();
  // snapshot current rows so we can restore the DB after the test
  const original = listIntegrations();
  try {
    const restored = [
      {
        id: 9001,
        name: `${TAG}a`,
        type: 'radarr',
        config: { url: 'http://a' },
        enabled: true,
        refreshSeconds: 60,
      },
      {
        id: 9002,
        name: `${TAG}b`,
        type: 'sonarr',
        config: {},
        enabled: false,
        refreshSeconds: null,
      },
    ];
    replaceAllIntegrations(restored);
    const after = listIntegrations();
    expect(after.length).toBe(2);
    expect(after.find((r) => r.id === 9001)?.name).toBe(`${TAG}a`);
    expect(after.find((r) => r.id === 9001)?.config).toEqual({ url: 'http://a' });
    expect(after.find((r) => r.id === 9002)?.enabled).toBe(false);
  } finally {
    // restore the original integrations table
    replaceAllIntegrations(original);
  }
});

test('GET /api/backup returns version, dashboard, and integrations', async () => {
  const res = await app.request('/api/backup');
  expect(res.status).toBe(200);
  const body = (await res.json()) as any;
  expect(body.version).toBe(1);
  expect(body.dashboard).toBeDefined();
  expect(Array.isArray(body.integrations)).toBe(true);
  expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="labby-backup-/);
});

test('POST /api/restore rejects a malformed payload with 400 and leaves the DB intact', async () => {
  const before = listIntegrations().length;
  const res = await app.request('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      dashboard: { title: 'x', theme: { default: 'not-a-valid-theme' } },
      integrations: [],
    }),
  });
  expect(res.status).toBe(400);
  expect(listIntegrations().length).toBe(before);
});

test('POST /api/restore round-trips a valid backup', async () => {
  const original = await (await app.request('/api/backup')).json();
  try {
    const res = await app.request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
    expect(res.status).toBe(200);
    const again = await (await app.request('/api/backup')).json();
    expect(again.integrations.length).toBe(original.integrations.length);
  } finally {
    // ensure DB returns to the original snapshot regardless
    await app.request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
  }
});
