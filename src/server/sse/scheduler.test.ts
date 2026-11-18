import { expect, test } from 'bun:test';
import { createIntegration, deleteIntegration, listIntegrations } from '../db';
import { INTEGRATIONS } from '../integrations/registry';
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

test('refreshIntegration skips a second run while the first fetch is in flight', async () => {
  // Clean up any leftover test row
  for (const row of listIntegrations().filter((r) => r.name === '__test_radarr_overlap__')) {
    deleteIntegration(row.id);
  }

  const row = createIntegration({
    name: '__test_radarr_overlap__',
    type: 'radarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });

  // Controllable stand-in for the real fetch: the first call parks on a deferred
  // we resolve by hand (deterministic — no timers, no network). Later calls resolve.
  const originalFetch = INTEGRATIONS.radarr.fetch;
  let calls = 0;
  let releaseFirst!: (value: unknown) => void;
  const firstFetch = new Promise<unknown>((resolve) => {
    releaseFirst = resolve;
  });
  INTEGRATIONS.radarr.fetch = () => {
    calls += 1;
    return calls === 1 ? firstFetch : Promise.resolve({ pass: calls });
  };

  try {
    const first = refreshIntegration(row.id);
    expect(calls).toBe(1);

    // Fires while the first run is still in flight — must be skipped, not stacked.
    const second = refreshIntegration(row.id);
    expect(calls).toBe(1);

    // Let the in-flight run finish: it publishes, and both triggers settle.
    // (Stand-in data is outside the ChannelPayload union — bridge it like scheduler.ts does.)
    releaseFirst({ items: [] });
    await Promise.all([first, second]);
    expect(hub.getSnapshot().get(`int:${row.id}`) as unknown).toEqual({ items: [] });

    // Guard released: a third trigger invokes fetch again.
    await refreshIntegration(row.id);
    expect(calls).toBe(2);
    expect(hub.getSnapshot().get(`int:${row.id}`) as unknown).toEqual({ pass: 2 });
  } finally {
    INTEGRATIONS.radarr.fetch = originalFetch;
    deleteIntegration(row.id);
  }
});

test('a failing fetch still publishes its error and releases the guard', async () => {
  // Clean up any leftover test row
  for (const row of listIntegrations().filter((r) => r.name === '__test_radarr_error__')) {
    deleteIntegration(row.id);
  }

  const row = createIntegration({
    name: '__test_radarr_error__',
    type: 'radarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });

  // Rejecting stand-in for the real fetch — no network.
  const originalFetch = INTEGRATIONS.radarr.fetch;
  let calls = 0;
  INTEGRATIONS.radarr.fetch = async () => {
    calls += 1;
    throw new Error(`boom ${calls}`);
  };

  try {
    await refreshIntegration(row.id);
    expect(hub.getSnapshot().get(`int:${row.id}`)).toEqual({ error: 'boom 1' });

    // The guard must not stick on a failed run: fetch is invoked again.
    await refreshIntegration(row.id);
    expect(calls).toBe(2);
    expect(hub.getSnapshot().get(`int:${row.id}`)).toEqual({ error: 'boom 2' });
  } finally {
    INTEGRATIONS.radarr.fetch = originalFetch;
    deleteIntegration(row.id);
  }
});
