import type { SpeedtestPayload } from '../types';

function baseUrl(): string | null {
  const url = process.env.SPEEDTEST_TRACKER_URL;
  return url ? url.replace(/\/$/, '') : null;
}

function token(): string | null {
  return process.env.SPEEDTEST_TRACKER_API_TOKEN?.trim() || null;
}

async function speedtestFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = baseUrl();
  const tok = token();
  if (!base) throw new Error('SPEEDTEST_TRACKER_URL not configured');
  if (!tok) throw new Error('SPEEDTEST_TRACKER_API_TOKEN not configured');

  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/json',
      ...(init?.headers as Record<string, string>),
    },
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });
}

type SpeedtestResponseItem = {
  id: number | string;
  ping?: number | string | null;
  download?: number | string | null;
  upload?: number | string | null;
  created_at?: string | null;
};

export async function getSpeedtestSummary(max = 10): Promise<SpeedtestPayload | { error: string }> {
  if (!baseUrl()) return { error: 'SPEEDTEST_TRACKER_URL not configured' };
  if (!token()) return { error: 'SPEEDTEST_TRACKER_API_TOKEN not configured' };

  try {
    const res = await speedtestFetch(`/api/v1/results?sort=-created_at&per_page=${max}`);
    if (!res.ok) return { error: `Speedtest Tracker error: ${res.status}` };

    const payload = (await res.json()) as { data?: SpeedtestResponseItem[] };
    const data = payload.data ?? [];

    const history = data.map((item) => ({
      id: Number(item.id),
      ping: Number(item.ping ?? 0),
      download: Number(item.download ?? 0) * 8,
      upload: Number(item.upload ?? 0) * 8,
      createdAt: item.created_at
        ? item.created_at.trim().replace(' ', 'T') + (item.created_at.includes('Z') ? '' : 'Z')
        : new Date().toISOString(),
    }));

    return {
      latest: history[0] ?? null,
      history,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Speedtest Tracker unreachable',
    };
  }
}

export async function triggerSpeedtestRun(): Promise<{ ok: true } | { error: string }> {
  if (!baseUrl()) return { error: 'SPEEDTEST_TRACKER_URL not configured' };
  if (!token()) return { error: 'SPEEDTEST_TRACKER_API_TOKEN not configured' };

  try {
    const res = await speedtestFetch('/api/v1/speedtests/run', {
      method: 'POST',
    });
    if (!res.ok) return { error: `Speedtest trigger failed: ${res.status}` };
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Speedtest trigger failed',
    };
  }
}
