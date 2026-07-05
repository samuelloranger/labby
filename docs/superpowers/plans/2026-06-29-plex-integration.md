# Plex Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Plex now-playing integration and consolidate the Jellyfin/Emby/Plex cards into one shared `MediaSessions.svelte` widget.

**Architecture:** Plex is a fail-soft server client (`Payload | {error}`, never throws) returning the same `sessions[]`+`playing` shape as Jellyfin/Emby, registered in `registry.ts` with a path-based server-side poster proxy (token never reaches the browser, SSRF-guarded). The three media widgets collapse into one `MediaSessions.svelte` parameterized by `type` — which derives the icon and a generic poster-URL rewrite (`/api/<type>/image` → `/api/integrations/<id>/<type>-image`). Stacked on `feat/emby-sabnzbd-integrations`.

**Tech Stack:** Bun + Hono (server), Svelte 5 runes (web), `bun:test` with mocked `fetch`.

## Global Constraints

- TypeScript strict everywhere; validate external responses defensively (no blind casts of upstream JSON; numbers parsed defensively).
- Integrations never throw to the route: missing config → `{error:'... not configured'}`; failures wrapped via `soft()`.
- Credentials stay server-side; `token` field marked `secret:true`; the Plex token never reaches the browser — posters go through a server proxy.
- Plex poster proxy MUST validate the path (starts with `/`, not `//`, not an absolute URL) before fetching — SSRF guard.
- Plex returns JSON when sent `Accept: application/json`; auth header is `X-Plex-Token`. viewOffset/duration are in **milliseconds**.
- Server types in `src/server/types.ts` are duplicated by design in `src/web/src/lib/stores.ts` — keep in sync.
- Every widget implements loading / error / empty / ready states and respects reduced-motion (reuse existing global classes).
- `di:` icon slugs used must be added to `SLUGS` in `scripts/vendor-icons.ts`.
- Run `bun test` from repo root; web build via `bun run build`. KNOWN pre-existing tsc errors exist in some unrelated server test mocks (favicon.test/qbittorrent.test/reelward.test) — not in scope.

---

### Task 1: Plex server client + types + route

**Files:**
- Create: `src/server/integrations/plex.ts`
- Create: `src/server/integrations/plex.test.ts`
- Modify: `src/server/types.ts` (add `PlexSession`, `PlexPayload`, extend `ChannelPayload`)
- Modify: `src/server/integrations/registry.ts` (import + `plex` entry + union member)
- Modify: `src/server/integrations/registry.test.ts` (type count 18 → 19, add `plex` assertions)
- Modify: `src/server/app.integrations.test.ts` (type count 18 → 19)
- Modify: `src/server/app.ts` (import + `plex-image` route)

**Interfaces:**
- Produces:
  - `PlexConfig = { url?: string; token?: string }`
  - `getPlexSessions(config: PlexConfig): Promise<PlexPayload | { error: string }>`
  - `getPlexImage(config: PlexConfig, thumbPath: string): Promise<Response | { error: string }>`
  - `PlexSession = { id, title, subtitle, user, device, progress, posterUrl?, isTranscoding }`, `PlexPayload = { sessions: PlexSession[]; playing: number }` (in `types.ts`)
- Consumes: `normalizeBase`, `soft`, `TIMEOUT_MS` from `./http`.

- [ ] **Step 1: Write the failing test** — `src/server/integrations/plex.test.ts`

```ts
import { describe, expect, mock, test } from 'bun:test';
import type { PlexConfig } from './plex';
import { getPlexImage, getPlexSessions } from './plex';

describe('Plex client', () => {
  test('reports missing config', async () => {
    expect(await getPlexSessions({})).toEqual({ error: 'PLEX_URL not configured' });
    expect(await getPlexSessions({ url: 'http://plex.test' })).toEqual({
      error: 'PLEX_TOKEN not configured',
    });
    expect(await getPlexImage({}, '/library/x')).toEqual({ error: 'PLEX_URL not configured' });
  });

  test('maps active sessions', async () => {
    const config: PlexConfig = { url: 'http://plex.test:32400/', token: 'plex-tok' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/status/sessions')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Plex-Token']).toBe('plex-tok');
        expect(headers['Accept']).toBe('application/json');
        return Response.json({
          MediaContainer: {
            size: 2,
            Metadata: [
              {
                type: 'episode',
                title: 'Pilot',
                grandparentTitle: 'The Show',
                parentIndex: 1,
                index: 3,
                year: 2024,
                viewOffset: 600000,
                duration: 1200000,
                thumb: '/library/metadata/668/thumb/1386095832',
                grandparentThumb: '/library/metadata/100/thumb/1',
                User: { title: 'alice' },
                Player: { title: 'Living Room', product: 'Plex for Apple TV' },
                TranscodeSession: { videoDecision: 'transcode' },
                Media: [{ videoResolution: '1080' }],
              },
              {
                type: 'movie',
                title: 'Some Movie',
                year: 2020,
                viewOffset: 0,
                duration: 0,
                User: { title: 'bob' },
                Player: { product: 'Plex Web' },
              },
            ],
          },
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;

    expect('sessions' in result).toBe(true);
    if ('sessions' in result) {
      expect(result.playing).toBe(2);
      expect(result.sessions[0].title).toBe('The Show — S01E03');
      expect(result.sessions[0].user).toBe('alice');
      expect(result.sessions[0].device).toBe('Living Room');
      expect(result.sessions[0].progress).toBe(50);
      expect(result.sessions[0].isTranscoding).toBe(true);
      expect(result.sessions[0].posterUrl).toContain(
        encodeURIComponent('/library/metadata/668/thumb/1386095832'),
      );
      expect(result.sessions[1].title).toBe('Some Movie');
      expect(result.sessions[1].device).toBe('Plex Web');
      expect(result.sessions[1].progress).toBe(0);
      expect(result.sessions[1].isTranscoding).toBe(false);
    }
  });

  test('returns empty when nothing playing', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      Response.json({ MediaContainer: { size: 0 } }),
    ) as unknown as typeof fetch;
    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ sessions: [], playing: 0 });
  });

  test('returns error on non-ok response', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 401 }),
    ) as unknown as typeof fetch;
    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'Plex error: 401' });
  });

  test('returns error when fetch throws', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await getPlexSessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'down' });
  });

  test('image proxy rejects non-relative paths (SSRF guard)', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 't' };
    expect(await getPlexImage(config, 'http://evil.com/x')).toEqual({ error: 'Invalid image path' });
    expect(await getPlexImage(config, '//evil.com/x')).toEqual({ error: 'Invalid image path' });
    expect(await getPlexImage(config, 'library/x')).toEqual({ error: 'Invalid image path' });
  });

  test('image proxy fetches a relative path with token', async () => {
    const config: PlexConfig = { url: 'http://plex.test', token: 'plex-tok' };
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    let calledUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Plex-Token']).toBe('plex-tok');
      return new Response(imageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const result = await getPlexImage(config, '/library/metadata/668/thumb/1');
    globalThis.fetch = originalFetch;
    expect(result instanceof Response).toBe(true);
    expect(calledUrl).toContain('/library/metadata/668/thumb/1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/integrations/plex.test.ts`
Expected: FAIL — cannot resolve `./plex`.

- [ ] **Step 3: Add Plex types to `src/server/types.ts`**

Add near the `EmbySession`/`EmbyPayload` block:

```ts
export type PlexSession = {
  id: string;
  title: string;
  subtitle: string;
  user: string;
  device: string;
  progress: number;
  posterUrl?: string;
  isTranscoding: boolean;
};

export type PlexPayload = {
  sessions: PlexSession[];
  playing: number;
};
```

Add `PlexPayload` to the `ChannelPayload` union (alongside `EmbyPayload`):

```ts
  | EmbyPayload
  | PlexPayload
```

- [ ] **Step 4: Create `src/server/integrations/plex.ts`**

```ts
import type { PlexPayload, PlexSession } from '../types';
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
      const quality = resolution ? (/^\d+$/.test(resolution) ? `${resolution}p` : resolution) : 'unknown';

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
      const thumb = (m.thumb ?? m.grandparentThumb) as string | undefined;

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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/server/integrations/plex.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Register `plex` in `src/server/integrations/registry.ts`**

Add import near the other integration imports:

```ts
import { getPlexSessions, type PlexConfig } from './plex';
```

Add `'plex'` to the `IntegrationType` union (after `'emby'`):

```ts
  | 'emby'
  | 'plex'
```

Add the entry to `INTEGRATIONS` (after the `emby` entry):

```ts
  plex: {
    label: 'Plex',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'token', label: 'Token', secret: true },
    ],
    fetch: (c) => getPlexSessions(c as PlexConfig),
  },
```

- [ ] **Step 7: Bump the type-count assertions**

In `src/server/integrations/registry.test.ts`: find the assertion expecting `18` integration types and change it to `19`; add `'plex'` to any `ALL_TYPES`-style list the file maintains (mirror how `emby` was added).

In `src/server/app.integrations.test.ts:17`: change `expect(body.length).toBe(18);` to `19`.

- [ ] **Step 8: Add the Plex image route in `src/server/app.ts`**

Add to the integration imports:

```ts
import { getPlexImage, type PlexConfig } from './integrations/plex';
```

Add the route immediately after the existing `emby-image` route:

```ts
app.get('/api/integrations/:id/plex-image', async (c) => {
  const row = getIntegration(Number(c.req.param('id')));
  if (!row || row.type !== 'plex') return c.json({ error: 'Not found' }, 404);
  const path = c.req.query('path') ?? '';
  const result = await getPlexImage(row.config as PlexConfig, path);
  if ('error' in result) return c.json(result, 502);
  return new Response(result.body, {
    headers: {
      'Content-Type': result.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
```

- [ ] **Step 9: Run full server test suite**

Run: `bun test src/server/` 
Expected: all PASS (including the bumped count tests).

- [ ] **Step 10: Commit**

```bash
git add src/server/integrations/plex.ts src/server/integrations/plex.test.ts src/server/types.ts src/server/integrations/registry.ts src/server/integrations/registry.test.ts src/server/app.integrations.test.ts src/server/app.ts
git commit -m "feat: add Plex integration (server)"
```

---

### Task 2: Shared MediaSessions widget (consolidate Jellyfin + Emby + Plex)

**Files:**
- Create: `src/web/src/widgets/MediaSessions.svelte`
- Modify: `src/web/src/lib/stores.ts` (add `PlexData`)
- Modify: `src/web/src/components/WidgetHost.svelte` (replace Jellyfin/Emby imports+branches; add plex; route all three to MediaSessions)
- Delete: `src/web/src/widgets/Jellyfin.svelte`, `src/web/src/widgets/Emby.svelte`
- Modify: `scripts/vendor-icons.ts` (add `'plex'` slug)

**Interfaces:**
- Consumes: `PlexPayload`/`EmbyPayload`/`JellyfinPayload` shape (all identical: `sessions[]` + `playing`); `getStore`, `WidgetState`, `clampPercent`.
- Produces: `<MediaSessions {title} integrationId={id} type={...} />` rendering the now-playing card for `type` ∈ `'jellyfin' | 'emby' | 'plex'`.

- [ ] **Step 1: Add `PlexData` to `src/web/src/lib/stores.ts`**

Add after the `EmbyData` type:

```ts
export type PlexData = {
  sessions: Array<{
    id: string;
    title: string;
    subtitle: string;
    user: string;
    device: string;
    progress: number;
    posterUrl?: string;
    isTranscoding: boolean;
  }>;
  playing: number;
};
```

- [ ] **Step 2: Create `src/web/src/widgets/MediaSessions.svelte`**

This generalizes the existing `Jellyfin.svelte` (which renders the `.jf`/`.poster`/`.sess` markup). Icon and poster-rewrite are derived from `type`. The poster rewrite turns the server placeholder `/api/<type>/image` into `/api/integrations/<id>/<type>-image`, preserving the suffix (`/<itemId>` for jellyfin/emby, `?path=<thumb>` for plex).

```svelte
<script lang="ts">
  import { Play } from 'lucide-svelte';
  import Icon from '../components/Icon.svelte';
  import { getStore, type WidgetState } from '$lib/stores';
  import { clampPercent } from '$lib/utils';

  type MediaType = 'jellyfin' | 'emby' | 'plex';
  type MediaSession = {
    id: string;
    title: string;
    subtitle: string;
    user: string;
    device: string;
    progress: number;
    posterUrl?: string;
    isTranscoding: boolean;
  };
  type MediaData = { sessions: MediaSession[]; playing: number };

  let { title, integrationId, type }: { title: string; integrationId: number; type: MediaType } =
    $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<MediaData>);
  const icon = $derived(`di:${type}`);

  function posterSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    // Server emits `/api/<type>/image...`; rewrite to the per-integration proxy route.
    return url.replace(`/api/${type}/image`, `/api/integrations/${integrationId}/${type}-image`);
  }
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon {icon} fallback="film" size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">{state.data.playing} playing</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:72px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if !state.data?.sessions?.length}
    <p class="state-msg empty">No active sessions</p>
  {:else}
    <div class="sess">
      {#each state.data.sessions as s}
        <div class="jf">
          <div class="poster">
            {#if s.posterUrl}
              <img src={posterSrc(s.posterUrl)} alt="" />
            {:else}
              <Play size={18} />
            {/if}
          </div>
          <div class="info">
            <div class="cti">{s.title}</div>
            <div class="sub">{s.subtitle}</div>
            <div class="who">{s.user} · {s.device}</div>
            <div class="bar"><i style:width="{clampPercent(s.progress)}%"></i></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
```

- [ ] **Step 3: Delete the old widgets**

```bash
git rm src/web/src/widgets/Jellyfin.svelte src/web/src/widgets/Emby.svelte
```

- [ ] **Step 4: Rewire `src/web/src/components/WidgetHost.svelte`**

Remove the `Jellyfin` and `Emby` imports; add:

```ts
  import MediaSessions from '../widgets/MediaSessions.svelte';
```

Replace the separate `jellyfin` and `emby` branches with a single combined branch (and add `plex`):

```svelte
{:else if integration.type === 'jellyfin' || integration.type === 'emby' || integration.type === 'plex'}
  <MediaSessions {title} integrationId={id} type={integration.type} />
```

- [ ] **Step 5: Add the `'plex'` icon slug in `scripts/vendor-icons.ts`**

Add `'plex'` to the `SLUGS` array:

```ts
  'jellyfin',
  'emby',
  'plex',
```

- [ ] **Step 6: Build to verify**

Run: `bun run build`
Expected: `vendor-icons` logs `Vendored plex.svg`; Svelte/Vite build succeeds; no references to the deleted `Jellyfin.svelte`/`Emby.svelte` remain (build fails if any dangling import). No new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/web/src/widgets/MediaSessions.svelte src/web/src/lib/stores.ts src/web/src/components/WidgetHost.svelte scripts/vendor-icons.ts
git commit -m "feat: consolidate media widgets into MediaSessions, add Plex"
```

---

## Final verification

- [ ] Run `bun test` (full suite) — all green (type counts now 19).
- [ ] Run `bun run build` — clean; `plex.svg` vendored; no dangling imports to deleted widgets.
- [ ] Grep check: `grep -rn "Jellyfin.svelte\|Emby.svelte" src/web/src` returns nothing.
- [ ] Manual smoke (optional): start dev, confirm Jellyfin/Emby/Plex all render through MediaSessions with the right icon, and Plex posters load via the proxy.

## Self-review notes
- Spec coverage: Plex client + image proxy + SSRF guard + route (Task 1); MediaSessions consolidation + Plex web wiring + icon + widget deletion (Task 2). All spec sections mapped.
- Type-count tests: both `registry.test.ts` and `app.integrations.test.ts` bumped 18 → 19 (Task 1 Step 7).
- Type names consistent: `PlexConfig`/`PlexPayload`/`PlexSession`/`PlexData`, `getPlexSessions`/`getPlexImage`, `MediaSessions` widget with `type` prop.
- Poster rewrite consistent: server emits `/api/<type>/image...`, widget rewrites to `/api/integrations/<id>/<type>-image...` for all three types.
- No schema.ts / scheduler.ts / hub.ts changes.
