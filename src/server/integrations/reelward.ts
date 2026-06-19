import type { ReelwardPayload } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type ReelwardConfig = { url?: string; apiKey?: string };

export async function getReelwardSummary(
  config: ReelwardConfig,
): Promise<ReelwardPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey?.trim() || null;
  if (!base) return { error: 'REELWARD_URL not configured' };
  if (!key) return { error: 'REELWARD_API_KEY not configured' };

  return soft('Reelward', async () => {
    const res = await fetch(`${base}/api/labby/summary`, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Reelward error: ${res.status}` };
    return (await res.json()) as ReelwardPayload;
  });
}
