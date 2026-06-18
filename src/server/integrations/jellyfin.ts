import type { JellyfinPayload, JellyfinSession } from '../types';

export type JellyfinConfig = { url?: string; apiKey?: string };

export async function getJellyfinSessions(
  config: JellyfinConfig,
): Promise<JellyfinPayload | { error: string }> {
  const base = config.url?.replace(/\/$/, '') || null;
  const key = config.apiKey ?? null;
  if (!base) return { error: 'JELLYFIN_URL not configured' };
  if (!key) return { error: 'JELLYFIN_API_KEY not configured' };

  try {
    const res = await fetch(`${base}/Sessions`, {
      headers: {
        'X-Emby-Token': key,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
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
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Jellyfin unreachable' };
  }
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
  const base = config.url?.replace(/\/$/, '') || null;
  const key = config.apiKey ?? null;
  if (!base) return { error: 'JELLYFIN_URL not configured' };
  if (!key) return { error: 'JELLYFIN_API_KEY not configured' };

  try {
    const res = await fetch(
      `${base}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=120`,
      {
        headers: { 'X-Emby-Token': key },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return { error: `Jellyfin image error: ${res.status}` };
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Jellyfin image failed' };
  }
}
