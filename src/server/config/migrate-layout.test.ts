import { expect, test } from 'bun:test';
import {
  createIntegration,
  deleteIntegration,
  deleteSetting,
  getIntegration,
  getSetting,
  listIntegrations,
  setSetting,
} from '../db';
import { migrateLayoutToIntegrations } from './migrate-layout';

test('migration folds widget options + order into integrations and rewrites dashboard', () => {
  const tag = '__migrate__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const savedDash = getSetting('dashboard');
  const savedFlag = getSetting('layout_migrated');
  deleteSetting('layout_migrated');

  const m = createIntegration({
    name: `${tag}mon`,
    type: 'monitor',
    config: { sites: [] },
    enabled: true,
    refreshSeconds: null,
  });
  const f = createIntegration({
    name: `${tag}feed`,
    type: 'reddit',
    config: { subreddits: ['x'] },
    enabled: true,
    refreshSeconds: null,
  });

  // legacy dashboard: feed first, monitor second; options on widgets
  setSetting(
    'dashboard',
    JSON.stringify({
      title: 'My Board',
      theme: { default: 'dark' },
      pages: [
        {
          name: 'Home',
          columns: [
            {
              size: 'full',
              widgets: [
                { type: 'reddit', integrationId: f.id, max: 9 },
                { type: 'monitor', integrationId: m.id, variant: 'tiles', style: 'compact' },
              ],
            },
          ],
        },
      ],
    }),
  );

  try {
    migrateLayoutToIntegrations();
    // options merged into config
    expect(getIntegration(f.id)?.config.max).toBe(9);
    expect(getIntegration(m.id)?.config.variant).toBe('tiles');
    expect(getIntegration(m.id)?.config.style).toBe('compact');
    // order: feed (first widget) before monitor
    expect(getIntegration(f.id)!.position).toBeLessThan(getIntegration(m.id)!.position);
    // dashboard rewritten without pages, title/theme kept
    const dash = JSON.parse(getSetting('dashboard') as string);
    expect(dash.pages).toBeUndefined();
    expect(dash.title).toBe('My Board');
    expect(dash.theme.default).toBe('dark');
    // idempotent: second run is a no-op (flag set)
    expect(getSetting('layout_migrated')).toBe('1');
  } finally {
    deleteIntegration(m.id);
    deleteIntegration(f.id);
    if (savedDash !== null) setSetting('dashboard', savedDash);
    if (savedFlag !== null) setSetting('layout_migrated', savedFlag);
    else deleteSetting('layout_migrated');
  }
});
