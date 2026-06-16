import type { DownloadsPayload, Torrent } from '../types';

let sid: string | null = null;

function baseUrl(): string | null {
  const url = process.env.QBIT_URL;
  return url ? url.replace(/\/$/, '') : null;
}

async function login(): Promise<boolean> {
  const base = baseUrl();
  if (!base) return false;
  const user = process.env.QBIT_USER ?? '';
  const pass = process.env.QBIT_PASS ?? '';
  const body = new URLSearchParams({ username: user, password: pass });
  const res = await fetch(`${base}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return false;
  // Bun/undici expose Set-Cookie via getSetCookie(); fall back to get() for
  // runtimes that join headers (this runs server-side, so Set-Cookie is visible).
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie().join('; ')
      : (res.headers.get('set-cookie') ?? '');
  const match = setCookie.match(/SID=([^;]+)/);
  sid = match?.[1] ?? null;
  // Auth-bypass setups return "Ok." with no cookie and need none.
  return sid !== null || (await res.text()) === 'Ok.';
}

async function qbitFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = baseUrl();
  if (!base) throw new Error('QBIT_URL not configured');

  const headers = new Headers(init?.headers);
  if (sid) headers.set('Cookie', `SID=${sid}`);

  let res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });

  if (res.status === 403) {
    const ok = await login();
    if (!ok) throw new Error('qBittorrent auth failed');
    headers.set('Cookie', `SID=${sid}`);
    res = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(15000),
    });
  }

  return res;
}

function normalizeTorrent(t: Record<string, unknown>): Torrent {
  return {
    name: String(t.name ?? ''),
    progress: Math.round(Number(t.progress ?? 0) * 1000) / 10,
    dlSpeed: Number(t.dlspeed ?? 0),
    upSpeed: Number(t.upspeed ?? 0),
    state: String(t.state ?? ''),
    hash: String(t.hash ?? ''),
    eta: t.eta != null ? Number(t.eta) : null,
    ratio: t.ratio != null ? Number(t.ratio) : null,
  };
}

export async function getQBittorrentTorrents(): Promise<DownloadsPayload | { error: string }> {
  if (!baseUrl()) return { error: 'QBIT_URL not configured' };

  try {
    // qbitFetch lazily logs in on a 403, so no proactive login is needed and a
    // still-valid SID is reused across polls instead of re-authenticating each tick.
    const res = await qbitFetch('/api/v2/torrents/info');
    if (!res.ok) return { error: `qBittorrent error: ${res.status}` };
    const raw = (await res.json()) as Record<string, unknown>[];
    const torrents = raw.map(normalizeTorrent);
    const aggregateDlSpeed = torrents.reduce((s, t) => s + t.dlSpeed, 0);
    const aggregateUpSpeed = torrents.reduce((s, t) => s + t.upSpeed, 0);
    return { torrents, aggregateDlSpeed, aggregateUpSpeed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'qBittorrent unreachable' };
  }
}

export async function qbittorrentAction(
  hash: string,
  action: 'pause' | 'resume',
): Promise<{ ok: true } | { error: string }> {
  if (!baseUrl()) return { error: 'QBIT_URL not configured' };

  const endpoints = action === 'pause' ? ['stop', 'pause'] : ['start', 'resume'];

  try {
    for (const ep of endpoints) {
      const res = await qbitFetch(`/api/v2/torrents/${ep}?hashes=${encodeURIComponent(hash)}`, {
        method: 'POST',
      });
      if (res.ok) return { ok: true };
    }
    return { error: `qBittorrent ${action} failed` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `qBittorrent ${action} failed` };
  }
}
