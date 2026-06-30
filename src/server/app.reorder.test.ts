import { expect, test } from 'bun:test';
import { app } from './app';
import { createIntegration, deleteIntegration, listIntegrations } from './db';

test('POST /api/integrations/reorder sets the given order', async () => {
  const tag = '__reorder_api__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const a = createIntegration({
    name: `${tag}a`,
    type: 'radarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });
  const b = createIntegration({
    name: `${tag}b`,
    type: 'sonarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });
  try {
    const res = await app.request('/api/integrations/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [b.id, a.id] }),
    });
    expect(res.status).toBe(200);
    const ordered = listIntegrations().filter((r) => r.name.startsWith(tag));
    expect(ordered[0].id).toBe(b.id);
  } finally {
    deleteIntegration(a.id);
    deleteIntegration(b.id);
  }
});

test('POST /api/integrations/reorder rejects a non-array body with 400', async () => {
  const res = await app.request('/api/integrations/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: 'nope' }),
  });
  expect(res.status).toBe(400);
});
