import type { ArrItem, ArrPayload } from '../types';

type ArrKind = 'radarr' | 'sonarr';

function env(kind: ArrKind, name: 'URL' | 'API_KEY'): string | null {
  return process.env[`${kind.toUpperCase()}_${name}`]?.trim() || null;
}

async function arrFetch(kind: ArrKind, path: string): Promise<Response> {
  const base = env(kind, 'URL')?.replace(/\/$/, '');
  const key = env(kind, 'API_KEY');
  if (!base) throw new Error(`${kind.toUpperCase()}_URL not configured`);
  if (!key) throw new Error(`${kind.toUpperCase()}_API_KEY not configured`);
  return fetch(`${base}${path}`, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
}

function imageUrl(kind: ArrKind, item: Record<string, unknown>): string | undefined {
  const image = ((item.images as Record<string, unknown>[] | undefined) ?? []).find(
    (img) => img.coverType === 'poster' && typeof img.remoteUrl === 'string',
  );
  return image?.remoteUrl as string | undefined;
}

function mapCalendar(kind: ArrKind, item: Record<string, unknown>): ArrItem {
  const series = item.series as Record<string, unknown> | undefined;
  const movie = kind === 'radarr' ? item : undefined;
  const title =
    kind === 'radarr'
      ? String(movie?.title ?? 'Unknown movie')
      : `${String(series?.title ?? 'Unknown series')} ${item.seasonNumber != null ? `S${String(item.seasonNumber).padStart(2, '0')}` : ''}${item.episodeNumber != null ? `E${String(item.episodeNumber).padStart(2, '0')}` : ''}`.trim();
  return {
    id: String(item.id ?? `${kind}:${title}`),
    title,
    date: String(item.inCinemas ?? item.airDateUtc ?? item.airDate ?? '') || null,
    status: String(item.status ?? item.monitored ?? ''),
    posterUrl: imageUrl(kind, kind === 'radarr' ? item : (series ?? {})),
  };
}

async function getJson<T>(kind: ArrKind, path: string): Promise<T> {
  const res = await arrFetch(kind, path);
  if (!res.ok) throw new Error(`${kind} error: ${res.status}`);
  return (await res.json()) as T;
}

export async function getArrSummary(kind: ArrKind): Promise<ArrPayload | { error: string }> {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 86_400_000);
    const params = new URLSearchParams({
      start: now.toISOString(),
      end: end.toISOString(),
      unmonitored: 'false',
    });

    const [status, queue, wanted, calendar] = await Promise.all([
      getJson<{ version?: string }>(kind, '/api/v3/system/status'),
      getJson<{ totalRecords?: number; records?: unknown[] }>(kind, '/api/v3/queue?page=1&pageSize=1'),
      getJson<{ totalRecords?: number }>(kind, '/api/v3/wanted/missing?page=1&pageSize=1').catch(() => null),
      getJson<Record<string, unknown>[]>(kind, `/api/v3/calendar?${params}`),
    ]);

    return {
      version: status.version ?? null,
      queue: Number(queue.totalRecords ?? queue.records?.length ?? 0),
      missing: wanted ? Number(wanted.totalRecords ?? 0) : null,
      upcoming: calendar.map((item) => mapCalendar(kind, item)).slice(0, 5),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `${kind} unreachable` };
  }
}
