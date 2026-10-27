import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { C411Payload } from '../types';
import { TIMEOUT_MS } from './http';

export type C411Config = { apiToken?: string };

type Result = C411Payload | { error: string };
type PollState = { nextRequestAt: number; result?: Result; pending?: Promise<Result> };
const polls = new Map<string, PollState>();
const MIN_INTERVAL_MS = 30_000;

// Shared by all integration rows using the same key, including manual refreshes.
export async function getC411Profile(config: C411Config): Promise<Result> {
  const token = config.apiToken?.trim();
  if (!token) return { error: 'C411 API token not configured' };
  const key = createHash('sha256').update(token).digest('hex');
  let state = polls.get(key);
  if (state?.pending) return state.pending;
  if (state?.result && Date.now() < state.nextRequestAt) return state.result;
  if (!state) {
    state = { nextRequestAt: 0 };
    polls.set(key, state);
  }
  const current = state;
  current.pending = fetchProfile(token, current).then((result) => {
    current.result = result;
    current.nextRequestAt = Math.max(current.nextRequestAt, Date.now() + MIN_INTERVAL_MS);
    current.pending = undefined;
    return result;
  });
  return current.pending;
}

// Test isolation, matching the shared cache helper's reset convention.
export function _clearC411Cache(): void {
  polls.clear();
}

const amount = z.number().finite().nonnegative();
const PathSchema = z.object({ star: z.boolean(), questsCompleted: amount, questsTotal: amount });
const VolumeSchema = z.object({ actual: amount, credit: amount, total: amount });
const ProfileSchema = z.object({
  username: z.string().min(1),
  avatarUrl: z.string().nullable(),
  level: z.object({ level: amount, xpIntoLevel: amount, xpToNextLevel: amount }),
  zen: z.object({ balance: amount }),
  class: z
    .object({
      slug: z.string(),
      effectiveSlug: z.string(),
      foundation: z.string(),
      treeBonusBp: amount,
      progress: z.object({
        questsCompleted: amount,
        questsTotal: amount,
        stars: z.number().int().min(0).max(4),
        grade: z
          .object({
            tier: z.enum(['bronze', 'argent', 'or']),
            level: z.number().int().min(1).max(4),
          })
          .nullable(),
      }),
      voies: z.object({
        seed: PathSchema,
        upload: PathSchema,
        specialization: PathSchema,
        competitivity: PathSchema,
      }),
    })
    .nullable(),
  team: z
    .object({ name: z.string(), slug: z.string(), tag: z.string(), role: z.string() })
    .nullable(),
  transfer: z.object({
    uploaded: VolumeSchema,
    downloaded: VolumeSchema,
  }),
  download: z.object({ allowed: z.boolean(), blockedReason: z.string().nullable() }),
  freeleech: z.object({
    active: z.boolean(),
    sources: z.array(z.enum(['personal', 'campaign', 'window'])),
  }),
});

function avatarUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://c411.org');
    if (url.origin !== 'https://c411.org' || url.username || url.password) return null;
    if (!/^\/(?:uploads\/)?avatars\//.test(url.pathname)) return null;
    // Never carry upstream credentials or tracking parameters into browser data.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export async function getC411Avatar(config: C411Config): Promise<Response | { error: string }> {
  const profile = await getC411Profile(config);
  if ('error' in profile) return profile;
  if (!profile.avatarUrl) return { error: 'C411 avatar unavailable' };
  try {
    const res = await fetch(profile.avatarUrl, {
      headers: { Authorization: `Bearer ${config.apiToken?.trim()}`, 'User-Agent': 'Labby' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: 'C411 avatar unavailable' };
    const mime = res.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (
      !mime ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime)
    ) {
      return { error: 'C411 avatar is not a supported image' };
    }
    return new Response(res.body, { headers: { 'Content-Type': mime } });
  } catch {
    return { error: 'C411 avatar unavailable' };
  }
}

async function fetchProfile(token: string, state: PollState): Promise<Result> {
  try {
    // /api/auth/me checks browser sessions; API keys use this profile:read endpoint.
    const res = await fetch('https://c411.org/api/user/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'Labby',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) return { error: 'C411 API token is invalid or expired' };
    if (res.status === 403)
      return { error: 'C411 access denied. Create a token with profile:read scope' };
    if (res.status === 429) {
      // The profile quota also consumes the key's shared Torznab allowance.
      // Honour Retry-After if supplied, but never retry before a full minute.
      const retryAfter = res.headers.get('Retry-After');
      let delayMs = 60_000;
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const requested = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(requested)) delayMs = Math.max(delayMs, requested);
      }
      state.nextRequestAt = Date.now() + delayMs;
      return { error: 'C411 rate limit reached. Try again in a minute' };
    }
    if (!res.ok) return { error: `C411 error: ${res.status}` };

    const parsed = ProfileSchema.safeParse(await res.json());
    if (!parsed.success) return { error: 'C411 returned an invalid profile response' };
    const user = parsed.data;
    const uploaded = user.transfer.uploaded.total;
    const downloaded = user.transfer.downloaded.total;
    // Explicit allowlist: never publish the upstream account object or credentials.
    return {
      username: user.username,
      avatarUrl: avatarUrl(user.avatarUrl),
      level: user.level.level,
      xpIntoLevel: user.level.xpIntoLevel,
      xpToNextLevel: user.level.xpToNextLevel,
      updatedAt: Date.now(),
      zen: user.zen.balance,
      uploaded,
      downloaded,
      ratio: downloaded > 0 ? uploaded / downloaded : null,
      downloadAllowed: user.download.allowed,
      freeleech: user.freeleech.active,
      class: user.class,
      team: user.team,
      transfer: user.transfer,
      blockedReason: user.download.blockedReason,
      freeleechSources: user.freeleech.sources,
    };
  } catch {
    // Upstream bodies and exception messages can contain credentials.
    return { error: 'C411 request failed. Check the connection and try again' };
  }
}
