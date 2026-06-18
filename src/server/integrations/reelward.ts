import type { ReelwardPayload } from '../types';

export type ReelwardConfig = { url?: string; apiKey?: string };

export async function getReelwardSummary(config: ReelwardConfig): Promise<ReelwardPayload | { error: string }> {
  const base = config.url?.trim().replace(/\/$/, '') || null;
  const key = config.apiKey?.trim() || null;
  if (!base) return { error: 'REELWARD_URL not configured' };
  if (!key) return { error: 'REELWARD_API_KEY not configured' };

  try {
    const res = await fetch(`${base}/api/labby/summary`, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `Reelward error: ${res.status}` };
    return (await res.json()) as ReelwardPayload;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Reelward unreachable',
    };
  }
}
