import { expect, test } from 'bun:test';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { app } from './app';
import {
  createIntegration,
  deleteIntegration,
  listIntegrations,
  replaceAllIntegrations,
} from './db';

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

test('POST /api/backup writes complete JSON beside the database', async () => {
  cleanup();
  const integration = createIntegration({
    name: `${TAG}secret`,
    type: 'qbittorrent',
    config: { pass: 'stored-secret' },
    enabled: false,
    refreshSeconds: null,
  });
  let filePath: string | undefined;
  try {
    const res = await app.request('/api/backup', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toMatch(/backups\/labby-backup-.*\.json$/);
    filePath = path.resolve(body.path);
    const saved = JSON.parse(await readFile(filePath, 'utf8')) as {
      version: number;
      dashboard: unknown;
      integrations: Array<{ id: number; config: Record<string, unknown> }>;
    };
    expect(saved.version).toBe(1);
    expect(saved.dashboard).toBeDefined();
    expect(saved.integrations.find((row) => row.id === integration.id)?.config.pass).toBe(
      'stored-secret',
    );
  } finally {
    if (filePath) await unlink(filePath).catch(() => {});
    deleteIntegration(integration.id);
  }
});

test('GET /api/backup is not an export download', async () => {
  const res = await app.request('/api/backup');
  expect(res.headers.get('Content-Disposition')).toBeNull();
  expect(res.headers.get('Content-Type')).toContain('text/html');
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
  const original = {
    version: 1,
    dashboard: JSON.parse(await (await app.request('/api/config')).text()),
    integrations: listIntegrations(),
  };
  try {
    const res = await app.request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
    expect(res.status).toBe(200);
    expect(listIntegrations().length).toBe(original.integrations.length);
  } finally {
    // ensure DB returns to the original snapshot regardless
    await app.request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
  }
});
