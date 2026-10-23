import type { IntegrationRow } from '../db';
import { getJellyfinArt, type JellyfinConfig } from '../integrations/jellyfin';
import type { ArtRef } from './snapshot';

const OK_TTL_MS = 6 * 60 * 60_000;
// A missing backdrop is common (many items have none); retry rarely.
const MISS_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 64;

// ponytail: insertion-ordered Map as a tiny LRU; artwork for a panel is a handful of items.
const cache = new Map<string, { at: number; dataUri: string | null }>();

export const artKey = (ref: ArtRef) => `${ref.integrationId}:${ref.itemId}:${ref.kind}`;

function remember(key: string, dataUri: string | null): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), dataUri });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

const pending = new Map<string, Promise<string | null>>();

async function fetchArt(config: JellyfinConfig, ref: ArtRef): Promise<string | null> {
  const res = await getJellyfinArt(config, ref.itemId, ref.kind);
  const dataUri =
    'error' in res
      ? null
      : `data:${res.contentType};base64,${Buffer.from(res.bytes).toString('base64')}`;
  remember(artKey(ref), dataUri);
  return dataUri;
}

/**
 * Resolves artwork refs to data URIs Satori can embed, fetching what isn't
 * cached. Failures resolve to nothing, so the card falls back to a placeholder.
 */
export async function resolveArt(
  refs: ArtRef[],
  rows: Map<number, IntegrationRow>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    refs.map(async (ref) => {
      const key = artKey(ref);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < (hit.dataUri ? OK_TTL_MS : MISS_TTL_MS)) {
        if (hit.dataUri) out.set(key, hit.dataUri);
        return;
      }
      const row = rows.get(ref.integrationId);
      if (row?.type !== 'jellyfin') return;
      // Concurrent renders share one upstream fetch per image.
      let fetching = pending.get(key);
      if (!fetching) {
        fetching = fetchArt(row.config as JellyfinConfig, ref).finally(() => pending.delete(key));
        pending.set(key, fetching);
      }
      const dataUri = await fetching;
      if (dataUri) out.set(key, dataUri);
    }),
  );
  return out;
}
