import type { ReelwardPayload } from '../types';

function baseUrl(): string | null {
  return process.env.REELWARD_URL?.trim().replace(/\/$/, '') || null;
}

function apiKey(): string | null {
  return process.env.REELWARD_API_KEY?.trim() || null;
}

export async function getReelwardSummary(): Promise<ReelwardPayload | { error: string }> {
  const base = baseUrl();
  const key = apiKey();
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
