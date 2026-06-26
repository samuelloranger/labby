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

export const DashboardSchema = z.object({
  title: z.string().default('Labby'),
  theme: ThemeConfigSchema.default({ default: 'system', layout: 'masonry' }),
});

export type Dashboard = z.infer<typeof DashboardSchema>;
export type Site = z.infer<typeof SiteSchema>;

export function sanitizeDashboard(config: Dashboard): Dashboard {
  return JSON.parse(JSON.stringify(config));
}
