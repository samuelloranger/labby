import { describe, expect, test } from 'bun:test';
import { DashboardSchema } from './schema';

describe('DashboardSchema', () => {
  test('parses minimal valid config', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      pages: [
        {
          name: 'Overview',
          columns: [
            {
              size: 'small',
              widgets: [
                {
                  type: 'monitor',
                  title: 'Core',
                  sites: [{ title: 'Test', checkUrl: 'http://localhost:1' }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(config.title).toBe('Labby');
    expect(config.theme.default).toBe('system');
  });

  test('rejects empty pages', () => {
    expect(() => DashboardSchema.parse({ title: 'x', pages: [] })).toThrow();
  });

  test('parses named color scheme', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      theme: { default: 'dark-ocean' },
      pages: [{ name: 'Overview', columns: [{ size: 'small', widgets: [] }] }],
    });
    expect(config.theme.default).toBe('dark-ocean');
  });

  test('parses weather widget with city', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      pages: [
        {
          name: 'Overview',
          columns: [
            {
              size: 'small',
              widgets: [{ type: 'weather', title: 'Weather', city: 'Paris,FR' }],
            },
          ],
        },
      ],
    });
    expect(config.pages[0].columns[0].widgets[0]).toMatchObject({
      type: 'weather',
      city: 'Paris,FR',
    });
  });

  test('parses media service widgets', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      refreshSeconds: { radarr: 30, sonarr: 30, reelward: 60 },
      pages: [
        {
          name: 'Overview',
          columns: [
            {
              size: 'small',
              widgets: [
                { type: 'radarr', title: 'Radarr', max: 3 },
                { type: 'sonarr', title: 'Sonarr', max: 3 },
                { type: 'reelward', title: 'Reelward', max: 3 },
              ],
            },
          ],
        },
      ],
    });
    expect(config.refreshSeconds.radarr).toBe(30);
    expect(config.pages[0].columns[0].widgets).toHaveLength(3);
  });
});
