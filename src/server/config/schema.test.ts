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
                  integrationId: 1,
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

  test('parses theme with layout and density', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      theme: { default: 'dark-ocean', layout: 'columns', density: 'compact' },
      pages: [{ name: 'Overview', columns: [{ size: 'small', widgets: [] }] }],
    });
    expect(config.theme.default).toBe('dark-ocean');
    expect(config.theme.layout).toBe('columns');
    expect(config.theme.density).toBe('compact');
  });

  test('parses weather widget with integrationId', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      pages: [
        {
          name: 'Overview',
          columns: [
            {
              size: 'small',
              widgets: [{ type: 'weather', title: 'Weather', integrationId: 2 }],
            },
          ],
        },
      ],
    });
    expect(config.pages[0].columns[0].widgets[0]).toMatchObject({
      type: 'weather',
      integrationId: 2,
    });
  });

  test('parses media service widgets', () => {
    const config = DashboardSchema.parse({
      title: 'Labby',
      pages: [
        {
          name: 'Overview',
          columns: [
            {
              size: 'small',
              widgets: [
                { type: 'radarr', title: 'Radarr', integrationId: 3, max: 3 },
                { type: 'sonarr', title: 'Sonarr', integrationId: 4, max: 3 },
                { type: 'reelward', title: 'Reelward', integrationId: 5, max: 3 },
              ],
            },
          ],
        },
      ],
    });
    expect(config.pages[0].columns[0].widgets).toHaveLength(3);
  });

  test('rejects monitor widget without integrationId', () => {
    expect(() =>
      DashboardSchema.parse({
        title: 'Labby',
        pages: [
          {
            name: 'Overview',
            columns: [
              {
                size: 'small',
                widgets: [{ type: 'monitor', title: 'Core', sites: [] }],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
