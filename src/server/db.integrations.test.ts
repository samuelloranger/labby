import { expect, test } from 'bun:test';
import { createIntegration, deleteIntegration, getIntegration, listIntegrations, updateIntegration } from './db';

test('integration CRUD round-trips config as JSON', () => {
  const testNames = ['Radarr 4K', 'Radarr HD'];
  for (const leftover of listIntegrations().filter((r) => testNames.includes(r.name))) {
    deleteIntegration(leftover.id);
  }

  const row = createIntegration({ name: 'Radarr 4K', type: 'radarr', config: { url: 'http://r', apiKey: 'k' }, enabled: true, refreshSeconds: 60 });
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
