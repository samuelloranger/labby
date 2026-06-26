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
  'dark-slate',
  'dark-mint',
  'dark-rose',
  'dark-peach',
  'light-graphite',
  'light-ocean',
  'light-forest',
  'light-dracula',
  'light-cyberpunk',
]);
export type ThemeName = z.infer<typeof ThemeSchema>;

export const LayoutSchema = z.enum(['masonry', 'columns']);
export type LayoutType = z.infer<typeof LayoutSchema>;

export const DensitySchema = z.enum(['default', 'compact']);
export type DensityType = z.infer<typeof DensitySchema>;

export const ThemeConfigSchema = z.object({
  default: ThemeSchema.default('system'),
  layout: LayoutSchema.default('masonry'),
  density: DensitySchema.default('compact'),
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

const integrationId = z.number().int();

export const WidgetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('monitor'),
    title: z.string(),
    integrationId,
    style: z.enum(['compact', 'default']).optional(),
    variant: z.enum(['rows', 'tiles']).optional(),
  }),
  z.object({
    type: z.literal('docker'),
    title: z.string(),
    integrationId,
  }),
  z.object({
    type: z.literal('downloads'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('adguard'),
    title: z.string(),
    integrationId,
  }),
  z.object({
    type: z.literal('jellyfin'),
    title: z.string(),
    integrationId,
  }),
  z.object({
    type: z.literal('beszel'),
    title: z.string(),
    integrationId,
    systems: z.array(z.string()).optional(),
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('radarr'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('sonarr'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('reelward'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('reddit'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('hackernews'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('weather'),
    title: z.string(),
    integrationId,
  }),
  z.object({
    type: z.literal('calendar'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('speedtest'),
    title: z.string(),
    integrationId,
    max: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('bookmarks'),
    title: z.string(),
    integrationId,
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
  pages: z.array(PageSchema).min(1),
});

export type Dashboard = z.infer<typeof DashboardSchema>;
export type Widget = z.infer<typeof WidgetSchema>;
export type Site = z.infer<typeof SiteSchema>;

export function sanitizeDashboard(config: Dashboard): Dashboard {
  return JSON.parse(JSON.stringify(config));
}
