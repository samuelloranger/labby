# Import/Export + Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-backup export/restore and a bookmarks (app-launcher) widget to Labby, with favicon auto-fetch when adding links.

**Architecture:** Bookmarks reuse Labby's per-integration pattern — a new `bookmarks` integration type whose `fetch` returns its own `links` (no external call); its data reaches the widget through the existing `int:${id}` SSE store and `/api/integrations/:id/data` bootstrap, so no new data path is needed. Backup/restore are two new endpoints over the existing `settings` + `integrations` tables, with restore wrapped in a single SQLite transaction. Favicon resolution is one server endpoint the links editor calls.

**Tech Stack:** Bun, Hono, Zod, bun:sqlite, Svelte 5 (runes), bun:test.

## Global Constraints

- TypeScript strict everywhere. Validate external/DB responses defensively (Zod where parsing untrusted input).
- Server types (`src/server/types.ts`, schema) and web types (`src/web/src/lib/types.ts`, `stores.ts`) are duplicated by design — keep them in sync when a payload shape changes.
- Integrations fail soft: `fetch` returns `Payload | { error: string }`, never throws to the route.
- Tests are colocated `*.test.ts`, use `bun:test`, mock `fetch`. Endpoint tests use `app.request(path, opts)`. DB tests call db functions directly and clean up by unique name.
- `@server/*` → `src/server/*`; web uses `$lib` → `src/web/src/lib`.
- Icons: `icon` is a prefixed string resolved by `Icon.svelte` (`di:`, `sh:`, `http(s)://`, `/path`, `lucide:`). Favicon values are stored as `http(s)://` URLs so no `Icon.svelte` change is required.
- Run server tests with `bun test`; build/typecheck frontend with `bun run build`.

---

### Task 1: Bookmarks integration type + widget schema

**Files:**
- Modify: `src/server/integrations/registry.ts` (union ~20-35, `INTEGRATIONS` map ~53-208)
- Modify: `src/server/config/schema.ts` (`WidgetSchema` union ~54-137)
- Modify: `src/server/integrations/registry.test.ts` (counts + `ALL_TYPES`)
- Modify: `src/server/app.integrations.test.ts` (count assertion)

**Interfaces:**
- Produces: integration type `'bookmarks'` in `IntegrationType`; `INTEGRATIONS.bookmarks` with `fetch(config) => Promise<{ links: Array<{title:string;url:string;icon?:string}> }>`; widget variant `{ type:'bookmarks'; title:string; integrationId:number }`.

- [ ] **Step 1: Update the registry test for bookmarks (failing test)**

In `src/server/integrations/registry.test.ts`:
- Add `'bookmarks'` to the end of the `ALL_TYPES` array.
- Change `expect(Object.keys(INTEGRATIONS).length).toBe(15)` → `toBe(16)`.
- Change `it('returns an array of 15 entries' …` assertion `expect(integrationTypes().length).toBe(15)` → `toBe(16)`.

Add this test inside the `describe('INTEGRATIONS registry', …)` block:

```ts
it('bookmarks.fetch returns links from config', async () => {
  const out = (await INTEGRATIONS.bookmarks.fetch({
    links: [{ title: 'Router', url: 'http://192.168.1.1' }],
  })) as { links: unknown[] };
  expect(out.links.length).toBe(1);
  const empty = (await INTEGRATIONS.bookmarks.fetch({})) as { links: unknown[] };
  expect(empty.links).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/server/integrations/registry.test.ts`
Expected: FAIL — `INTEGRATIONS.bookmarks` is undefined / count is 15 not 16.

- [ ] **Step 3: Add the bookmarks type to the registry**

In `src/server/integrations/registry.ts`, add `| 'bookmarks'` to the `IntegrationType` union (after `'speedtest'`). Then add this entry to the `INTEGRATIONS` object (e.g. after `speedtest`):

```ts
  bookmarks: {
    label: 'Bookmarks',
    // ponytail: static links, no polling — large interval so the no-op re-publish is rare
    defaultRefreshSeconds: 86_400,
    fields: [{ key: 'links', label: 'Links', kind: 'list' }],
    fetch: async (c) => ({
      links: Array.isArray(c.links) ? (c.links as Array<Record<string, unknown>>) : [],
    }),
  },
```

- [ ] **Step 4: Add the bookmarks widget variant to the schema**

In `src/server/config/schema.ts`, add this object to the `WidgetSchema` discriminated union (after the `speedtest` entry, before the closing `]`):

```ts
  z.object({
    type: z.literal('bookmarks'),
    title: z.string(),
    integrationId,
  }),
```

- [ ] **Step 5: Fix the app integrations count assertion**

In `src/server/app.integrations.test.ts`, change `expect(body.length).toBe(15)` → `toBe(16)`.

- [ ] **Step 6: Run the affected tests to verify they pass**

Run: `bun test src/server/integrations/registry.test.ts src/server/app.integrations.test.ts src/server/config`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/integrations/registry.ts src/server/config/schema.ts src/server/integrations/registry.test.ts src/server/app.integrations.test.ts
git commit -m "feat(server): add bookmarks integration type and widget schema"
```

---

### Task 2: Favicon resolver endpoint

**Files:**
- Create: `src/server/integrations/favicon.ts`
- Create: `src/server/integrations/favicon.test.ts`
- Modify: `src/server/app.ts` (add route near the other `/api` GETs, ~line 63)

**Interfaces:**
- Produces: `resolveFavicon(pageUrl: string): Promise<{ icon: string | null }>`; route `GET /api/favicon?url=<url>` returning that shape.

- [ ] **Step 1: Write the failing test**

Create `src/server/integrations/favicon.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'bun:test';
import { resolveFavicon } from './favicon';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockHtml(html: string) {
  globalThis.fetch = (async () =>
    new Response(html, { headers: { 'content-type': 'text/html' } })) as typeof fetch;
}

describe('resolveFavicon', () => {
  it('parses <link rel="icon"> and resolves to an absolute URL', async () => {
    mockHtml('<html><head><link rel="icon" href="/assets/fav.png"></head></html>');
    const out = await resolveFavicon('https://example.com/dashboard');
    expect(out.icon).toBe('https://example.com/assets/fav.png');
  });

  it('falls back to /favicon.ico when no link tag is present', async () => {
    mockHtml('<html><head></head></html>');
    const out = await resolveFavicon('https://example.com/x/y');
    expect(out.icon).toBe('https://example.com/favicon.ico');
  });

  it('returns null icon when the URL is invalid', async () => {
    const out = await resolveFavicon('not a url');
    expect(out.icon).toBeNull();
  });

  it('returns null icon when the fetch throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network');
    }) as typeof fetch;
    const out = await resolveFavicon('https://example.com');
    expect(out.icon).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/server/integrations/favicon.test.ts`
Expected: FAIL — `Cannot find module './favicon'`.

- [ ] **Step 3: Implement the resolver**

Create `src/server/integrations/favicon.ts`:

```ts
import { TIMEOUT_MS } from './http';

// ponytail: regex parse, not a full HTML parser — swap in a parser if it misses real-world sites
const LINK_ICON_RE =
  /<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/i;
const HREF_RE = /href=["']([^"']+)["']/i;

export async function resolveFavicon(pageUrl: string): Promise<{ icon: string | null }> {
  let base: URL;
  try {
    base = new URL(pageUrl);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return { icon: null };
  } catch {
    return { icon: null };
  }

  const fallback = new URL('/favicon.ico', base).href;

  try {
    const res = await fetch(base.href, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return { icon: fallback };
    const html = await res.text();
    const tag = LINK_ICON_RE.exec(html);
    const href = tag ? HREF_RE.exec(tag[0])?.[1] : undefined;
    if (href) {
      try {
        return { icon: new URL(href, base).href };
      } catch {
        return { icon: fallback };
      }
    }
    return { icon: fallback };
  } catch {
    // unreachable host / timeout: still offer the conventional path
    return { icon: fallback };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/server/integrations/favicon.test.ts`
Expected: PASS. (The "invalid URL" case returns null before fetching; the "fetch throws" case is caught and returns the fallback path computed from a *valid* base — note: for the throw test the URL `https://example.com` is valid, so it returns `https://example.com/favicon.ico`, not null. Adjust that assertion in Step 1 to `expect(out.icon).toBe('https://example.com/favicon.ico')` before running.)

> NOTE TO IMPLEMENTER: In Step 1, change the last test's assertion to `expect(out.icon).toBe('https://example.com/favicon.ico')` to match the fail-soft fallback behavior (a valid base URL always yields the conventional `/favicon.ico` path even when the page fetch fails). Only a syntactically invalid URL yields `null`.

- [ ] **Step 5: Add the route**

In `src/server/app.ts`, add near the other `/api` GET routes (e.g. after line 63) and import at the top:

```ts
// top of file with other imports:
import { resolveFavicon } from './integrations/favicon';

// with the routes:
app.get('/api/favicon', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ icon: null });
  return c.json(await resolveFavicon(url));
});
```

- [ ] **Step 6: Verify the route works**

Run: `bun test src/server/integrations/favicon.test.ts && bun run build`
Expected: tests PASS, build succeeds (typecheck clean).

- [ ] **Step 7: Commit**

```bash
git add src/server/integrations/favicon.ts src/server/integrations/favicon.test.ts src/server/app.ts
git commit -m "feat(server): add favicon resolver endpoint"
```

---

### Task 3: Backup export + restore

**Files:**
- Modify: `src/server/db.ts` (add `replaceAllIntegrations`, ~after line 261)
- Modify: `src/server/app.ts` (add `/api/backup`, `/api/restore`)
- Create: `src/server/backup.test.ts`

**Interfaces:**
- Consumes: `listIntegrations()`, `getSetting('dashboard')`, `setSetting`, `db`, `IntegrationRow` (db.ts); `reloadConfig()` (config/loader.ts); `DashboardSchema` (config/schema.ts).
- Produces: `replaceAllIntegrations(rows: IntegrationRow[]): void`; `GET /api/backup` → `{version:1; exportedAt:string; dashboard:object; integrations:IntegrationRow[]}`; `POST /api/restore` → `{ok:true}` or `{error}` (400).

- [ ] **Step 1: Write the db helper test (failing)**

Create `src/server/backup.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { createIntegration, deleteIntegration, listIntegrations, replaceAllIntegrations } from './db';

const TAG = '__test_backup__';

function cleanup() {
  for (const r of listIntegrations().filter((r) => r.name.startsWith(TAG))) deleteIntegration(r.id);
}

test('replaceAllIntegrations wipes then restores rows preserving ids', () => {
  cleanup();
  // snapshot current rows so we can restore the DB after the test
  const original = listIntegrations();
  try {
    const restored = [
      { id: 9001, name: `${TAG}a`, type: 'radarr', config: { url: 'http://a' }, enabled: true, refreshSeconds: 60 },
      { id: 9002, name: `${TAG}b`, type: 'sonarr', config: {}, enabled: false, refreshSeconds: null },
    ];
    replaceAllIntegrations(restored);
    const after = listIntegrations();
    expect(after.length).toBe(2);
    expect(after.find((r) => r.id === 9001)?.name).toBe(`${TAG}a`);
    expect(after.find((r) => r.id === 9001)?.config).toEqual({ url: 'http://a' });
    expect(after.find((r) => r.id === 9002)?.enabled).toBe(false);
  } finally {
    // restore the original integrations table
    replaceAllIntegrations(original);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/server/backup.test.ts`
Expected: FAIL — `replaceAllIntegrations` is not exported.

- [ ] **Step 3: Implement the db helper**

In `src/server/db.ts`, add at the end of the file:

```ts
export function replaceAllIntegrations(rows: IntegrationRow[]): void {
  const tx = db.transaction((list: IntegrationRow[]) => {
    db.query('DELETE FROM integrations').run();
    const stmt = db.query(
      'INSERT INTO integrations (id, name, type, config, enabled, refresh_seconds) VALUES ($id,$name,$type,$config,$enabled,$rs)',
    );
    for (const r of list) {
      stmt.run({
        $id: r.id,
        $name: r.name,
        $type: r.type,
        $config: JSON.stringify(r.config),
        $enabled: r.enabled ? 1 : 0,
        $rs: r.refreshSeconds,
      });
    }
  });
  tx(rows);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/server/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the endpoint tests (failing)**

Append to `src/server/backup.test.ts`:

```ts
import { app } from './app';

test('GET /api/backup returns version, dashboard, and integrations', async () => {
  const res = await app.request('/api/backup');
  expect(res.status).toBe(200);
  const body = (await res.json()) as any;
  expect(body.version).toBe(1);
  expect(body.dashboard).toBeDefined();
  expect(Array.isArray(body.integrations)).toBe(true);
});

test('POST /api/restore rejects a malformed payload with 400 and leaves the DB intact', async () => {
  const before = listIntegrations().length;
  const res = await app.request('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, dashboard: { nope: true }, integrations: [] }),
  });
  expect(res.status).toBe(400);
  expect(listIntegrations().length).toBe(before);
});

test('POST /api/restore round-trips a valid backup', async () => {
  const original = await (await app.request('/api/backup')).json();
  try {
    const res = await app.request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
    expect(res.status).toBe(200);
    const again = await (await app.request('/api/backup')).json();
    expect(again.integrations.length).toBe(original.integrations.length);
  } finally {
    // ensure DB returns to the original snapshot regardless
    await app.request('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original),
    });
  }
});
```

- [ ] **Step 6: Run to verify the new endpoint tests fail**

Run: `bun test src/server/backup.test.ts`
Expected: FAIL — `/api/backup` and `/api/restore` are 404.

- [ ] **Step 7: Implement the endpoints**

In `src/server/app.ts`, add imports and routes:

```ts
// imports (merge with existing):
import { z } from 'zod';
import {
  getSetting,
  listIntegrations,
  replaceAllIntegrations,
  setSetting,
} from './db';
import { DashboardSchema } from './config/schema';
import { reloadConfig } from './config/loader';

// --- backup / restore ---
app.get('/api/backup', (c) => {
  const dashboardRaw = getSetting('dashboard');
  const dashboard = dashboardRaw ? JSON.parse(dashboardRaw) : null;
  const body = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    dashboard,
    integrations: listIntegrations(),
  };
  c.header('Content-Type', 'application/json');
  c.header(
    'Content-Disposition',
    `attachment; filename="labby-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  return c.body(JSON.stringify(body, null, 2));
});

const RestoreSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  dashboard: DashboardSchema,
  integrations: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      type: z.string(),
      config: z.record(z.unknown()),
      enabled: z.boolean(),
      refreshSeconds: z.number().int().nullable(),
    }),
  ),
});

app.post('/api/restore', async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = RestoreSchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid backup file' }, 400);
  }
  const { dashboard, integrations } = parsed.data;
  replaceAllIntegrations(integrations);
  setSetting('dashboard', JSON.stringify(dashboard, null, 2));
  reloadConfig();
  return c.json({ ok: true });
});
```

> NOTE: `replaceAllIntegrations` is already its own transaction; `setSetting` runs immediately after. If the integrations insert throws (bad data), it rolls back inside the helper and the dashboard write never runs.

- [ ] **Step 8: Run the full backup test file**

Run: `bun test src/server/backup.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 9: Run the whole server suite + build**

Run: `bun test && bun run build`
Expected: all PASS, build clean.

- [ ] **Step 10: Commit**

```bash
git add src/server/db.ts src/server/app.ts src/server/backup.test.ts
git commit -m "feat(server): add full backup export and restore endpoints"
```

---

### Task 4: Bookmarks widget (frontend render)

**Files:**
- Modify: `src/web/src/lib/stores.ts` (add `BookmarksData` type, ~after line 192)
- Modify: `src/web/src/lib/types.ts` (add bookmarks to `Widget` union, ~line 29)
- Create: `src/web/src/widgets/Bookmarks.svelte`
- Modify: `src/web/src/components/WidgetHost.svelte` (import + branch)

**Interfaces:**
- Consumes: `getStore(integrationId)`, `WidgetState<T>` (stores.ts); `Icon.svelte`.
- Produces: `BookmarksData = { links: Array<{ title:string; url:string; icon?:string }> }`; web `Widget` variant `{ type:'bookmarks'; title:string; integrationId:number }`; `Bookmarks.svelte` component with props `{ title:string; integrationId:number }`.

- [ ] **Step 1: Add the data type**

In `src/web/src/lib/stores.ts`, add after the `FeedData` type (~line 192):

```ts
export type BookmarkLink = { title: string; url: string; icon?: string };
export type BookmarksData = { links: BookmarkLink[] };
```

- [ ] **Step 2: Add the web Widget variant**

In `src/web/src/lib/types.ts`, add to the `Widget` union (after the `speedtest` member, line ~29):

```ts
  | { type: 'bookmarks'; title: string; integrationId: number };
```

(Move the trailing `;` so the union stays valid — the previous last member ended with `;`.)

- [ ] **Step 3: Create the widget component**

Create `src/web/src/widgets/Bookmarks.svelte` (mirrors the store-subscription + state pattern of `Feed.svelte`):

```svelte
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type BookmarksData, type WidgetState } from '$lib/stores';

  let { title, integrationId }: { title: string; integrationId: number } = $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<BookmarksData>);
  const links = $derived(state.data?.links ?? []);
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="lucide:layout-grid" fallback="layout-grid" size={18} /></span>
      {title}
    </span>
    {#if links.length}<span class="meta">{links.length}</span>{/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:96px"></div>
  {:else if state.error}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if links.length === 0}
    <p class="state-msg">No bookmarks</p>
  {:else}
    <div class="bm-grid">
      {#each links as l}
        <a class="bm-tile" href={l.url} target="_blank" rel="noopener">
          <span class="bm-ico"><Icon icon={l.icon ?? ''} fallback="globe" size={22} /></span>
          <span class="bm-label">{l.title}</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .bm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 8px;
  }
  .bm-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    border-radius: var(--radius, 10px);
    background: var(--surface-2, rgba(127, 127, 127, 0.08));
    color: inherit;
    text-decoration: none;
    transition: background 0.15s ease;
  }
  .bm-tile:hover {
    background: var(--surface-3, rgba(127, 127, 127, 0.16));
  }
  .bm-label {
    font-size: 0.78rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  @media (prefers-reduced-motion: reduce) {
    .bm-tile { transition: none; }
  }
</style>
```

- [ ] **Step 4: Wire it into WidgetHost**

In `src/web/src/components/WidgetHost.svelte`: add the import near the other widget imports:

```ts
  import Bookmarks from '../widgets/Bookmarks.svelte';
```

And add the branch before the closing `{/if}` (after the `speedtest` branch, line ~69):

```svelte
{:else if widget.type === 'bookmarks'}
  <Bookmarks title={widget.title} integrationId={widget.integrationId} />
```

- [ ] **Step 5: Build to typecheck**

Run: `bun run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/lib/stores.ts src/web/src/lib/types.ts src/web/src/widgets/Bookmarks.svelte src/web/src/components/WidgetHost.svelte
git commit -m "feat(web): add bookmarks widget rendering"
```

---

### Task 5: Settings — links editor + favicon auto-fetch

**Files:**
- Modify: `src/web/src/Settings.svelte` (script: state helpers + `cleanConfig`; template: list-field branch; `TYPE_ICONS`)

**Interfaces:**
- Consumes: `formConfig` state, `GET /api/favicon` (Task 2).
- Produces: a `links` list editor for the bookmarks integration type; favicon populated into a link's `icon` on URL blur when empty.

- [ ] **Step 1: Add the TYPE_ICONS entry**

In `src/web/src/Settings.svelte`, add to the `TYPE_ICONS` map:

```ts
    bookmarks: 'lucide:layout-grid',
```

- [ ] **Step 2: Add the links editor helpers**

In the `<script>` block (near the `sites`/`addSite` helpers), add:

```ts
  type LinkForm = { title?: string; url?: string; icon?: string };
  function links(key: string): LinkForm[] {
    const v = formConfig[key];
    return Array.isArray(v) ? (v as LinkForm[]) : [];
  }
  function addLink(key: string) {
    formConfig = { ...formConfig, [key]: [...links(key), { title: '', url: '', icon: '' }] };
  }
  function removeLink(key: string, i: number) {
    formConfig = { ...formConfig, [key]: links(key).filter((_, idx) => idx !== i) };
  }
  function updateLink(key: string, i: number, patch: Partial<LinkForm>) {
    formConfig = {
      ...formConfig,
      [key]: links(key).map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    };
  }
  async function fetchFavicon(key: string, i: number) {
    const link = links(key)[i];
    if (!link?.url?.trim() || link.icon?.trim()) return;
    try {
      const res = await fetch(`/api/favicon?url=${encodeURIComponent(link.url.trim())}`);
      const data = (await res.json()) as { icon: string | null };
      if (data.icon) updateLink(key, i, { icon: data.icon });
    } catch {
      /* leave icon empty — falls back to a glyph */
    }
  }
```

- [ ] **Step 3: Add the `links` branch to `cleanConfig`**

In the `cleanConfig` function's `for (const [k, v] …)` loop, add a branch alongside the `sites` / `icsUrls` branches:

```ts
      } else if (k === 'links' && Array.isArray(v)) {
        out[k] = (v as LinkForm[])
          .map((l) => ({
            title: (l.title ?? '').trim() || (l.url ?? '').trim(),
            url: (l.url ?? '').trim(),
            ...(l.icon?.trim() ? { icon: l.icon.trim() } : {}),
          }))
          .filter((l) => l.url);
```

- [ ] **Step 4: Add the template branch for the links field**

In the form template, where list fields are dispatched (`{#if field.key === 'sites'} … {:else if field.key === 'icsUrls'} …`), add a branch for `links`:

```svelte
          {:else if field.key === 'links'}
            <div class="sites-editor">
              {#each links(field.key) as l, i}
                <div class="site-row">
                  <input
                    type="text"
                    placeholder="Title"
                    value={l.title ?? ''}
                    oninput={(e) => updateLink(field.key, i, { title: e.currentTarget.value })}
                  />
                  <input
                    type="text"
                    placeholder="https://service.lan"
                    value={l.url ?? ''}
                    oninput={(e) => updateLink(field.key, i, { url: e.currentTarget.value })}
                    onblur={() => fetchFavicon(field.key, i)}
                  />
                  <input
                    type="text"
                    placeholder="Icon (auto)"
                    value={l.icon ?? ''}
                    oninput={(e) => updateLink(field.key, i, { icon: e.currentTarget.value })}
                  />
                  <span class="ibox"><Icon icon={l.icon ?? ''} fallback="globe" size={18} /></span>
                  <button type="button" class="btn-icon danger" onclick={() => removeLink(field.key, i)} aria-label="Remove link" title="Remove link">
                    <Trash2 size={15} />
                  </button>
                </div>
              {/each}
              <button type="button" class="btn-add-site" onclick={() => addLink(field.key)}>
                <Plus size={14} /> Add link
              </button>
            </div>
```

> NOTE: reuse the existing `sites-editor` / `site-row` / `btn-add-site` classes already styled in this file. Confirm those class names exist in the monitor `sites` branch and match.

- [ ] **Step 5: Build to typecheck**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run `bun run dev` and `cd src/web && bun run dev`; open the Vite URL → Manage Services → Add → Bookmarks. Add a link with a public URL (e.g. `https://github.com`), blur the URL field, confirm the icon auto-fills. Save. Place a `bookmarks` widget by exporting the dashboard (Task 6), adding a `{type:'bookmarks', title, integrationId:<new id>}` widget to a column, and importing — confirm the tile grid renders.

- [ ] **Step 7: Commit**

```bash
git add src/web/src/Settings.svelte
git commit -m "feat(web): add bookmarks links editor with favicon auto-fetch"
```

---

### Task 6: Settings — export / import backup buttons

**Files:**
- Modify: `src/web/src/Settings.svelte` (template header + handlers)

**Interfaces:**
- Consumes: `GET /api/backup`, `POST /api/restore` (Task 3).
- Produces: Export and Import buttons in the "Manage Services" header.

- [ ] **Step 1: Add the handlers**

In the `<script>` block of `src/web/src/Settings.svelte`, add:

```ts
  let importing = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  function exportBackup() {
    window.location.href = '/api/backup';
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('This replaces ALL services and your dashboard layout with the backup’s contents. Continue?')) return;
    importing = true;
    error = null;
    try {
      const text = await file.text();
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to restore backup');
      }
      window.location.reload();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore backup';
    } finally {
      importing = false;
    }
  }
```

- [ ] **Step 2: Add the buttons to the header**

In the template, inside `.settings-bar` (after the `.settings-heading` div), add:

```svelte
    <div class="settings-actions">
      <button type="button" class="btn-cancel" onclick={exportBackup} title="Download a full backup (includes credentials)">
        Export backup
      </button>
      <button type="button" class="btn-cancel" onclick={() => fileInput?.click()} disabled={importing}>
        {importing ? 'Importing…' : 'Import backup'}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json"
        style="display:none"
        onchange={onImportFile}
      />
    </div>
    <p class="settings-sub" style="margin-top:6px">⚠️ Backups contain plaintext credentials — store them securely.</p>
```

> NOTE: reuse the existing `btn-cancel` button class for styling consistency, or add a `.settings-actions { display:flex; gap:8px; }` rule if the layout needs it. Keep within the existing header markup.

- [ ] **Step 3: Build to typecheck**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke**

`bun run dev` + `cd src/web && bun run dev` → Manage Services → click **Export backup**, confirm a `labby-backup-<date>.json` downloads with `dashboard` + `integrations`. Edit it (e.g. add a bookmarks widget to a column), click **Import backup**, choose the file, confirm the dialog, confirm the page reloads with the change applied.

- [ ] **Step 5: Final full check**

Run: `bun test && bun run build`
Expected: all server tests PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/Settings.svelte
git commit -m "feat(web): add backup export/import buttons to Manage Services"
```

---

## Self-Review

**Spec coverage:**
- §1 schema bookmarks variant → Task 1. ✓
- §2 export `/api/backup` + restore `/api/restore` + `replaceAllIntegrations` + UI buttons → Task 3 + Task 6. ✓
- §3 bookmarks registry type + render + editor → Task 1 (type), Task 4 (render), Task 5 (editor). ✓ (Spec's "one-time `/data` fetch" is satisfied by the existing `getStore`/`bootstrapStores` SSE path — no new endpoint, documented in Architecture.)
- §4 favicon endpoint + frontend wiring + URL storage → Task 2 + Task 5. ✓
- §5 tests: `backup.test.ts` (Task 3), `registry.test.ts` bookmarks (Task 1), `favicon.test.ts` (Task 2). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The two `NOTE` blocks point to a Step-1 assertion correction and class-name reuse — both concrete, not deferrals.

**Type consistency:** `BookmarksData`/`BookmarkLink` (stores.ts) used by `Bookmarks.svelte`; `LinkForm` is the Settings editor shape and serializes to `{title,url,icon?}` matching `BookmarkLink`; `replaceAllIntegrations(rows: IntegrationRow[])` signature matches its caller in `/api/restore`; integration count `15→16` updated in `registry.test.ts` (2 spots) and `app.integrations.test.ts` (1 spot).

**Known deviation from spec (intentional):** the favicon "fetch throws" test returns the `/favicon.ico` fallback (not `null`) because the resolver fails soft to the conventional path for any *valid* URL; only invalid URLs return `null`. Step 1/Step 4 of Task 2 call this out explicitly.
