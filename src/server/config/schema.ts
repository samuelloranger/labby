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
  'system-slate',
  'system-mint',
  'system-rose',
  'system-nord',
  'system-peach',
  'system-graphite',
  'system-ocean',
  'system-forest',
  'system-dracula',
  'system-cyberpunk',
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
  motion: z.boolean().default(false),
  // On by default: glass is the identity. Off is the escape hatch for hardware
  // where backdrop-filter is the frame budget — measured 4.5x on a weak GPU.
  glass: z.boolean().default(true),
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
  theme: ThemeConfigSchema.default({
    default: 'system',
    layout: 'masonry',
    density: 'compact',
    motion: false,
    glass: true,
  }),
});

export type Dashboard = z.infer<typeof DashboardSchema>;
export type Site = z.infer<typeof SiteSchema>;

export function sanitizeDashboard(config: Dashboard): Dashboard {
  return JSON.parse(JSON.stringify(config));
}
