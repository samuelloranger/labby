import { watch } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { DashboardSchema, type Dashboard, type ThemeName } from './schema';

const CONFIG_PATH = process.env.LABBY_CONFIG_PATH ?? path.join(process.cwd(), 'config', 'dashboard.json');

export type ConfigState =
  | { ok: true; config: Dashboard }
  | { ok: false; error: string };

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
  try {
    return await readFile(CONFIG_PATH, 'utf-8');
  } catch (err) {
    // Fall back to the shipped example so a fresh `docker run` (no mounted
    // config) boots a working demo dashboard instead of an error state.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const examplePath = path.join(path.dirname(CONFIG_PATH), 'dashboard.example.json');
      console.warn(`Config ${CONFIG_PATH} not found; loading ${examplePath}`);
      return await readFile(examplePath, 'utf-8');
    }
    throw err;
  }
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

export async function saveTheme(theme: ThemeName): Promise<void> {
  const raw = await readConfigRaw();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const oldTheme = typeof parsed.theme === 'object' && parsed.theme !== null ? parsed.theme : {};
  parsed.theme = { ...oldTheme, default: theme };
  const config = DashboardSchema.parse(parsed);
  await writeFile(CONFIG_PATH, `${JSON.stringify(parsed, null, 2)}\n`);
  setState({ ok: true, config });
}

export function startConfigWatch(): void {
  const dir = path.dirname(CONFIG_PATH);
  const file = path.basename(CONFIG_PATH);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(dir, { persistent: true }, (_event, filename) => {
    if (filename && filename !== file) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void loadConfig();
    }, 200);
  });
  // Don't let an inotify failure (EMFILE, etc.) crash the process; hot-reload
  // simply stops while the rest of the server keeps serving.
  watcher.on('error', (err) => console.error('[config] file watch error:', err));
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
