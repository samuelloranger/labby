import type { RawkoonPayload } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type RawkoonConfig = { url?: string; apiKey?: string };

export async function getRawkoonSummary(
  config: RawkoonConfig,
): Promise<RawkoonPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey?.trim() || null;
  if (!base) return { error: 'RAWKOON_URL not configured' };
  if (!key) return { error: 'RAWKOON_API_KEY not configured' };

  return soft('Rawkoon', async () => {
    const res = await fetch(`${base}/api/labby/summary`, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Rawkoon error: ${res.status}` };
    return (await res.json()) as RawkoonPayload;
  });
}
