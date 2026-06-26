import { describe, expect, test } from 'bun:test';
import { getSetting, setSetting } from '../db';
import {
  getConfig,
  getConfigState,
  loadConfig,
  onConfigChange,
  reloadConfig,
  saveThemeSettings,
} from './loader';

const VALID_DASHBOARD = {
  title: 'Labby',
  theme: { default: 'system' },
  pages: [{ name: 'Overview', columns: [{ size: 'small', widgets: [] }] }],
};

describe('config loader', () => {
  test('loadConfig reads dashboard from settings', async () => {
    setSetting('dashboard', JSON.stringify(VALID_DASHBOARD));
    const result = await loadConfig();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.title).toBe('Labby');
      expect(getConfig()?.title).toBe('Labby');
    }
  });

  test('loadConfig returns error for invalid JSON', async () => {
    setSetting('dashboard', '{not json');
    const result = await loadConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
    expect(getConfigState().ok).toBe(false);
  });

  test('loadConfig returns error for schema violation', async () => {
    setSetting('dashboard', JSON.stringify({ title: 'x', theme: { default: 'not-a-valid-theme' } }));
    const result = await loadConfig();
    expect(result.ok).toBe(false);
  });

  test('saveThemeSettings persists theme updates', async () => {
    setSetting('dashboard', JSON.stringify(VALID_DASHBOARD));
    await loadConfig();
    await saveThemeSettings({ default: 'dark-ocean', layout: 'columns', density: 'compact' });
    const config = getConfig();
    expect(config?.theme.default).toBe('dark-ocean');
    expect(config?.theme.layout).toBe('columns');
    expect(config?.theme.density).toBe('compact');
    expect(getSetting('dashboard')).toContain('dark-ocean');
  });

  test('onConfigChange notifies listeners', async () => {
    setSetting('dashboard', JSON.stringify(VALID_DASHBOARD));
    let notified = 0;
    const unsub = onConfigChange(() => {
      notified++;
    });
    await loadConfig();
    expect(notified).toBe(1);
    reloadConfig();
    await new Promise((r) => setTimeout(r, 10));
    expect(notified).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
