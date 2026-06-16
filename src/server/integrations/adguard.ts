import type { AdGuardPayload } from '../types';

function baseUrl(): string | null {
  const url = process.env.ADGUARD_URL;
  return url ? url.replace(/\/$/, '') : null;
}

function authHeaders(): HeadersInit {
  const user = process.env.ADGUARD_USER ?? '';
  const pass = process.env.ADGUARD_PASS ?? '';
  const headers: Record<string, string> = {};
  if (user || pass) {
    headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  }
  return headers;
}

async function adguardFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = baseUrl();
  if (!base) throw new Error('ADGUARD_URL not configured');
  return fetch(`${base}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string>) },
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });
}

export async function getAdGuardStats(): Promise<AdGuardPayload | { error: string }> {
  if (!baseUrl()) return { error: 'ADGUARD_URL not configured' };

  try {
    const [statsRes, statusRes] = await Promise.all([
      adguardFetch('/control/stats'),
      adguardFetch('/control/status'),
    ]);

    if (!statsRes.ok) return { error: `AdGuard stats error: ${statsRes.status}` };
    if (!statusRes.ok) return { error: `AdGuard status error: ${statusRes.status}` };

    const stats = await statsRes.json();
    const status = await statusRes.json();

    const numDnsQueries = Number(stats.num_dns_queries ?? 0);
    const numBlocked = Number(stats.num_blocked_filtering ?? 0);
    const blockedPercent =
      numDnsQueries > 0 ? Math.round((numBlocked / numDnsQueries) * 1000) / 10 : 0;

    return {
      queries: numDnsQueries,
      blockedPercent,
      avgLatencyMs: Math.round(Number(stats.avg_processing_time ?? 0) * 1000),
      rulesCount: Number(status.rules_count ?? status.filtering_enabled_rules ?? 0),
      protectionEnabled: Boolean(status.protection_enabled),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'AdGuard unreachable' };
  }
}

export async function setAdGuardProtection(
  enabled: boolean,
  durationMs?: number,
): Promise<{ ok: true } | { error: string }> {
  if (!baseUrl()) return { error: 'ADGUARD_URL not configured' };

  try {
    const body: Record<string, unknown> = { enabled };
    if (durationMs != null) body.duration = Math.round(durationMs / 1000);
    const res = await adguardFetch('/control/protection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `AdGuard protection toggle failed: ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'AdGuard protection toggle failed' };
  }
}
