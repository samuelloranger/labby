# Integration-Driven Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Labby's separate dashboard layout (pages/columns/widgets JSON); the dashboard becomes the ordered list of enabled integrations, each rendered as its widget, reordered by drag-and-drop on the config page.

**Architecture:** Add a `position` column to `integrations`; render the board directly from `listIntegrations()`; move per-widget display options into each integration's `config`; shrink the stored dashboard to `{title, theme}`; a one-time migration folds the existing layout's order + options into the integrations so the live board survives.

**Tech Stack:** Bun, Hono, Zod, bun:sqlite, Svelte 5 (runes), bun:test.

## Global Constraints

- TypeScript strict everywhere; validate untrusted input with Zod.
- Server types (`src/server/...`) and web types (`src/web/src/lib/types.ts`, `stores.ts`) are duplicated by design — keep them in sync.
- Integrations fail soft: `fetch` returns `Payload | {error}`, never throws.
- Tests colocated, `bun:test`; endpoint tests use `app.request(path, opts)`; DB tests call db functions directly and clean up by unique name; `fetch` is mocked.
- Single masonry flow; no pages, no columns. Order = `position ASC, id ASC`.
- Drag reorder uses native HTML5 DnD — **no new dependency**.
- Display options live in integration `config`: monitor `variant`(rows/tiles)+`style`(default/compact); `max` on qbittorrent, transmission, beszel, radarr, sonarr, reelward, reddit, hackernews, calendar; beszel `systems` retained.
- Run server tests with `bun test`; build/typecheck frontend with `bun run build`.

---

### Task 1: `position` column, ordering, reorder helper

**Files:**
- Modify: `src/server/db.ts`
- Test: `src/server/db.integrations.test.ts`

**Interfaces:**
- Produces: `IntegrationRow.position: number`; `listIntegrations()` ordered by `position, id`; `createIntegration` auto-assigns `position`; `reorderIntegrations(orderedIds: number[]): void`; `replaceAllIntegrations` inserts `position`.

- [ ] **Step 1: Write failing tests**

Append to `src/server/db.integrations.test.ts`:

```ts
import { reorderIntegrations } from './db';

test('position is assigned on create and returned in order', () => {
  const tag = '__pos_test__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const a = createIntegration({ name: `${tag}a`, type: 'radarr', config: {}, enabled: true, refreshSeconds: null });
  const b = createIntegration({ name: `${tag}b`, type: 'sonarr', config: {}, enabled: true, refreshSeconds: null });
  try {
    expect(typeof a.position).toBe('number');
    expect(b.position).toBeGreaterThan(a.position);
    reorderIntegrations([b.id, a.id]);
    const ordered = listIntegrations().filter((r) => r.name.startsWith(tag));
    expect(ordered[0].id).toBe(b.id);
    expect(ordered[1].id).toBe(a.id);
  } finally {
    deleteIntegration(a.id);
    deleteIntegration(b.id);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/server/db.integrations.test.ts`
Expected: FAIL — `reorderIntegrations` not exported / `position` undefined.

- [ ] **Step 3: Add migration + column handling**

In `src/server/db.ts`, add a migration to the `migrations` array (next version number after the current highest — currently 4, so use 5):

```ts
  {
    version: 5,
    name: 'integration_position',
    up: `
      ALTER TABLE integrations ADD COLUMN position INTEGER;
      UPDATE integrations SET position = id WHERE position IS NULL;
    `,
  },
```

- [ ] **Step 4: Update `IntegrationRow`, `Raw`, `toRow`, CRUD, and add `reorderIntegrations`**

In `src/server/db.ts`:

Add `position: number;` to the `IntegrationRow` type and `position: number | null;` to the `Raw` type. Update `toRow`:

```ts
const toRow = (r: Raw): IntegrationRow => ({
  id: r.id,
  name: r.name,
  type: r.type,
  config: JSON.parse(r.config),
  enabled: !!r.enabled,
  refreshSeconds: r.refresh_seconds,
  position: r.position ?? r.id,
});
```

Change `listIntegrations`:

```ts
export function listIntegrations(): IntegrationRow[] {
  return (db.query('SELECT * FROM integrations ORDER BY position, id').all() as Raw[]).map(toRow);
}
```

Change `createIntegration` to assign the next position (insert then it gets one). Replace the INSERT to include position:

```ts
export function createIntegration(input: Omit<IntegrationRow, 'id' | 'position'>): IntegrationRow {
  const nextPos =
    (db.query('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM integrations').get() as { p: number }).p;
  const info = db
    .query(
      'INSERT INTO integrations (name, type, config, enabled, refresh_seconds, position) VALUES ($name,$type,$config,$enabled,$rs,$pos)',
    )
    .run({
      $name: input.name,
      $type: input.type,
      $config: JSON.stringify(input.config),
      $enabled: input.enabled ? 1 : 0,
      $rs: input.refreshSeconds,
      $pos: nextPos,
    });
  return getIntegration(Number(info.lastInsertRowid)) as IntegrationRow;
}
```

> NOTE: `createIntegration`'s param type changes to `Omit<IntegrationRow, 'id' | 'position'>`. Check callers: `app.ts` `POST /api/integrations` builds the object from the request body — it does not pass `position`, so it already satisfies the new type. `updateIntegration` takes `Omit<IntegrationRow, 'id'>` — leave it; it will receive `position` from the edited row, which is fine (it does not write position, see below). To keep `updateIntegration` from dropping position, leave its SQL as-is (it never touched position; position is preserved across updates because the column isn't in its UPDATE statement).

Add `reorderIntegrations`:

```ts
export function reorderIntegrations(orderedIds: number[]): void {
  const tx = db.transaction((ids: number[]) => {
    const stmt = db.query('UPDATE integrations SET position = $pos WHERE id = $id');
    ids.forEach((id, idx) => stmt.run({ $id: id, $pos: idx }));
  });
  tx(orderedIds);
}
```

Update `replaceAllIntegrations` (added in the earlier backup feature) to insert `position`:

```ts
export function replaceAllIntegrations(rows: IntegrationRow[]): void {
  const tx = db.transaction((list: IntegrationRow[]) => {
    db.query('DELETE FROM integrations').run();
    const stmt = db.query(
      'INSERT INTO integrations (id, name, type, config, enabled, refresh_seconds, position) VALUES ($id,$name,$type,$config,$enabled,$rs,$pos)',
    );
    for (const r of list) {
      stmt.run({
        $id: r.id,
        $name: r.name,
        $type: r.type,
        $config: JSON.stringify(r.config),
        $enabled: r.enabled ? 1 : 0,
        $rs: r.refreshSeconds,
        $pos: r.position ?? r.id,
      });
    }
  });
  tx(rows);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/server/db.integrations.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite (catch caller breakage)**

Run: `bun test`
Expected: PASS (existing create/list/backup tests still green).

- [ ] **Step 7: Commit**

```bash
git add src/server/db.ts src/server/db.integrations.test.ts
git commit -m "feat(server): add integration position column, ordering, and reorder helper"
```

---

### Task 2: Shrink dashboard schema + add display-option registry fields

**Files:**
- Modify: `src/server/config/schema.ts`
- Modify: `src/server/integrations/registry.ts`
- Test: `src/server/config/schema.test.ts`, `src/server/integrations/registry.test.ts`

**Interfaces:**
- Produces: `DashboardSchema` = `{ title, theme }`; `Dashboard` type without `pages`; registry types gain display fields.
- Removes: `WidgetSchema`, `ColumnSchema`, `PageSchema`, `Widget` type.

- [ ] **Step 1: Update schema tests (failing)**

In `src/server/config/schema.test.ts`, add (and remove any test that asserts `pages` is required):

```ts
import { DashboardSchema } from './schema';

test('DashboardSchema accepts {title, theme} without pages', () => {
  const parsed = DashboardSchema.parse({ title: 'Home', theme: { default: 'dark' } });
  expect(parsed.title).toBe('Home');
});

test('DashboardSchema ignores a legacy pages field', () => {
  const parsed = DashboardSchema.parse({ title: 'X', theme: { default: 'system' }, pages: [{ junk: true }] });
  expect((parsed as any).pages).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/server/config/schema.test.ts`
Expected: FAIL (current schema requires `pages`).

- [ ] **Step 3: Shrink the schema**

In `src/server/config/schema.ts`:
- Delete `WidgetSchema`, `ColumnSchema`, `PageSchema`, and the `Widget` type export.
- Keep `SiteSchema`, `ThemeConfigSchema`, `ThemeSchema`, `LayoutSchema`, `DensitySchema` (theme + monitor config still use them).
- Replace `DashboardSchema`:

```ts
export const DashboardSchema = z.object({
  title: z.string().default('Labby'),
  theme: ThemeConfigSchema.default({ default: 'system', layout: 'masonry' }),
});

export type Dashboard = z.infer<typeof DashboardSchema>;
export type Site = z.infer<typeof SiteSchema>;
```

(Zod strips unknown keys by default, so a stored dashboard still carrying `pages` parses cleanly with `pages` dropped.)

- [ ] **Step 4: Run schema tests**

Run: `bun test src/server/config/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Add display-option fields to the registry (failing test first)**

In `src/server/integrations/registry.test.ts`, add:

```ts
test('monitor exposes variant and style display fields', () => {
  const keys = INTEGRATIONS.monitor.fields.map((f) => f.key);
  expect(keys).toContain('variant');
  expect(keys).toContain('style');
});

test('feed/arr/calendar/download/beszel types expose a max field', () => {
  for (const t of ['qbittorrent', 'transmission', 'beszel', 'radarr', 'sonarr', 'reelward', 'reddit', 'hackernews', 'calendar'] as const) {
    expect(INTEGRATIONS[t].fields.map((f) => f.key)).toContain('max');
  }
});
```

- [ ] **Step 6: Run to verify failure**

Run: `bun test src/server/integrations/registry.test.ts`
Expected: FAIL.

- [ ] **Step 7: Add the fields**

In `src/server/integrations/registry.ts`, add to the `fields` arrays:
- `monitor.fields`: append `{ key: 'variant', label: 'Display', kind: 'select', options: ['rows', 'tiles'] }` and `{ key: 'style', label: 'Density', kind: 'select', options: ['default', 'compact'] }`.
- `qbittorrent.fields`, `transmission.fields`: append `{ key: 'max', label: 'Max items', kind: 'number' }`.
- `beszel.fields`: append `{ key: 'max', label: 'Max systems', kind: 'number' }`.
- `radarr.fields`, `sonarr.fields`, `reelward.fields`: append `{ key: 'max', label: 'Max items', kind: 'number' }`.
- `reddit.fields`, `hackernews.fields`: append `{ key: 'max', label: 'Max items', kind: 'number' }`.
- `calendar.fields`: append `{ key: 'max', label: 'Max events', kind: 'number' }`.

(`hackernews.fields` is currently `[]` — make it `[{ key: 'max', label: 'Max items', kind: 'number' }]`.)

- [ ] **Step 8: Run registry + full suite**

Run: `bun test src/server/integrations/registry.test.ts && bun test`
Expected: PASS. (If any test imported `Widget`/`WidgetSchema` from schema, update it; grep `WidgetSchema` to confirm none remain: `grep -rn "WidgetSchema\|PageSchema\|ColumnSchema" src/server` should return nothing.)

- [ ] **Step 9: Commit**

```bash
git add src/server/config/schema.ts src/server/integrations/registry.ts src/server/config/schema.test.ts src/server/integrations/registry.test.ts
git commit -m "feat(server): shrink dashboard schema to title+theme, add display-option fields"
```

---

### Task 3: Reorder endpoint + restore schema update

**Files:**
- Modify: `src/server/app.ts`
- Test: `src/server/backup.test.ts` (append) or a new `src/server/app.reorder.test.ts`

**Interfaces:**
- Consumes: `reorderIntegrations`, `listIntegrations` (Task 1); `DashboardSchema` (Task 2).
- Produces: `POST /api/integrations/reorder` body `{ ids: number[] }` → `{ ok: true }`; `RestoreSchema` integrations rows include `position`.

- [ ] **Step 1: Write the endpoint test (failing)**

Create `src/server/app.reorder.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { app } from './app';
import { createIntegration, deleteIntegration, listIntegrations } from './db';

test('POST /api/integrations/reorder sets the given order', async () => {
  const tag = '__reorder_api__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const a = createIntegration({ name: `${tag}a`, type: 'radarr', config: {}, enabled: true, refreshSeconds: null });
  const b = createIntegration({ name: `${tag}b`, type: 'sonarr', config: {}, enabled: true, refreshSeconds: null });
  try {
    const res = await app.request('/api/integrations/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [b.id, a.id] }),
    });
    expect(res.status).toBe(200);
    const ordered = listIntegrations().filter((r) => r.name.startsWith(tag));
    expect(ordered[0].id).toBe(b.id);
  } finally {
    deleteIntegration(a.id);
    deleteIntegration(b.id);
  }
});

test('POST /api/integrations/reorder rejects a non-array body with 400', async () => {
  const res = await app.request('/api/integrations/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: 'nope' }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/server/app.reorder.test.ts`
Expected: FAIL — route is 404.

- [ ] **Step 3: Add the route + import**

In `src/server/app.ts`, add `reorderIntegrations` to the `./db` import, and add the route near the other `/api/integrations` routes:

```ts
app.post('/api/integrations/reorder', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid reorder payload' }, 400);
  reorderIntegrations(parsed.data.ids);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Update RestoreSchema to carry position**

In `src/server/app.ts`, in `RestoreSchema`, add `position` to the integrations row object:

```ts
  integrations: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      type: z.string(),
      config: z.record(z.unknown()),
      enabled: z.boolean(),
      refreshSeconds: z.number().int().nullable(),
      position: z.number().int().optional(),
    }),
  ),
```

(`position` optional tolerates backups taken before this change; `replaceAllIntegrations` falls back to `id`.)

- [ ] **Step 5: Run reorder + backup tests + full suite**

Run: `bun test src/server/app.reorder.test.ts src/server/backup.test.ts && bun test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/app.ts src/server/app.reorder.test.ts
git commit -m "feat(server): add integration reorder endpoint, carry position in restore"
```

---

### Task 4: One-time layout→integrations migration

**Files:**
- Create: `src/server/config/migrate-layout.ts`
- Create: `src/server/config/migrate-layout.test.ts`
- Modify: `src/server/index.ts` (invoke once at startup)

**Interfaces:**
- Consumes: `getSetting`, `setSetting`, `listIntegrations`, `updateIntegration`, `reorderIntegrations` (db.ts).
- Produces: `migrateLayoutToIntegrations(): void` — idempotent (guarded by a `settings` flag `layout_migrated`).

- [ ] **Step 1: Write the migration test (failing)**

Create `src/server/config/migrate-layout.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { createIntegration, deleteIntegration, getIntegration, getSetting, listIntegrations, setSetting, deleteSetting } from '../db';
import { migrateLayoutToIntegrations } from './migrate-layout';

test('migration folds widget options + order into integrations and rewrites dashboard', () => {
  const tag = '__migrate__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const savedDash = getSetting('dashboard');
  const savedFlag = getSetting('layout_migrated');
  deleteSetting('layout_migrated');

  const m = createIntegration({ name: `${tag}mon`, type: 'monitor', config: { sites: [] }, enabled: true, refreshSeconds: null });
  const f = createIntegration({ name: `${tag}feed`, type: 'reddit', config: { subreddits: ['x'] }, enabled: true, refreshSeconds: null });

  // legacy dashboard: feed first, monitor second; options on widgets
  setSetting('dashboard', JSON.stringify({
    title: 'My Board',
    theme: { default: 'dark' },
    pages: [{ name: 'Home', columns: [{ size: 'full', widgets: [
      { type: 'reddit', integrationId: f.id, max: 9 },
      { type: 'monitor', integrationId: m.id, variant: 'tiles', style: 'compact' },
    ] }] }],
  }));

  try {
    migrateLayoutToIntegrations();
    // options merged into config
    expect(getIntegration(f.id)?.config.max).toBe(9);
    expect(getIntegration(m.id)?.config.variant).toBe('tiles');
    expect(getIntegration(m.id)?.config.style).toBe('compact');
    // order: feed (first widget) before monitor
    expect(getIntegration(f.id)!.position).toBeLessThan(getIntegration(m.id)!.position);
    // dashboard rewritten without pages, title/theme kept
    const dash = JSON.parse(getSetting('dashboard') as string);
    expect(dash.pages).toBeUndefined();
    expect(dash.title).toBe('My Board');
    expect(dash.theme.default).toBe('dark');
    // idempotent: second run is a no-op (flag set)
    expect(getSetting('layout_migrated')).toBe('1');
  } finally {
    deleteIntegration(m.id);
    deleteIntegration(f.id);
    if (savedDash !== null) setSetting('dashboard', savedDash);
    if (savedFlag !== null) setSetting('layout_migrated', savedFlag); else deleteSetting('layout_migrated');
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/server/config/migrate-layout.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the migration**

Create `src/server/config/migrate-layout.ts`:

```ts
import { getSetting, listIntegrations, reorderIntegrations, setSetting, updateIntegration } from '../db';

const DISPLAY_KEYS = ['max', 'variant', 'style', 'systems'] as const;

// One-time: fold the legacy pages/columns/widgets layout into the integrations
// (display options -> config, widget order -> position), then rewrite the
// dashboard row to just {title, theme}. Guarded by the `layout_migrated` flag.
export function migrateLayoutToIntegrations(): void {
  if (getSetting('layout_migrated') === '1') return;

  const raw = getSetting('dashboard');
  if (!raw) {
    setSetting('layout_migrated', '1');
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    setSetting('layout_migrated', '1');
    return;
  }

  if (Array.isArray(parsed?.pages)) {
    const byId = new Map(listIntegrations().map((r) => [r.id, r]));
    const orderedIds: number[] = [];

    for (const page of parsed.pages) {
      for (const col of page?.columns ?? []) {
        for (const w of col?.widgets ?? []) {
          const row = byId.get(w?.integrationId);
          if (!row) continue;
          if (!orderedIds.includes(row.id)) orderedIds.push(row.id);
          const merged = { ...row.config };
          for (const k of DISPLAY_KEYS) {
            if (w[k] !== undefined && merged[k] === undefined) merged[k] = w[k];
          }
          updateIntegration(row.id, { ...row, config: merged });
        }
      }
    }

    // any integration not referenced by a widget keeps its place after the rest
    for (const r of listIntegrations()) if (!orderedIds.includes(r.id)) orderedIds.push(r.id);
    reorderIntegrations(orderedIds);
  }

  setSetting('dashboard', JSON.stringify({
    title: parsed?.title ?? 'Labby',
    theme: parsed?.theme ?? { default: 'system' },
  }, null, 2));
  setSetting('layout_migrated', '1');
}
```

- [ ] **Step 4: Run migration test**

Run: `bun test src/server/config/migrate-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Invoke at startup**

In `src/server/index.ts`, import and call it once before the scheduler starts (after migrations run on db import). Add near the top of the startup sequence:

```ts
import { migrateLayoutToIntegrations } from './config/migrate-layout';
// ... after imports / before initScheduler():
migrateLayoutToIntegrations();
```

(Find the existing startup block that calls `loadConfig()` / `initScheduler()` and place the call before `loadConfig()` so the reload reads the rewritten dashboard.)

- [ ] **Step 6: Run full suite + build**

Run: `bun test && bun run build`
Expected: PASS, build clean.

- [ ] **Step 7: Commit**

```bash
git add src/server/config/migrate-layout.ts src/server/config/migrate-layout.test.ts src/server/index.ts
git commit -m "feat(server): one-time migration folding layout into integrations"
```

---

### Task 5: Frontend render from integrations (App, WidgetHost, Header, types)

**Files:**
- Modify: `src/web/src/lib/types.ts`
- Modify: `src/web/src/components/WidgetHost.svelte`
- Modify: `src/web/src/App.svelte`
- Modify: `src/web/src/components/Header.svelte`

**Interfaces:**
- Consumes: `getStore`, `BookmarksData`/widget data types (stores.ts), `/api/integrations`.
- Produces: `Dashboard = { title, theme }`; `IntegrationRow` with `position`; `WidgetHost` prop `{ integration }`.

- [ ] **Step 1: Update web types**

In `src/web/src/lib/types.ts`:
- Delete the `Widget`, `Column`, `Page` types.
- Replace `Dashboard`:

```ts
export type Dashboard = {
  title: string;
  theme: {
    default: ThemeName;
    layout: LayoutType;
    density?: 'default' | 'compact';
    customCss?: string;
  };
};
```

- Add `position: number;` to `IntegrationRow`.

- [ ] **Step 2: Rewrite WidgetHost to key on the integration**

Replace `src/web/src/components/WidgetHost.svelte` script + markup:

```svelte
<script lang="ts">
  import Monitor from '../widgets/Monitor.svelte';
  import Docker from '../widgets/Docker.svelte';
  import Downloads from '../widgets/Downloads.svelte';
  import AdGuard from '../widgets/AdGuard.svelte';
  import Jellyfin from '../widgets/Jellyfin.svelte';
  import Beszel from '../widgets/Beszel.svelte';
  import Arr from '../widgets/Arr.svelte';
  import Reelward from '../widgets/Reelward.svelte';
  import Feed from '../widgets/Feed.svelte';
  import Weather from '../widgets/Weather.svelte';
  import Calendar from '../widgets/Calendar.svelte';
  import Speedtest from '../widgets/Speedtest.svelte';
  import Bookmarks from '../widgets/Bookmarks.svelte';
  import type { IntegrationRow } from '$lib/types';

  let { integration }: { integration: IntegrationRow } = $props();
  const c = $derived(integration.config as Record<string, any>);
  const id = $derived(integration.id);
  const title = $derived(integration.name);
</script>

{#if integration.type === 'monitor'}
  <Monitor {title} integrationId={id} style={c.style} variant={c.variant ?? 'rows'} headerIcon={c.variant === 'tiles' ? 'lucide:layout-grid' : 'lucide:activity'} />
{:else if integration.type === 'docker'}
  <Docker {title} integrationId={id} />
{:else if integration.type === 'qbittorrent' || integration.type === 'transmission'}
  <Downloads {title} integrationId={id} client={integration.type} max={c.max} />
{:else if integration.type === 'adguard'}
  <AdGuard {title} integrationId={id} />
{:else if integration.type === 'jellyfin'}
  <Jellyfin {title} integrationId={id} />
{:else if integration.type === 'beszel'}
  <Beszel {title} integrationId={id} systems={c.systems} max={c.max} />
{:else if integration.type === 'radarr' || integration.type === 'sonarr'}
  <Arr {title} integrationId={id} kind={integration.type} max={c.max} />
{:else if integration.type === 'reelward'}
  <Reelward {title} integrationId={id} max={c.max} />
{:else if integration.type === 'reddit'}
  <Feed {title} integrationId={id} icon="di:reddit" fallback="message-square" max={c.max} />
{:else if integration.type === 'hackernews'}
  <Feed {title} integrationId={id} icon="di:hacker-news" fallback="flame" max={c.max} />
{:else if integration.type === 'weather'}
  <Weather {title} integrationId={id} />
{:else if integration.type === 'calendar'}
  <Calendar {title} integrationId={id} max={c.max} />
{:else if integration.type === 'speedtest'}
  <Speedtest {title} integrationId={id} max={c.max} />
{:else if integration.type === 'bookmarks'}
  <Bookmarks {title} integrationId={id} />
{/if}
```

- [ ] **Step 3: Rewrite App.svelte to render the integration list**

Replace `src/web/src/App.svelte`:

```svelte
<script lang="ts">
  import WidgetHost from './components/WidgetHost.svelte';
  import Header from './components/Header.svelte';
  import { initStream } from '$lib/stores';
  import type { Dashboard, IntegrationRow } from '$lib/types';
  import { onMount } from 'svelte';

  let { config }: { config: Dashboard } = $props();
  let integrations = $state<IntegrationRow[]>([]);

  const visible = $derived(
    [...integrations].filter((r) => r.enabled).sort((a, b) => a.position - b.position || a.id - b.id),
  );

  onMount(() => {
    void fetch('/api/integrations')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: IntegrationRow[]) => {
        integrations = rows;
      });
    return initStream();
  });
</script>

<Header {config} {integrations} />

<main class="page">
  <div class="grid">
    {#each visible as integration (integration.id)}
      <WidgetHost {integration} />
    {/each}
  </div>
</main>
```

- [ ] **Step 4: Fix Header — monitor IDs from integrations, drop layout radio**

In `src/web/src/components/Header.svelte`:
- Change props: `let { config, integrations = [] }: { config: Dashboard; integrations?: IntegrationRow[] } = $props();` and import `IntegrationRow` from `$lib/types`.
- Replace the `monitorIds` derivation (the `for (const page of config.pages)` block) with:

```ts
  const monitorIds = $derived(
    integrations.filter((r) => r.type === 'monitor' && r.enabled).map((r) => r.id),
  );
```

- Remove the Layout radio group from the Customize modal (the `.settings-group` containing `name="layout"`), the `previewLayout` function, and the `layout` state — single masonry only. Leave `density`, `customCss`, `theme`. In `saveSettings`, drop `layout` from the POST body (or keep sending the current value; simpler to omit). `/api/theme` ignores missing layout.

> NOTE: confirm no remaining reference to `config.pages` anywhere: `grep -rn "\.pages" src/web/src` must return nothing after this task.

- [ ] **Step 5: Build to typecheck**

Run: `bun run build`
Expected: build succeeds, no TS/Svelte errors. If `grep -rn "\.pages" src/web/src` returns hits, fix them.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/lib/types.ts src/web/src/components/WidgetHost.svelte src/web/src/App.svelte src/web/src/components/Header.svelte
git commit -m "feat(web): render dashboard from ordered integrations, drop pages/columns"
```

---

### Task 6: Drag-and-drop reordering on the config page

**Files:**
- Modify: `src/web/src/Settings.svelte`

**Interfaces:**
- Consumes: `POST /api/integrations/reorder` (Task 3); `rows` state (existing `IntegrationRow[]`).

- [ ] **Step 1: Add reorder state + handler (script)**

In `src/web/src/Settings.svelte` `<script>`, add:

```ts
  let dragIndex = $state<number | null>(null);

  async function persistOrder() {
    try {
      await fetch('/api/integrations/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rows.map((r) => r.id) }),
      });
    } catch {
      /* order will resync on next load */
    }
  }

  function onDragStart(i: number) {
    dragIndex = i;
  }
  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    rows = next;
    dragIndex = i;
  }
  function onDrop() {
    dragIndex = null;
    void persistOrder();
  }
```

- [ ] **Step 2: Make service cards draggable (template)**

In the `{#each rows as row}` service-card loop, change the wrapper to track index and accept drag events, and add a handle. Replace the loop opening:

```svelte
      {#each rows as row, i (row.id)}
        <div
          class="svc-card"
          class:dragging={dragIndex === i}
          draggable="true"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => onDragOver(e, i)}
          ondrop={onDrop}
          ondragend={onDrop}
        >
          <div class="svc-head">
            <span class="drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
            <span class="svc-mark"><Icon icon={TYPE_ICONS[row.type] ?? 'lucide:box'} fallback="box" size={20} /></span>
```

(Keep the rest of the card markup unchanged — the `svc-title`, `row-actions`, etc.)

- [ ] **Step 3: Add styles**

In the Settings `<style>`, add:

```css
  .svc-card[draggable='true'] { cursor: default; }
  .svc-card.dragging { opacity: 0.5; }
  .drag-handle {
    cursor: grab;
    color: var(--ink-faint);
    font-size: 18px;
    line-height: 1;
    user-select: none;
    padding-right: 2px;
  }
  .drag-handle:active { cursor: grabbing; }
```

- [ ] **Step 4: Build to typecheck**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke**

`bun run dev` + `cd src/web && bun run dev`. Open Manage Services, drag a card to a new position, reload — order persists. Open the dashboard — card order matches.

- [ ] **Step 6: Final full check**

Run: `bun test && bun run build`
Expected: server tests PASS, build clean.

- [ ] **Step 7: Commit**

```bash
git add src/web/src/Settings.svelte
git commit -m "feat(web): drag-and-drop reordering on Manage Services"
```

---

## Self-Review

**Spec coverage:**
- Single masonry flow, render from integrations → Task 5 (App). ✓
- `position` column + ordering + reorder helper → Task 1. ✓
- Reorder endpoint → Task 3; drag UI → Task 6. ✓
- Display options as registry config fields → Task 2; consumed in render → Task 5 (WidgetHost). ✓
- Schema shrink to `{title,theme}`, delete widget/column/page → Task 2. ✓
- One-time migration preserving order + options → Task 4. ✓
- Backup/restore carries position → Task 1 (`replaceAllIntegrations`) + Task 3 (`RestoreSchema`). ✓
- Header page tabs + monitorIds from pages → Task 5 (Header). ✓
- Web types drop Widget/Column/Page → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. `NOTE` blocks point to concrete caller checks (`createIntegration` param type, `grep .pages`), not deferrals.

**Type consistency:** `IntegrationRow.position` added in Task 1 (server) and Task 5 (web), used by `reorderIntegrations`, `replaceAllIntegrations`, App sort, restore schema. `WidgetHost` prop `{ integration: IntegrationRow }` matches App's `{integration}`. `createIntegration` param becomes `Omit<IntegrationRow,'id'|'position'>` — Task 1 NOTE confirms `app.ts` and migration callers don't pass those. `migrate-layout` uses `updateIntegration(id, {...row, config})` — `updateIntegration` keeps `Omit<IntegrationRow,'id'>` and ignores position (preserved). Registry `max`/`variant`/`style` field keys match WidgetHost's `c.max`/`c.variant`/`c.style` reads.

**Known ordering note:** Task 5 removes `config.pages` usage; Tasks 1-4 (backend) must land first so the shrunk schema + integrations data are ready, but each task's own tests pass independently. Frontend build (Task 5) is the first point the whole app renders the new way.
