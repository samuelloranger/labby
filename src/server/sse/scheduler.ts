import { getIntegration, listIntegrations } from '../db';
import { INTEGRATIONS, type IntegrationType } from '../integrations/registry';
import { hub } from './hub';

const timers = new Map<number, ReturnType<typeof setInterval>>();

function clearTimers(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}

async function runIntegration(id: number): Promise<void> {
  const row = getIntegration(id);
  if (!row) return;
  const def = INTEGRATIONS[row.type as IntegrationType];
  if (!def) {
    hub.publish(`int:${id}`, { error: `Unknown integration type: ${row.type}` });
    return;
  }
  try {
    const data = await def.fetch(row.config);
    hub.publish(`int:${id}`, data as Parameters<typeof hub.publish>[1]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hub.publish(`int:${id}`, { error: message });
  }
}

export function startScheduler(): void {
  clearTimers();
  const rows = listIntegrations();
  for (const row of rows) {
    if (!row.enabled) continue;
    const def = INTEGRATIONS[row.type as IntegrationType];
    if (!def) continue;
    const seconds = row.refreshSeconds ?? def.defaultRefreshSeconds;
    const run = () => void runIntegration(row.id).catch((err) => console.error(`[scheduler] int:${row.id} failed:`, err));
    run();
    timers.set(row.id, setInterval(run, seconds * 1000));
  }
}

export async function refreshIntegration(id: number): Promise<void> {
  try {
    await runIntegration(id);
  } catch (err) {
    console.error(`[scheduler] int:${id} refresh failed:`, err);
  }
}

export function initScheduler(): void {
  startScheduler();
}
