import { describe, expect, test } from 'bun:test';
import { DashboardSchema } from './schema';

describe('DashboardSchema', () => {
  test('parses minimal valid config with defaults', () => {
    const config = DashboardSchema.parse({ title: 'Labby' });
    expect(config.title).toBe('Labby');
    expect(config.theme.default).toBe('system');
  });

  test('parses named color scheme', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      theme: { default: 'dark-ocean' },
    });
    expect(config.theme.default).toBe('dark-ocean');
  });

  test('parses theme with layout and density', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      theme: { default: 'dark-ocean', layout: 'columns', density: 'compact' },
    });
    expect(config.theme.default).toBe('dark-ocean');
    expect(config.theme.layout).toBe('columns');
    expect(config.theme.density).toBe('compact');
  });

  test('DashboardSchema accepts {title, theme} without pages', () => {
    const parsed = DashboardSchema.parse({ title: 'Home', theme: { default: 'dark' } });
    expect(parsed.title).toBe('Home');
  });

  test('DashboardSchema ignores a legacy pages field', () => {
    const parsed = DashboardSchema.parse({
      title: 'X',
      theme: { default: 'system' },
      pages: [{ junk: true }],
    });
    expect((parsed as any).pages).toBeUndefined();
  });

  test('parses every system-<palette> theme value', () => {
    const palettes = [
      'slate',
      'mint',
      'rose',
      'nord',
      'peach',
      'graphite',
      'ocean',
      'forest',
      'dracula',
      'cyberpunk',
    ];
    for (const p of palettes) {
      const config = DashboardSchema.parse({
        title: 'Labby',
        theme: { default: `system-${p}` as any },
      });
      expect(config.theme.default).toBe(`system-${p}` as any);
    }
  });

  test('theme.motion defaults to false and accepts true', () => {
    const defaulted = DashboardSchema.parse({ title: 'Labby' });
    expect(defaulted.theme.motion).toBe(false);

    const enabled = DashboardSchema.parse({
      title: 'Labby',
      theme: { default: 'system', motion: true },
    });
    expect(enabled.theme.motion).toBe(true);
  });
});
