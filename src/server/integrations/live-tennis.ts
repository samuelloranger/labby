import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ApiError, TennisPayload } from '../types';
import { TIMEOUT_MS } from './http';

export type TennisConfig = { apiKey?: string };

// 86,400 / 900 = 96 requests/day, within the free key's 100/day allowance.
// Enforced here, including errors, so shorter row intervals and REST refreshes
// cannot bypass it. All rows using the same key share one request and snapshot.
export const TENNIS_REFRESH_SECONDS = 900;
const INTERVAL_MS = TENNIS_REFRESH_SECONDS * 1000;
const ENDPOINT = 'https://api.livetennisapi.com/api/public/v1/matches?status=live&limit=200';

const Games = z
  .array(z.array(z.number().int().nonnegative()))
  .refine((v) => v.length === 0 || (v.length === 2 && v[0].length === v[1].length));
const Score = z.object({
  games: Games.nullish(),
  points: z.array(z.string().nullable()).max(2).nullish(),
  server: z.union([z.literal(1), z.literal(2)]).nullish(),
  is_tiebreak: z.boolean().optional(),
  stale: z.boolean().optional(),
});
const Player = z.object({ name: z.string() });
const ResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().int(),
      tournament: z.string(),
      status: z.string(),
      event_status: z.string().nullish(),
      players: z.object({ p1: Player, p2: Player }),
      score: Score.nullish(),
    }),
  ),
  meta: z.object({ has_more: z.boolean() }),
});

type Result = TennisPayload | ApiError;
type Entry = { nextRequestAt: number; result: Promise<Result> };
const snapshots = new Map<string, Entry>();

async function request(key: string, entry: Entry): Promise<Result> {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { 'X-API-Key': key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    });
    if (!res.ok) {
      if (res.status === 429) {
        const retry = res.headers.get('Retry-After');
        const delay = retry === null ? Number.NaN : Number(retry);
        const until = Number.isFinite(delay)
          ? Date.now() + Math.max(0, delay) * 1000
          : Date.parse(retry ?? '');
        if (Number.isFinite(until)) entry.nextRequestAt = Math.max(entry.nextRequestAt, until);
        return { error: 'Tennis request limit reached; automatic retries are delayed.' };
      }
      if (res.status === 401 || res.status === 403) {
        return { error: 'Tennis API key rejected. Check the configured free key.' };
      }
      return { error: `Tennis service returned HTTP ${res.status}.` };
    }

    const parsed = ResponseSchema.safeParse(await res.json());
    if (!parsed.success) return { error: 'Tennis service returned an invalid response.' };
    return {
      fetchedAt: new Date(Date.now()).toISOString(),
      hasMore: parsed.data.meta.has_more,
      matches: parsed.data.data
        .filter((m) => m.status === 'live')
        .map((m) => {
          const score = m.score;
          return {
            id: m.id,
            tournament: m.tournament,
            players: [m.players.p1.name, m.players.p2.name],
            // The outer games array indexes players, not sets.
            games: score?.games?.length === 2 ? [score.games[0], score.games[1]] : null,
            points: [score?.points?.[0] ?? null, score?.points?.[1] ?? null],
            server: score?.server ?? null,
            tiebreak: score?.is_tiebreak ?? false,
            stale: score?.stale ?? false,
            eventStatus: m.event_status ?? null,
          };
        }),
    };
  } catch {
    // Never echo upstream bodies or exception text: they may contain credentials.
    return { error: 'Tennis service unavailable; the next attempt is delayed.' };
  }
}

export async function getLiveTennis(config: TennisConfig): Promise<Result> {
  const key = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!key) return { error: 'Tennis API key not configured.' };

  const cacheKey = createHash('sha256').update(key).digest('hex');
  const previous = snapshots.get(cacheKey);
  if (previous && Date.now() < previous.nextRequestAt) return previous.result;

  const entry: Entry = {
    nextRequestAt: Date.now() + INTERVAL_MS,
    result: Promise.resolve({ error: 'Tennis request pending.' }),
  };
  snapshots.set(cacheKey, entry);
  entry.result = request(key, entry);
  return entry.result;
}

// Test-only: each test starts without an earlier credential's cached response.
export function _clearTennisCache(): void {
  snapshots.clear();
}
