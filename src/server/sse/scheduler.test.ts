import { expect, test } from 'bun:test';
import { createIntegration, deleteIntegration, listIntegrations } from '../db';
import { hub } from './hub';
import { refreshIntegration } from './scheduler';

test('refreshIntegration does not publish when integration is disabled', async () => {
  for (const row of listIntegrations().filter((r) => r.name === '__test_radarr_disabled__')) {
    deleteIntegration(row.id);
  }

  const row = createIntegration({
    name: '__test_radarr_disabled__',
    type: 'radarr',
    config: {},
    enabled: false,
    refreshSeconds: null,
  });

  try {
    await refreshIntegration(row.id);
    const snapshot = hub.getSnapshot();
    // Should NOT have published anything for a disabled integration
    expect(snapshot.has(`int:${row.id}`)).toBe(false);
  } finally {
    deleteIntegration(row.id);
  }
});

test('refreshIntegration publishes integration result under int:<id>', async () => {
  // Clean up any leftover test row
  for (const row of listIntegrations().filter((r) => r.name === '__test_radarr_scheduler__')) {
    deleteIntegration(row.id);
  }

  // radarr with empty config returns {error:'RADARR_URL not configured'} without hitting network
  const row = createIntegration({
    name: '__test_radarr_scheduler__',
    type: 'radarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });

  try {
    await refreshIntegration(row.id);
    const snapshot = hub.getSnapshot();
    const result = snapshot.get(`int:${row.id}`);
    expect(result).toEqual({ error: 'RADARR_URL not configured' });
  } finally {
    deleteIntegration(row.id);
  }
});
