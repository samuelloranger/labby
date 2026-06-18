import { z } from 'zod';

export const ThemeSchema = z.enum([
  'system',
  'light',
  'light-slate',
  'light-mint',
  'light-rose',
  'light-nord',
  'light-peach',
  'dark',
  'dark-graphite',
  'dark-ocean',
  'dark-forest',
  'dark-dracula',
  'dark-nord',
  'dark-cyberpunk',
]);
export type ThemeName = z.infer<typeof ThemeSchema>;

export const LayoutSchema = z.enum(['masonry', 'columns']);
export type LayoutType = z.infer<typeof LayoutSchema>;

export const ThemeConfigSchema = z.object({
  default: ThemeSchema.default('system'),
  layout: LayoutSchema.default('masonry'),
  customCss: z.string().optional(),
});
export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

export const SiteSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  checkUrl: z.string(),
  icon: z.string().optional(),
  okCodes: z.array(z.number()).optional(),
});

export const WidgetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('monitor'),
    title: z.string(),
    style: z.enum(['compact', 'default']).optional(),
    variant: z.enum(['rows', 'tiles']).optional(),
    sites: z.array(SiteSchema),
  }),
  z.object({
    type: z.literal('docker'),
    title: z.string(),
    show: z.enum(['all', 'running']).optional(),
  }),
  z.object({
    type: z.literal('downloads'),
    title: z.string(),
    client: z.enum(['qbittorrent', 'transmission']),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('adguard'),
    title: z.string(),
  }),
  z.object({
    type: z.literal('jellyfin'),
    title: z.string(),
  }),
  z.object({
    type: z.literal('beszel'),
    title: z.string(),
    systems: z.array(z.string()).optional(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('radarr'),
    title: z.string(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('sonarr'),
    title: z.string(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('reelward'),
    title: z.string(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('reddit'),
    title: z.string(),
    // one sub ("homelab") or several to merge into one feed
    subreddit: z.union([z.string(), z.array(z.string()).nonempty()]),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('hackernews'),
    title: z.string(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('weather'),
    title: z.string(),
    city: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    units: z.enum(['metric', 'imperial']).optional(),
  }),
  z.object({
    type: z.literal('calendar'),
    title: z.string(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('speedtest'),
    title: z.string(),
    max: z.number().int().positive().optional(),
  }),
]);

export const ColumnSchema = z.object({
  size: z.enum(['small', 'full']),
  widgets: z.array(WidgetSchema),
});

export const PageSchema = z.object({
  name: z.string(),
  columns: z.array(ColumnSchema),
});

export const DashboardSchema = z.object({
  title: z.string().default('Labby'),
  theme: ThemeConfigSchema.default({ default: 'system', layout: 'masonry' }),
  refreshSeconds: z
    .object({
      monitor: z.number().default(30),
      docker: z.number().default(10),
      downloads: z.number().default(5),
      adguard: z.number().default(60),
      jellyfin: z.number().default(15),
      beszel: z.number().default(15),
      radarr: z.number().default(60),
      sonarr: z.number().default(60),
      reelward: z.number().default(60),
      weather: z.number().default(900),
      calendar: z.number().default(600),
      speedtest: z.number().default(1800),
    })
    .default({}),
  pages: z.array(PageSchema).min(1),
});

export type Dashboard = z.infer<typeof DashboardSchema>;
export type Widget = z.infer<typeof WidgetSchema>;
export type Site = z.infer<typeof SiteSchema>;

export function sanitizeDashboard(config: Dashboard): Dashboard {
  return JSON.parse(JSON.stringify(config));
}

export function collectMonitorSites(config: Dashboard): Site[] {
  const sites: Site[] = [];
  const seen = new Set<string>();
  for (const page of config.pages) {
    for (const col of page.columns) {
      for (const widget of col.widgets) {
        if (widget.type === 'monitor') {
          for (const site of widget.sites) {
            if (!seen.has(site.checkUrl)) {
              seen.add(site.checkUrl);
              sites.push(site);
            }
          }
        }
      }
    }
  }
  return sites;
}

export function collectDownloadClients(config: Dashboard): Array<'qbittorrent' | 'transmission'> {
  const clients = new Set<'qbittorrent' | 'transmission'>();
  for (const page of config.pages) {
    for (const col of page.columns) {
      for (const widget of col.widgets) {
        if (widget.type === 'downloads') {
          clients.add(widget.client);
        }
      }
    }
  }
  return [...clients];
}

export function hasWidgetType(config: Dashboard, type: Widget['type']): boolean {
  for (const page of config.pages) {
    for (const col of page.columns) {
      if (col.widgets.some((w) => w.type === type)) return true;
    }
  }
  return false;
}

/**
 * Docker is polled once globally (single scheduler channel), so the `show`
 * setting of the first docker widget governs the shared container list.
 */
export type WeatherLocationQuery = {
  key: string;
  city?: string;
  lat?: number;
  lon?: number;
  units: 'metric' | 'imperial';
};

export function weatherLocationKey(widget: {
  city?: string;
  lat?: number;
  lon?: number;
}): string | null {
  if (widget.city) return `city:${widget.city}`;
  if (widget.lat != null && widget.lon != null) return `coord:${widget.lat},${widget.lon}`;
  return null;
}

export function collectWeatherLocations(config: Dashboard): WeatherLocationQuery[] {
  const locations: WeatherLocationQuery[] = [];
  const seen = new Set<string>();
  for (const page of config.pages) {
    for (const col of page.columns) {
      for (const widget of col.widgets) {
        if (widget.type !== 'weather') continue;
        const key = weatherLocationKey(widget);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        locations.push({
          key,
          city: widget.city,
          lat: widget.lat,
          lon: widget.lon,
          units: widget.units ?? 'metric',
        });
      }
    }
  }
  return locations;
}

export function getDockerShow(config: Dashboard): 'all' | 'running' {
  for (const page of config.pages) {
    for (const col of page.columns) {
      for (const widget of col.widgets) {
        if (widget.type === 'docker') return widget.show === 'all' ? 'all' : 'running';
      }
    }
  }
  return 'running';
}
