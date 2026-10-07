import type { RecentMediaItem } from '../types';

/** A mapped item plus its season identity, when it is an episode with a known season. */
export type RecentCandidate = RecentMediaItem & { season?: { key: string; label: string } };

/** How many raw items to fetch so grouping episodes still leaves enough tiles. */
export const RECENT_FETCH = 100;
export const RECENT_MAX = 20;

/**
 * Collapses episodes of the same season into one tile, kept at the position of its
 * newest episode (input is newest first). Single episodes keep their own subtitle.
 */
export function groupSeasons(candidates: RecentCandidate[]): RecentMediaItem[] {
  const groups = new Map<string, { item: RecentMediaItem; label: string; count: number }>();
  const out: { item: RecentMediaItem; key?: string }[] = [];
  for (const { season, ...item } of candidates) {
    const group = season && groups.get(season.key);
    if (group) {
      group.count++;
      continue;
    }
    if (season) groups.set(season.key, { item, label: season.label, count: 1 });
    out.push({ item, key: season?.key });
  }
  return out.slice(0, RECENT_MAX).map(({ item, key }) => {
    const group = key ? groups.get(key) : undefined;
    return group && group.count > 1
      ? { ...item, subtitle: `${group.label} · ${group.count} episodes` }
      : item;
  });
}
