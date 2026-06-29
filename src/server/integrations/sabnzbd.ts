import type { SabnzbdPayload, SabnzbdSlot } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type SabnzbdConfig = { url?: string; apiKey?: string; max?: number };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getSabnzbdQueue(
  config: SabnzbdConfig,
): Promise<SabnzbdPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'SABNZBD_URL not configured' };
  if (!key) return { error: 'SABNZBD_API_KEY not configured' };

  return soft('SABnzbd', async () => {
    const res = await fetch(
      `${base}/api?mode=queue&output=json&apikey=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return { error: `SABnzbd error: ${res.status}` };

    const body = (await res.json()) as Record<string, unknown>;
    // SABnzbd returns HTTP 200 with { error } on a bad apikey.
    if (typeof body.error === 'string') return { error: body.error };

    const queue = (body.queue ?? {}) as Record<string, unknown>;
    const rawSlots = (queue.slots as Record<string, unknown>[]) ?? [];
    const slots: SabnzbdSlot[] = rawSlots.map((s) => ({
      id: String(s.nzo_id ?? ''),
      name: String(s.filename ?? ''),
      progress: num(s.percentage),
      sizeLeftMb: num(s.mbleft),
      timeLeft: String(s.timeleft ?? ''),
      status: String(s.status ?? ''),
    }));

    return {
      paused: Boolean(queue.paused),
      speedBps: Math.round(num(queue.kbpersec) * 1024),
      sizeLeftMb: num(queue.mbleft),
      timeLeft: String(queue.timeleft ?? ''),
      slots,
    };
  });
}

export async function sabnzbdAction(
  config: SabnzbdConfig,
  nzoId: string,
  action: 'pause' | 'resume',
): Promise<{ ok: true } | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'SABNZBD_URL not configured' };
  if (!key) return { error: 'SABNZBD_API_KEY not configured' };

  try {
    const res = await fetch(
      `${base}/api?mode=queue&name=${action}&value=${encodeURIComponent(nzoId)}&apikey=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return { error: `SABnzbd ${action} failed: ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `SABnzbd ${action} failed` };
  }
}
