import type { DownloadsPayload, Torrent } from '../types';

export type TransmissionConfig = { url?: string; user?: string; pass?: string };

let sessionId: string | null = null;

async function transmissionRpc(
  config: TransmissionConfig,
  method: string,
  arguments_: Record<string, unknown> = {},
): Promise<unknown> {
  const url = config.url ?? null;
  if (!url) throw new Error('TRANSMISSION_URL not configured');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['X-Transmission-Session-Id'] = sessionId;

  const user = config.user;
  const pass = config.pass;
  if (user && pass) {
    headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  }

  const body = JSON.stringify({ method, arguments: arguments_ });

  let res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 409) {
    sessionId = res.headers.get('X-Transmission-Session-Id');
    if (!sessionId) throw new Error('Transmission session handshake failed');
    headers['X-Transmission-Session-Id'] = sessionId;
    res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });
  }

  if (!res.ok) throw new Error(`Transmission RPC error: ${res.status}`);
  const json = await res.json();
  if (json.result !== 'success') {
    throw new Error(json.result ?? 'Transmission RPC failed');
  }
  return json;
}

const STATUS_MAP: Record<number, string> = {
  0: 'stopped',
  1: 'check',
  2: 'check',
  3: 'queued',
  4: 'downloading',
  5: 'seeding',
  6: 'seeding',
};

function normalizeTorrent(t: Record<string, unknown>): Torrent {
  const status = Number(t.status ?? 0);
  const percent = Number(t.percentDone ?? 0) * 100;
  return {
    name: String(t.name ?? ''),
    progress: Math.round(percent * 10) / 10,
    dlSpeed: Number(t.rateDownload ?? 0),
    upSpeed: Number(t.rateUpload ?? 0),
    state: STATUS_MAP[status] ?? 'unknown',
    hash: String(t.hashString ?? t.id ?? ''),
    eta: t.eta != null ? Number(t.eta) : null,
    ratio: t.uploadRatio != null ? Number(t.uploadRatio) : null,
  };
}

export async function getTransmissionTorrents(config: TransmissionConfig): Promise<DownloadsPayload | { error: string }> {
  if (!config.url) return { error: 'TRANSMISSION_URL not configured' };

  try {
    const json = (await transmissionRpc(config, 'torrent-get', {
      fields: [
        'id',
        'name',
        'status',
        'percentDone',
        'rateDownload',
        'rateUpload',
        'eta',
        'uploadRatio',
        'hashString',
      ],
    })) as { arguments?: { torrents?: Record<string, unknown>[] } };
    const raw = json.arguments?.torrents ?? [];
    const torrents = raw.map(normalizeTorrent);
    const aggregateDlSpeed = torrents.reduce((s, t) => s + t.dlSpeed, 0);
    const aggregateUpSpeed = torrents.reduce((s, t) => s + t.upSpeed, 0);
    return { torrents, aggregateDlSpeed, aggregateUpSpeed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Transmission unreachable' };
  }
}

export async function transmissionAction(
  config: TransmissionConfig,
  hash: string,
  action: 'pause' | 'resume',
): Promise<{ ok: true } | { error: string }> {
  if (!config.url) return { error: 'TRANSMISSION_URL not configured' };

  const method = action === 'pause' ? 'torrent-stop' : 'torrent-start';
  try {
    await transmissionRpc(config, method, { ids: [hash] });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `Transmission ${action} failed` };
  }
}
