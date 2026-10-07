import type {
  JellyfinPayload,
  JellyfinSession,
  RecentMediaItem,
  RecentMediaPayload,
} from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type JellyfinConfig = { url?: string; apiKey?: string };

// Jellyfin 12 disabled the legacy bare `X-Emby-Token` header by default; auth
// now goes through the standard Authorization header with the MediaBrowser
// scheme (https://jellyfin.org/posts/jellyfin-release-12.0/).
function authHeader(key: string): string {
  return `MediaBrowser Token="${key}", Client="labby", Device="labby", DeviceId="labby-server", Version="1.0"`;
}

export async function getJellyfinSessions(
  config: JellyfinConfig,
): Promise<JellyfinPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'JELLYFIN_URL not configured' };
  if (!key) return { error: 'JELLYFIN_API_KEY not configured' };

  return soft('Jellyfin', async () => {
    const res = await fetch(`${base}/Sessions`, {
      headers: {
        Authorization: authHeader(key),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Jellyfin error: ${res.status}` };

    const raw = (await res.json()) as Record<string, unknown>[];
    const sessions: JellyfinSession[] = [];

    for (const s of raw) {
      const nowPlaying = s.NowPlayingItem as Record<string, unknown> | undefined;
      if (!nowPlaying) continue;

      const playState = (s.PlayState ?? {}) as Record<string, unknown>;
      const position = Number(playState.PositionTicks ?? 0);
      const duration = Number(nowPlaying.RunTimeTicks ?? 0);
      const progress = duration > 0 ? Math.round((position / duration) * 100) : 0;

      const transcode = Boolean(s.TranscodingInfo);
      const videoStream = ((nowPlaying.MediaStreams as Record<string, unknown>[]) ?? []).find(
        (m) => m.Type === 'Video',
      );
      const height = videoStream?.Height;
      const quality = height ? `${height}p` : 'unknown';

      const year = nowPlaying.ProductionYear ? String(nowPlaying.ProductionYear) : '';
      const series = nowPlaying.SeriesName ? String(nowPlaying.SeriesName) : '';
      const episode =
        nowPlaying.IndexNumber != null && nowPlaying.ParentIndexNumber != null
          ? `S${String(nowPlaying.ParentIndexNumber).padStart(2, '0')}E${String(nowPlaying.IndexNumber).padStart(2, '0')}`
          : '';
      const title = series
        ? `${series} — ${episode || String(nowPlaying.Name ?? 'Unknown')}`
        : String(nowPlaying.Name ?? 'Unknown');

      sessions.push({
        id: String(s.Id ?? crypto.randomUUID()),
        title,
        subtitle: [year, quality, transcode ? 'transcode' : 'direct play']
          .filter(Boolean)
          .join(' · '),
        user: String((s.UserName as string) ?? 'unknown'),
        device: String((s.Client as string) ?? (s.DeviceName as string) ?? 'unknown'),
        progress,
        // Route through the backend proxy so the API key never reaches the browser.
        posterUrl: nowPlaying.Id
          ? `/api/jellyfin/image/${encodeURIComponent(String(nowPlaying.Id))}`
          : undefined,
        isTranscoding: transcode,
      });
    }

    return { sessions, playing: sessions.length };
  });
}

export async function getJellyfinRecent(
  config: JellyfinConfig,
): Promise<RecentMediaPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'JELLYFIN_URL not configured' };
  if (!key) return { error: 'JELLYFIN_API_KEY not configured' };

  return soft('Jellyfin', async () => {
    const params = new URLSearchParams({
      recursive: 'true',
      includeItemTypes: 'Movie,Episode',
      sortBy: 'DateCreated',
      sortOrder: 'Descending',
      limit: '20',
      fields: 'DateCreated',
    });
    const res = await fetch(`${base}/Items?${params}`, {
      headers: { Authorization: authHeader(key), Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Jellyfin error: ${res.status}` };

    const body = (await res.json()) as { Items?: Record<string, unknown>[] };
    const items: RecentMediaItem[] = (body.Items ?? []).flatMap((item) => {
      const id = typeof item.Id === 'string' ? item.Id : '';
      const kind = item.Type === 'Movie' ? 'movie' : item.Type === 'Episode' ? 'tv' : null;
      if (!id || !kind) return [];
      const episode =
        item.ParentIndexNumber != null && item.IndexNumber != null
          ? `S${String(item.ParentIndexNumber).padStart(2, '0')}E${String(item.IndexNumber).padStart(2, '0')}`
          : '';
      const name = String(item.Name ?? 'Unknown');
      const added = Date.parse(String(item.DateCreated ?? ''));
      // Episodes use the series poster when the series has one, else their own still.
      const posterId =
        kind === 'tv' && typeof item.SeriesId === 'string' && item.SeriesPrimaryImageTag
          ? item.SeriesId
          : (item.ImageTags as Record<string, unknown> | undefined)?.Primary
            ? id
            : null;
      return [
        {
          id,
          kind,
          title: kind === 'tv' ? String(item.SeriesName ?? name) : name,
          subtitle:
            kind === 'tv'
              ? [episode, name].filter(Boolean).join(' · ')
              : item.ProductionYear
                ? String(item.ProductionYear)
                : '',
          addedAt: Number.isNaN(added) ? '' : new Date(added).toISOString(),
          posterUrl: posterId ? `/api/jellyfin/image/${encodeURIComponent(posterId)}` : undefined,
        },
      ];
    });
    return { items };
  });
}

/**
 * Fetches a Jellyfin item's primary image server-side (with the API key) so the
 * browser can render it without ever seeing the token. Returns the upstream
 * Response for the route to stream back.
 */
export async function getJellyfinImage(
  config: JellyfinConfig,
  itemId: string,
): Promise<Response | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'JELLYFIN_URL not configured' };
  if (!key) return { error: 'JELLYFIN_API_KEY not configured' };

  try {
    const res = await fetch(
      `${base}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=240`,
      {
        headers: { Authorization: authHeader(key) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return { error: `Jellyfin image error: ${res.status}` };
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Jellyfin image failed' };
  }
}
