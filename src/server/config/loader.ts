import { getSetting, setSetting } from '../db';
import {
  type Dashboard,
  DashboardSchema,
  type DensityType,
  type LayoutType,
  type ThemeName,
} from './schema';

export type ConfigState = { ok: true; config: Dashboard } | { ok: false; error: string };

let state: ConfigState = { ok: false, error: 'Config not loaded' };
const listeners = new Set<(state: ConfigState) => void>();

export function getConfigState(): ConfigState {
  return state;
}

export function getConfig(): Dashboard | null {
  return state.ok ? state.config : null;
}

export function onConfigChange(listener: (state: ConfigState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: ConfigState) {
  state = next;
  for (const listener of listeners) listener(next);
}

async function readConfigRaw(): Promise<string> {
  const dbConfig = getSetting('dashboard');
  if (dbConfig) {
    return dbConfig;
  }
  throw new Error('Dashboard config not found in database. Migration failed to run?');
}

export async function loadConfig(): Promise<ConfigState> {
  try {
    const raw = await readConfigRaw();
    const parsed = JSON.parse(raw);
    const config = DashboardSchema.parse(parsed);
    const next: ConfigState = { ok: true, config };
    setState(next);
    return next;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown config error';
    const next: ConfigState = { ok: false, error: message };
    setState(next);
    return next;
  }
}

export async function saveThemeSettings(settings: {
  default?: ThemeName;
  layout?: LayoutType;
  density?: DensityType;
  customCss?: string;
}): Promise<void> {
  const raw = await readConfigRaw();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const oldTheme = typeof parsed.theme === 'object' && parsed.theme !== null ? parsed.theme : {};
  parsed.theme = {
    ...oldTheme,
    ...(settings.default ? { default: settings.default } : {}),
    ...(settings.layout ? { layout: settings.layout } : {}),
    ...(settings.density ? { density: settings.density } : {}),
    ...(settings.customCss !== undefined ? { customCss: settings.customCss } : {}),
  };
  const config = DashboardSchema.parse(parsed);
  setSetting('dashboard', JSON.stringify(parsed, null, 2));
  setState({ ok: true, config });
}

export function reloadConfig(): Promise<ConfigState> {
  return loadConfig();
}
