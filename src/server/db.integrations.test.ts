import { expect, test } from 'bun:test';
import {
  createIntegration,
  deleteIntegration,
  getIntegration,
  listIntegrations,
  reorderIntegrations,
  updateIntegration,
} from './db';

test('integration CRUD round-trips config as JSON', () => {
  const testNames = ['Radarr 4K', 'Radarr HD'];
  for (const leftover of listIntegrations().filter((r) => testNames.includes(r.name))) {
    deleteIntegration(leftover.id);
  }

  const row = createIntegration({
    name: 'Radarr 4K',
    type: 'radarr',
    config: { url: 'http://r', apiKey: 'k' },
    enabled: true,
    refreshSeconds: 60,
  });
  try {
    expect(row.id).toBeGreaterThan(0);
    expect(getIntegration(row.id)?.config).toEqual({ url: 'http://r', apiKey: 'k' });
    const upd = updateIntegration(row.id, { ...row, name: 'Radarr HD' });
    expect(upd?.name).toBe('Radarr HD');
    expect(listIntegrations().some((r) => r.id === row.id)).toBe(true);
  } finally {
    deleteIntegration(row.id);
  }
  expect(getIntegration(row.id)).toBeNull();
});

test('position is assigned on create and returned in order', () => {
  const tag = '__pos_test__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const a = createIntegration({ name: `${tag}a`, type: 'radarr', config: {}, enabled: true, refreshSeconds: null });
  const b = createIntegration({ name: `${tag}b`, type: 'sonarr', config: {}, enabled: true, refreshSeconds: null });
  try {
    expect(typeof a.position).toBe('number');
    expect(b.position).toBeGreaterThan(a.position);
    reorderIntegrations([b.id, a.id]);
    const ordered = listIntegrations().filter((r) => r.name.startsWith(tag));
    expect(ordered[0].id).toBe(b.id);
    expect(ordered[1].id).toBe(a.id);
  } finally {
    deleteIntegration(a.id);
    deleteIntegration(b.id);
  }
});
