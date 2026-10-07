import type { PlexPayload, PlexSession, RecentMediaItem, RecentMediaPayload } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type PlexConfig = { url?: string; token?: string };

export async function getPlexSessions(
  config: PlexConfig,
): Promise<PlexPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const token = config.token ?? null;
  if (!base) return { error: 'PLEX_URL not configured' };
  if (!token) return { error: 'PLEX_TOKEN not configured' };

  return soft('Plex', async () => {
    const res = await fetch(`${base}/status/sessions`, {
      headers: { 'X-Plex-Token': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Plex error: ${res.status}` };

    const body = (await res.json()) as Record<string, unknown>;
    const container = (body.MediaContainer ?? {}) as Record<string, unknown>;
    const raw = (container.Metadata as Record<string, unknown>[]) ?? [];
    const sessions: PlexSession[] = [];

    for (const m of raw) {
      const viewOffset = Number(m.viewOffset ?? 0);
      const duration = Number(m.duration ?? 0);
      const progress = duration > 0 ? Math.round((viewOffset / duration) * 100) : 0;

      const transcode = m.TranscodeSession != null;
      const media = ((m.Media as Record<string, unknown>[]) ?? [])[0];
      const resolution = media?.videoResolution ? String(media.videoResolution) : '';
      const quality = resolution
        ? /^\d+$/.test(resolution)
          ? `${resolution}p`
          : resolution
        : 'unknown';

      const year = m.year ? String(m.year) : '';
      const series = m.grandparentTitle ? String(m.grandparentTitle) : '';
      const episode =
        m.index != null && m.parentIndex != null
          ? `S${String(m.parentIndex).padStart(2, '0')}E${String(m.index).padStart(2, '0')}`
          : '';
      const title = series
        ? `${series} — ${episode || String(m.title ?? 'Unknown')}`
        : String(m.title ?? 'Unknown');

      const user = (m.User as Record<string, unknown>) ?? {};
      const player = (m.Player as Record<string, unknown>) ?? {};
      const thumb =
        typeof m.thumb === 'string'
          ? m.thumb
          : typeof m.grandparentThumb === 'string'
            ? m.grandparentThumb
            : undefined;

      sessions.push({
        id: String(m.sessionKey ?? m.ratingKey ?? crypto.randomUUID()),
        title,
        subtitle: [year, quality, transcode ? 'transcode' : 'direct play']
          .filter(Boolean)
          .join(' · '),
        user: String(user.title ?? 'unknown'),
        device: String(player.title ?? player.product ?? 'unknown'),
        progress,
        // Proxied path; the widget rewrites it to the per-integration route so the token stays server-side.
        posterUrl: thumb ? `/api/plex/image?path=${encodeURIComponent(String(thumb))}` : undefined,
        isTranscoding: transcode,
      });
    }

    return { sessions, playing: sessions.length };
  });
}

export async function getPlexRecent(
  config: PlexConfig,
): Promise<RecentMediaPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const token = config.token ?? null;
  if (!base) return { error: 'PLEX_URL not configured' };
  if (!token) return { error: 'PLEX_TOKEN not configured' };

  return soft('Plex', async () => {
    const params = new URLSearchParams({ type: '1,4', sort: 'addedAt:desc' });
    const res = await fetch(`${base}/library/all?${params}`, {
      headers: {
        'X-Plex-Token': token,
        'X-Plex-Container-Start': '0',
        'X-Plex-Container-Size': '20',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Plex error: ${res.status}` };

    const body = (await res.json()) as {
      MediaContainer?: { Metadata?: Record<string, unknown>[] };
    };
    const items: RecentMediaItem[] = (body.MediaContainer?.Metadata ?? []).flatMap((item) => {
      const id = item.ratingKey != null ? String(item.ratingKey) : '';
      const kind = item.type === 'movie' ? 'movie' : item.type === 'episode' ? 'tv' : null;
      if (!id || !kind) return [];
      const episode =
        item.parentIndex != null && item.index != null
          ? `S${String(item.parentIndex).padStart(2, '0')}E${String(item.index).padStart(2, '0')}`
          : '';
      const name = String(item.title ?? 'Unknown');
      const thumb = kind === 'tv' ? (item.grandparentThumb ?? item.thumb) : item.thumb;
      const addedAt = Number(item.addedAt);
      return [
        {
          id,
          kind,
          title: kind === 'tv' ? String(item.grandparentTitle ?? name) : name,
          subtitle:
            kind === 'tv'
              ? [episode, name].filter(Boolean).join(' · ')
              : item.year
                ? String(item.year)
                : '',
          addedAt:
            Number.isFinite(addedAt) && addedAt > 0 ? new Date(addedAt * 1000).toISOString() : '',
          posterUrl:
            typeof thumb === 'string' && thumb.startsWith('/') && !thumb.startsWith('//')
              ? `/api/plex/image?path=${encodeURIComponent(thumb)}`
              : undefined,
        },
      ];
    });
    return { items };
  });
}

/**
 * Fetches a Plex poster server-side (with the token). `thumbPath` comes from the
 * session payload and is echoed back by the browser, so it MUST be validated as a
 * server-relative path before use — otherwise it is an SSRF vector.
 */
export async function getPlexImage(
  config: PlexConfig,
  thumbPath: string,
): Promise<Response | { error: string }> {
  const base = normalizeBase(config.url);
  const token = config.token ?? null;
  if (!base) return { error: 'PLEX_URL not configured' };
  if (!token) return { error: 'PLEX_TOKEN not configured' };
  // Reject absolute URLs and protocol-relative paths; only same-host relative paths allowed.
  if (!thumbPath.startsWith('/') || thumbPath.startsWith('//')) {
    return { error: 'Invalid image path' };
  }

  try {
    const res = await fetch(`${base}${thumbPath}`, {
      headers: { 'X-Plex-Token': token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Plex image error: ${res.status}` };
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Plex image failed' };
  }
}
