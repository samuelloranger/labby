# Emby + SABnzbd Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Emby (media now-playing) and SABnzbd (usenet download) as two new Labby integration types.

**Architecture:** Both plug into the existing instance-based integration system — a `registry.ts` entry + a fail-soft client returning `Payload | {error}` + payload types + a Svelte widget branch in `WidgetHost.svelte`. The generic `int:${id}` scheduler and `POST /api/integrations/:id/action/:name` route absorb both with no SSE/scheduler/schema changes. Emby is a standalone module (not shared with Jellyfin) using the verified-stable `/Sessions` + `X-Emby-Token` slice. SABnzbd gets its own usenet-shaped payload and widget.

**Tech Stack:** Bun + Hono (server), Svelte 5 runes (web), `bun:test` with mocked `fetch`, Zod (config — untouched here).

## Global Constraints

- TypeScript strict everywhere; validate external responses defensively (no blind casts of upstream JSON).
- Server types in `src/server/types.ts` are duplicated by design in `src/web/src/lib/stores.ts` — keep both in sync.
- Integrations never throw to the route: missing config → `{error:'... not configured'}`; failures wrapped via `soft()`.
- Credentials stay server-side; secret fields marked `secret:true`; API keys never sent to the browser (image proxy pattern).
- Every widget implements loading / error / empty / ready states and respects reduced-motion (reuse existing global classes).
- `di:` icon slugs used in config MUST be added to `SLUGS` in `scripts/vendor-icons.ts` or the build won't vendor them.
- Run `bun test` from repo root; web build via `cd src/web && bun run build` (or root `bun run build`).

---

### Task 1: Emby server client + types + route

**Files:**
- Create: `src/server/integrations/emby.ts`
- Create: `src/server/integrations/emby.test.ts`
- Modify: `src/server/types.ts` (add `EmbySession`, `EmbyPayload`, extend `ChannelPayload`)
- Modify: `src/server/integrations/registry.ts` (import + `emby` entry + union member)
- Modify: `src/server/app.ts` (import + `emby-image` route)

**Interfaces:**
- Produces:
  - `EmbyConfig = { url?: string; apiKey?: string }`
  - `getEmbySessions(config: EmbyConfig): Promise<EmbyPayload | { error: string }>`
  - `getEmbyImage(config: EmbyConfig, itemId: string): Promise<Response | { error: string }>`
  - `EmbyPayload = { sessions: EmbySession[]; playing: number }` (in `types.ts`)
- Consumes: `normalizeBase`, `soft`, `TIMEOUT_MS` from `./http`.

- [ ] **Step 1: Write the failing test** — `src/server/integrations/emby.test.ts`

```ts
import { describe, expect, mock, test } from 'bun:test';
import type { EmbyConfig } from './emby';
import { getEmbyImage, getEmbySessions } from './emby';

describe('Emby client', () => {
  test('reports missing config', async () => {
    expect(await getEmbySessions({})).toEqual({ error: 'EMBY_URL not configured' });
    expect(await getEmbySessions({ url: 'http://emby.test' })).toEqual({
      error: 'EMBY_API_KEY not configured',
    });
    expect(await getEmbyImage({}, 'item-1')).toEqual({ error: 'EMBY_URL not configured' });
  });

  test('maps active sessions', async () => {
    const config: EmbyConfig = { url: 'http://emby.test/', apiKey: 'emby-key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/Sessions')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Emby-Token']).toBe('emby-key');
        return Response.json([
          {
            Id: 'sess-1',
            UserName: 'bob',
            Client: 'Chrome',
            TranscodingInfo: { IsVideoDirect: false },
            PlayState: { PositionTicks: 1_800_000_000 },
            NowPlayingItem: {
              Id: 'item-99',
              Name: 'Episode 1',
              SeriesName: 'Show',
              ParentIndexNumber: 1,
              IndexNumber: 1,
              ProductionYear: 2024,
              RunTimeTicks: 3_600_000_000,
              MediaStreams: [{ Type: 'Video', Height: 1080 }],
            },
          },
          { Id: 'sess-2', UserName: 'idle' },
        ]);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getEmbySessions(config);
    globalThis.fetch = originalFetch;

    expect('sessions' in result).toBe(true);
    if ('sessions' in result) {
      expect(result.playing).toBe(1);
      expect(result.sessions[0].title).toContain('Show');
      expect(result.sessions[0].user).toBe('bob');
      expect(result.sessions[0].progress).toBe(50);
      expect(result.sessions[0].isTranscoding).toBe(true);
      expect(result.sessions[0].posterUrl).toContain('item-99');
    }
  });

  test('returns error on non-ok sessions response', async () => {
    const config: EmbyConfig = { url: 'http://emby.test', apiKey: 'key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 401 }),
    ) as unknown as typeof fetch;
    const result = await getEmbySessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'Emby error: 401' });
  });

  test('returns error when fetch throws', async () => {
    const config: EmbyConfig = { url: 'http://emby.test', apiKey: 'key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const result = await getEmbySessions(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'down' });
  });

  test('fetches item image', async () => {
    const config: EmbyConfig = { url: 'http://emby.test', apiKey: 'key' };
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/Items/item-1/Images/Primary')) {
        return new Response(imageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
    const result = await getEmbyImage(config, 'item-1');
    globalThis.fetch = originalFetch;
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.headers.get('Content-Type')).toBe('image/jpeg');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/integrations/emby.test.ts`
Expected: FAIL — cannot resolve `./emby` (module not created).

- [ ] **Step 3: Add Emby types to `src/server/types.ts`**

Add near the existing `JellyfinSession` / `JellyfinPayload` block:

```ts
export type EmbySession = {
  id: string;
  title: string;
  subtitle: string;
  user: string;
  device: string;
  progress: number;
  posterUrl?: string;
  isTranscoding: boolean;
};

export type EmbyPayload = {
  sessions: EmbySession[];
  playing: number;
};
```

Then add `EmbyPayload` to the `ChannelPayload` union (alongside `JellyfinPayload`):

```ts
export type ChannelPayload =
  | MonitorPayload
  | DockerPayload
  | DownloadsPayload
  | AdGuardPayload
  | JellyfinPayload
  | EmbyPayload
  | BeszelPayload
  | ArrPayload
  | ReelwardPayload
  | WeatherPayload
  | CalendarPayload
  | SpeedtestPayload;
```

- [ ] **Step 4: Create `src/server/integrations/emby.ts`**

```ts
import type { EmbyPayload, EmbySession } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type EmbyConfig = { url?: string; apiKey?: string };

export async function getEmbySessions(
  config: EmbyConfig,
): Promise<EmbyPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'EMBY_URL not configured' };
  if (!key) return { error: 'EMBY_API_KEY not configured' };

  return soft('Emby', async () => {
    const res = await fetch(`${base}/Sessions`, {
      headers: { 'X-Emby-Token': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Emby error: ${res.status}` };

    const raw = (await res.json()) as Record<string, unknown>[];
    const sessions: EmbySession[] = [];

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
          ? `/api/emby/image/${encodeURIComponent(String(nowPlaying.Id))}`
          : undefined,
        isTranscoding: transcode,
      });
    }

    return { sessions, playing: sessions.length };
  });
}

/**
 * Fetches an Emby item's primary image server-side (with the API key) so the
 * browser renders it without seeing the token. Returns the upstream Response.
 */
export async function getEmbyImage(
  config: EmbyConfig,
  itemId: string,
): Promise<Response | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'EMBY_URL not configured' };
  if (!key) return { error: 'EMBY_API_KEY not configured' };

  try {
    const res = await fetch(
      `${base}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=120`,
      { headers: { 'X-Emby-Token': key }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return { error: `Emby image error: ${res.status}` };
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Emby image failed' };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/server/integrations/emby.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Register `emby` in `src/server/integrations/registry.ts`**

Add import near the other integration imports:

```ts
import { getEmbySessions, type EmbyConfig } from './emby';
```

Add `'emby'` to the `IntegrationType` union (after `'jellyfin'`):

```ts
  | 'jellyfin'
  | 'emby'
```

Add the entry to `INTEGRATIONS` (after the `jellyfin` entry):

```ts
  emby: {
    label: 'Emby',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: (c) => getEmbySessions(c as EmbyConfig),
  },
```

- [ ] **Step 7: Add the Emby image route in `src/server/app.ts`**

Add to the existing Emby/Jellyfin import line area:

```ts
import { getEmbyImage, type EmbyConfig } from './integrations/emby';
```

Add the route immediately after the existing `jellyfin-image` route:

```ts
app.get('/api/integrations/:id/emby-image/:itemId', async (c) => {
  const row = getIntegration(Number(c.req.param('id')));
  if (!row || row.type !== 'emby') return c.json({ error: 'Not found' }, 404);
  const result = await getEmbyImage(row.config as EmbyConfig, c.req.param('itemId'));
  if ('error' in result) return c.json(result, 502);
  return new Response(result.body, {
    headers: {
      'Content-Type': result.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
```

- [ ] **Step 8: Run full server test suite + typecheck**

Run: `bun test src/server/integrations/ && bun run build`
Expected: all tests PASS; build (typecheck) succeeds. (Registry `emby` entry is now type-checked against the union.)

- [ ] **Step 9: Commit**

```bash
git add src/server/integrations/emby.ts src/server/integrations/emby.test.ts src/server/types.ts src/server/integrations/registry.ts src/server/app.ts
git commit -m "feat: add Emby integration (server)"
```

---

### Task 2: Emby web widget

**Files:**
- Create: `src/web/src/widgets/Emby.svelte`
- Modify: `src/web/src/lib/stores.ts` (add `EmbyData`)
- Modify: `src/web/src/components/WidgetHost.svelte` (import + branch)
- Modify: `scripts/vendor-icons.ts` (add `'emby'` slug)

**Interfaces:**
- Consumes: `EmbyPayload` shape from Task 1 (mirrored as `EmbyData`); `getStore`, `WidgetState`, `clampPercent`.
- Produces: `<Emby {title} integrationId={id} />` widget rendered for `integration.type === 'emby'`.

- [ ] **Step 1: Add `EmbyData` to `src/web/src/lib/stores.ts`**

Add directly after the `JellyfinData` type:

```ts
export type EmbyData = {
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

- [ ] **Step 2: Create `src/web/src/widgets/Emby.svelte`**

```svelte
<script lang="ts">
  import { Play } from 'lucide-svelte';
  import Icon from '../components/Icon.svelte';
  import { getStore, type EmbyData, type WidgetState } from '$lib/stores';
  import { clampPercent } from '$lib/utils';

  let { title, integrationId }: { title: string; integrationId: number } = $props();
  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<EmbyData>);

  function posterSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return url.replace('/api/emby/image/', `/api/integrations/${integrationId}/emby-image/`);
  }
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="di:emby" fallback="film" size={20} /></span>
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

(Reuses the global `.jf`/`.poster`/`.sess` classes already defined for the Jellyfin widget.)

- [ ] **Step 3: Wire the branch in `src/web/src/components/WidgetHost.svelte`**

Add the import alongside the other widget imports:

```ts
  import Emby from '../widgets/Emby.svelte';
```

Add the branch immediately after the `jellyfin` branch:

```svelte
{:else if integration.type === 'emby'}
  <Emby {title} integrationId={id} />
```

- [ ] **Step 4: Add the icon slug in `scripts/vendor-icons.ts`**

Add `'emby'` to the `SLUGS` array (anywhere in the list):

```ts
  'jellyfin',
  'emby',
```

- [ ] **Step 5: Build the web app to verify it compiles**

Run: `bun run build`
Expected: `vendor-icons` fetches `emby.svg` (logs `Vendored emby.svg`); Svelte/Vite build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/widgets/Emby.svelte src/web/src/lib/stores.ts src/web/src/components/WidgetHost.svelte scripts/vendor-icons.ts
git commit -m "feat: add Emby widget (web)"
```

---

### Task 3: SABnzbd server client + types + registry

**Files:**
- Create: `src/server/integrations/sabnzbd.ts`
- Create: `src/server/integrations/sabnzbd.test.ts`
- Modify: `src/server/types.ts` (add `SabnzbdSlot`, `SabnzbdPayload`, extend `ChannelPayload`)
- Modify: `src/server/integrations/registry.ts` (import + `sabnzbd` entry + union member)

**Interfaces:**
- Produces:
  - `SabnzbdConfig = { url?: string; apiKey?: string; max?: number }`
  - `getSabnzbdQueue(config: SabnzbdConfig): Promise<SabnzbdPayload | { error: string }>`
  - `sabnzbdAction(config: SabnzbdConfig, nzoId: string, action: 'pause' | 'resume'): Promise<{ ok: true } | { error: string }>`
  - `SabnzbdSlot`, `SabnzbdPayload` (in `types.ts`)
- Consumes: `normalizeBase`, `soft`, `TIMEOUT_MS` from `./http`.

API reference (verified, sabnzbd.org/wiki/configuration/5.0/api):
- Queue: `GET {base}/api?mode=queue&output=json&apikey=KEY` → `{ queue: { paused, kbpersec, timeleft, mbleft, slots:[{nzo_id, filename, percentage, mbleft, timeleft, status}] } }`
- Pause/resume item: `GET {base}/api?mode=queue&name=pause|resume&value=NZO_ID&apikey=KEY`
- Bad apikey returns HTTP 200 with body `{"error":"API Key Incorrect"}` (or similar) — detect and surface.

- [ ] **Step 1: Write the failing test** — `src/server/integrations/sabnzbd.test.ts`

```ts
import { describe, expect, mock, test } from 'bun:test';
import type { SabnzbdConfig } from './sabnzbd';
import { getSabnzbdQueue, sabnzbdAction } from './sabnzbd';

describe('SABnzbd client', () => {
  test('reports missing config', async () => {
    expect(await getSabnzbdQueue({})).toEqual({ error: 'SABNZBD_URL not configured' });
    expect(await getSabnzbdQueue({ url: 'http://sab.test' })).toEqual({
      error: 'SABNZBD_API_KEY not configured',
    });
  });

  test('maps the queue', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test/', apiKey: 'sab-key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('mode=queue');
      expect(url).toContain('apikey=sab-key');
      expect(url).toContain('output=json');
      return Response.json({
        queue: {
          paused: false,
          kbpersec: '2048.0',
          timeleft: '0:12:34',
          mbleft: '500.0',
          slots: [
            {
              nzo_id: 'SABnzbd_nzo_abc',
              filename: 'Big.Linux.ISO',
              percentage: '42',
              mbleft: '500.0',
              timeleft: '0:12:34',
              status: 'Downloading',
            },
          ],
        },
      });
    }) as unknown as typeof fetch;

    const result = await getSabnzbdQueue(config);
    globalThis.fetch = originalFetch;

    expect('slots' in result).toBe(true);
    if ('slots' in result) {
      expect(result.paused).toBe(false);
      expect(result.speedBps).toBe(2048 * 1024);
      expect(result.timeLeft).toBe('0:12:34');
      expect(result.slots[0].id).toBe('SABnzbd_nzo_abc');
      expect(result.slots[0].name).toBe('Big.Linux.ISO');
      expect(result.slots[0].progress).toBe(42);
      expect(result.slots[0].status).toBe('Downloading');
    }
  });

  test('surfaces a bad-apikey error body', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test', apiKey: 'wrong' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      Response.json({ error: 'API Key Incorrect' }),
    ) as unknown as typeof fetch;
    const result = await getSabnzbdQueue(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'API Key Incorrect' });
  });

  test('returns error on non-ok response', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test', apiKey: 'key' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 500 }),
    ) as unknown as typeof fetch;
    const result = await getSabnzbdQueue(config);
    globalThis.fetch = originalFetch;
    expect(result).toEqual({ error: 'SABnzbd error: 500' });
  });

  test('pause action hits the right URL', async () => {
    const config: SabnzbdConfig = { url: 'http://sab.test', apiKey: 'sab-key' };
    let calledUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return Response.json({ status: true, nzo_ids: ['SABnzbd_nzo_abc'] });
    }) as unknown as typeof fetch;

    const result = await sabnzbdAction(config, 'SABnzbd_nzo_abc', 'pause');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
    expect(calledUrl).toContain('mode=queue');
    expect(calledUrl).toContain('name=pause');
    expect(calledUrl).toContain('value=SABnzbd_nzo_abc');
    expect(calledUrl).toContain('apikey=sab-key');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/integrations/sabnzbd.test.ts`
Expected: FAIL — cannot resolve `./sabnzbd`.

- [ ] **Step 3: Add SABnzbd types to `src/server/types.ts`**

Add near the `DownloadsPayload` block:

```ts
export type SabnzbdSlot = {
  id: string;
  name: string;
  progress: number;
  sizeLeftMb: number;
  timeLeft: string;
  status: string;
};

export type SabnzbdPayload = {
  paused: boolean;
  speedBps: number;
  sizeLeftMb: number;
  timeLeft: string;
  slots: SabnzbdSlot[];
};
```

Add `SabnzbdPayload` to the `ChannelPayload` union:

```ts
  | DownloadsPayload
  | SabnzbdPayload
```

- [ ] **Step 4: Create `src/server/integrations/sabnzbd.ts`**

```ts
import type { SabnzbdPayload, SabnzbdSlot } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type SabnzbdConfig = { url?: string; apiKey?: string; max?: number };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getSabnzbdQueue(
  config: SabnzbdConfig,
): Promise<SabnzbdPayload | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'SABNZBD_URL not configured' };
  if (!key) return { error: 'SABNZBD_API_KEY not configured' };

  return soft('SABnzbd', async () => {
    const res = await fetch(
      `${base}/api?mode=queue&output=json&apikey=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return { error: `SABnzbd error: ${res.status}` };

    const body = (await res.json()) as Record<string, unknown>;
    // SABnzbd returns HTTP 200 with { error } on a bad apikey.
    if (typeof body.error === 'string') return { error: body.error };

    const queue = (body.queue ?? {}) as Record<string, unknown>;
    const rawSlots = (queue.slots as Record<string, unknown>[]) ?? [];
    const slots: SabnzbdSlot[] = rawSlots.map((s) => ({
      id: String(s.nzo_id ?? ''),
      name: String(s.filename ?? ''),
      progress: num(s.percentage),
      sizeLeftMb: num(s.mbleft),
      timeLeft: String(s.timeleft ?? ''),
      status: String(s.status ?? ''),
    }));

    return {
      paused: Boolean(queue.paused),
      speedBps: Math.round(num(queue.kbpersec) * 1024),
      sizeLeftMb: num(queue.mbleft),
      timeLeft: String(queue.timeleft ?? ''),
      slots,
    };
  });
}

export async function sabnzbdAction(
  config: SabnzbdConfig,
  nzoId: string,
  action: 'pause' | 'resume',
): Promise<{ ok: true } | { error: string }> {
  const base = normalizeBase(config.url);
  const key = config.apiKey ?? null;
  if (!base) return { error: 'SABNZBD_URL not configured' };
  if (!key) return { error: 'SABNZBD_API_KEY not configured' };

  try {
    const res = await fetch(
      `${base}/api?mode=queue&name=${action}&value=${encodeURIComponent(nzoId)}&apikey=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return { error: `SABnzbd ${action} failed: ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `SABnzbd ${action} failed` };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/server/integrations/sabnzbd.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Register `sabnzbd` in `src/server/integrations/registry.ts`**

Add import:

```ts
import { getSabnzbdQueue, type SabnzbdConfig, sabnzbdAction } from './sabnzbd';
```

Add `'sabnzbd'` to the `IntegrationType` union (after `'transmission'`):

```ts
  | 'transmission'
  | 'sabnzbd'
```

Add the entry to `INTEGRATIONS` (after the `transmission` entry):

```ts
  sabnzbd: {
    label: 'SABnzbd',
    defaultRefreshSeconds: 5,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getSabnzbdQueue(c as SabnzbdConfig),
    actions: {
      pause: (c, id) => sabnzbdAction(c as SabnzbdConfig, id as string, 'pause'),
      resume: (c, id) => sabnzbdAction(c as SabnzbdConfig, id as string, 'resume'),
    },
  },
```

- [ ] **Step 7: Run full server test suite + typecheck**

Run: `bun test src/server/integrations/ && bun run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/server/integrations/sabnzbd.ts src/server/integrations/sabnzbd.test.ts src/server/types.ts src/server/integrations/registry.ts
git commit -m "feat: add SABnzbd integration (server)"
```

---

### Task 4: SABnzbd web widget

**Files:**
- Create: `src/web/src/widgets/Sabnzbd.svelte`
- Modify: `src/web/src/lib/stores.ts` (add `SabnzbdData`)
- Modify: `src/web/src/components/WidgetHost.svelte` (import + branch)
- Modify: `scripts/vendor-icons.ts` (add `'sabnzbd'` slug)

**Interfaces:**
- Consumes: `SabnzbdPayload` shape from Task 3 (mirrored as `SabnzbdData`); `getStore`, `WidgetState`, `clampPercent`, `formatBytesPerSec`; action route `POST /api/integrations/:id/action/:action` body `{args:[nzoId]}`.
- Produces: `<Sabnzbd {title} integrationId={id} max={c.max} />` widget for `integration.type === 'sabnzbd'`.

- [ ] **Step 1: Add `SabnzbdData` to `src/web/src/lib/stores.ts`**

Add after `DownloadsData`:

```ts
export type SabnzbdData = {
  paused: boolean;
  speedBps: number;
  sizeLeftMb: number;
  timeLeft: string;
  slots: Array<{
    id: string;
    name: string;
    progress: number;
    sizeLeftMb: number;
    timeLeft: string;
    status: string;
  }>;
};
```

- [ ] **Step 2: Create `src/web/src/widgets/Sabnzbd.svelte`**

```svelte
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type SabnzbdData, type WidgetState } from '$lib/stores';
  import { clampPercent, formatBytesPerSec } from '$lib/utils';

  let { title, integrationId, max }: { title: string; integrationId: number; max?: number } =
    $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<SabnzbdData>);
  const slots = $derived((state.data?.slots ?? []).slice(0, max && max > 0 ? max : undefined));

  let pending = $state<Record<string, boolean>>({});
  let optimistic = $state<Record<string, boolean>>({});

  function isPaused(status: string): boolean {
    return status.toLowerCase() === 'paused';
  }

  async function toggle(id: string, action: 'pause' | 'resume') {
    optimistic = { ...optimistic, [id]: action === 'pause' };
    pending = { ...pending, [id]: true };
    try {
      const res = await fetch(`/api/integrations/${integrationId}/action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [id] }),
      });
      if (!res.ok) throw new Error('action failed');
    } catch {
      const next = { ...optimistic };
      delete next[id];
      optimistic = next;
    } finally {
      const p = { ...pending };
      delete p[id];
      pending = p;
    }
  }

  // Drop the optimistic override once live state agrees.
  $effect(() => {
    for (const s of state.data?.slots ?? []) {
      if (s.id in optimistic && isPaused(s.status) === optimistic[s.id]) {
        const next = { ...optimistic };
        delete next[s.id];
        optimistic = next;
      }
    }
  });
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="di:sabnzbd" fallback="download" size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">
        {#if state.data.paused}paused{:else}↓ {formatBytesPerSec(state.data.speedBps)}{/if}
        {#if state.data.slots.length} · {state.data.timeLeft}{/if}
      </span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:72px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if !slots.length}
    <p class="state-msg empty">Queue empty</p>
  {:else}
    <div class="dl">
      {#each slots as s (s.id)}
        {@const paused = s.id in optimistic ? optimistic[s.id] : isPaused(s.status)}
        <div class="tor" class:paused={paused}>
          <div class="top">
            <span class="dot {paused ? 'idle' : 'live'}"></span>
            <span class="tname" title={s.name}>{s.name}</span>
            <span class="pct">{Math.round(clampPercent(s.progress))}%</span>
            <button
              class="tor-action"
              title={paused ? 'Resume' : 'Pause'}
              aria-label={paused ? 'Resume download' : 'Pause download'}
              disabled={pending[s.id]}
              onclick={() => toggle(s.id, paused ? 'resume' : 'pause')}
            >
              <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} size={15} />
            </button>
          </div>
          <div class="bar"><i style:width="{clampPercent(s.progress)}%"></i></div>
          <div class="spd">
            <span style="color:var(--ink-faint)">
              {paused ? 'paused' : s.status.toLowerCase()} · {s.timeLeft || '—'}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .tor-action {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink-faint);
    cursor: pointer;
    transition:
      background 0.15s var(--ease),
      color 0.15s var(--ease);
  }
  .tor-action:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .tor-action:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tor.paused {
    opacity: 0.55;
  }
  .tor.paused .bar i {
    background: var(--ink-faint);
  }
</style>
```

(Reuses the global `.dl`/`.tor`/`.top`/`.tname`/`.pct`/`.bar`/`.spd` classes from the Downloads widget.)

- [ ] **Step 3: Wire the branch in `src/web/src/components/WidgetHost.svelte`**

Add the import:

```ts
  import Sabnzbd from '../widgets/Sabnzbd.svelte';
```

Add the branch after the `qbittorrent`/`transmission` branch:

```svelte
{:else if integration.type === 'sabnzbd'}
  <Sabnzbd {title} integrationId={id} max={c.max} />
```

- [ ] **Step 4: Add the icon slug in `scripts/vendor-icons.ts`**

Add `'sabnzbd'` to the `SLUGS` array:

```ts
  'transmission',
  'sabnzbd',
```

- [ ] **Step 5: Build the web app to verify it compiles**

Run: `bun run build`
Expected: `vendor-icons` logs `Vendored sabnzbd.svg`; build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/widgets/Sabnzbd.svelte src/web/src/lib/stores.ts src/web/src/components/WidgetHost.svelte scripts/vendor-icons.ts
git commit -m "feat: add SABnzbd widget (web)"
```

---

## Final verification

- [ ] Run `bun test` (full suite) — all green.
- [ ] Run `bun run build` — clean build, `emby.svg` + `sabnzbd.svg` vendored.
- [ ] Manual smoke (optional): start dev (`bun run dev` + `cd src/web && bun run dev`), open Manage Services, confirm **Emby** and **SABnzbd** appear in the integration type list with their fields, add one of each, confirm the widget renders loading → error/ready.

## Self-review notes
- Spec coverage: Emby client+image+route+widget+icon (Tasks 1–2); SABnzbd client+actions+widget+icon (Tasks 3–4). All spec sections mapped.
- No schema.ts / scheduler.ts / hub.ts changes — confirmed by spec architecture.
- Type names consistent across tasks: `EmbyConfig`/`EmbyPayload`/`EmbyData`, `SabnzbdConfig`/`SabnzbdPayload`/`SabnzbdData`/`SabnzbdSlot`, `getEmbySessions`/`getEmbyImage`/`getSabnzbdQueue`/`sabnzbdAction`.
- Poster proxy: server emits `/api/emby/image/<id>`, widget rewrites to `/api/integrations/<id>/emby-image/<id>`, route guards `type === 'emby'` — matches Jellyfin pattern.
