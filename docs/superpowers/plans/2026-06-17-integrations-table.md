# Integrations Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every integration out of flat `settings` env-var rows into a first-class `integrations` table (id, name, type, JSON config, enabled), driven by a single per-type handler map, with each dashboard widget bound to a specific integration instance by `integrationId`.

**Architecture:** A new `integrations` SQLite table is the sole source of truth for what services exist and their credentials/config. `src/server/integrations/registry.ts` exports `INTEGRATIONS: Record<IntegrationType, IntegrationDef>` — each def declares its config field schema, a `fetch(config)` function, and optional `actions`. The SSE scheduler iterates table rows (not a fixed channel union), polling each enabled row on its own interval and publishing to channel `int:<id>`. Channels become dynamic strings; hub/SSE/web stores key by id. Widgets carry `integrationId` and only display options; per-instance config (monitor sites, subreddits, weather location, docker show) moves into the integration row.

**Tech Stack:** Bun, TypeScript (strict), Hono, `bun:sqlite`, Zod, Svelte 5, Vite.

## Global Constraints

- TypeScript strict everywhere; validate all external/config input with Zod or defensive parsing.
- Integrations must fail soft: every `fetch`/`action` returns `Payload | { error: string }`, never throws to the route.
- Server (`src/server/types.ts`) and web (`src/web/src/lib/stores.ts`) types are duplicated by design — keep both in sync on any payload-shape change.
- `@server/*` → `src/server/*`; `$lib` → `src/web/src/lib`.
- Tests colocated `*.test.ts`, mock `fetch`.
- **Clean break:** no migration of existing `settings` credential rows. The `dashboard` settings row is migrated into the new shape; old credential keys are dropped.
- `di:` slugs used in any seeded config must be present in `scripts/vendor-icons.ts` `SLUGS`.
- Single-run verification: `bun test` green and `bun run build` succeeds before the final commit.

## Integration types (the registry keys)

15 leaf types. `downloads` splits into `qbittorrent`/`transmission` (different creds → different defs).

| type | config fields (JSON) | has actions | replaces env |
|------|----------------------|-------------|--------------|
| `monitor` | `sites: Site[]` | — | (was widget `sites`) |
| `docker` | `roHost, rwHost, show` | start/stop/restart, logs | `DOCKER_RO_HOST, DOCKER_RW_HOST` |
| `qbittorrent` | `url, user, pass` | pause/resume | `QBIT_URL, QBIT_USER, QBIT_PASS` |
| `transmission` | `url, user, pass` | pause/resume | `TRANSMISSION_URL, TRANSMISSION_USER, TRANSMISSION_PASS` |
| `adguard` | `url, user, pass` | protection toggle | `ADGUARD_URL, ADGUARD_USER, ADGUARD_PASS` |
| `jellyfin` | `url, apiKey` | (image proxy) | `JELLYFIN_URL, JELLYFIN_API_KEY` |
| `beszel` | `url, user, pass, token` | — | `BESZEL_URL, BESZEL_USER, BESZEL_PASS, BESZEL_TOKEN` |
| `radarr` | `url, apiKey` | — | `RADARR_URL, RADARR_API_KEY` |
| `sonarr` | `url, apiKey` | — | `SONARR_URL, SONARR_API_KEY` |
| `reelward` | `url, apiKey` | — | `REELWARD_URL, REELWARD_API_KEY` |
| `reddit` | `subreddits: string[]` | — | (was widget `subreddit`) |
| `hackernews` | `{}` | — | — |
| `weather` | `apiKey, city?, lat?, lon?, units` | — | `OPENWEATHER_API_KEY` + widget loc |
| `calendar` | `icsUrls: string[]` | — | `CALENDAR_ICS_URLS` |
| `speedtest` | `url, apiToken` | run | `SPEEDTEST_TRACKER_URL, SPEEDTEST_TRACKER_API_TOKEN` |

Each row also carries `refreshSeconds` (per-instance, defaulting from the registry), replacing the dashboard-level `refreshSeconds` map.

---

## File Structure

**Server (new/changed)**
- `src/server/db.ts` — add `integrations` table migration + CRUD helpers; keep `settings` (now only holds `dashboard`). One responsibility: persistence.
- `src/server/integrations/registry.ts` — **new**. The `INTEGRATIONS` map + `IntegrationType`, `IntegrationDef`, field-schema types. The contract every other layer consumes.
- `src/server/integrations/*.ts` (15 files) — change each fetch/action fn to accept a typed `config` arg instead of reading `process.env`.
- `src/server/types.ts` — `Channel` becomes `string`; add `IntegrationRow`, `IntegrationConfig` types; keep payload types.
- `src/server/sse/hub.ts` — key by `string` channel.
- `src/server/sse/scheduler.ts` — rewrite to iterate table rows.
- `src/server/app.ts` — add `/api/integrations` CRUD + `/api/integrations/:id/data`; rewrite action routes to resolve config by id; drop `/api/settings` and per-type GETs; SSE event names already pass through `string`.
- `src/server/index.ts` — drop env injection from DB.
- `src/server/config/schema.ts` — widgets gain `integrationId`; drop per-instance widget config fields and the `collect*`/`refreshSeconds` helpers tied to them.

**Web (changed)**
- `src/web/src/lib/stores.ts` — replace fixed per-type stores with a dynamic `Map<integrationId, WidgetState>` + `getStore(id)`.
- `src/web/src/lib/types.ts` — add `IntegrationRow` + config field types.
- `src/web/src/widgets/*.svelte` (~13) — read store by `integrationId` prop.
- `src/web/src/Settings.svelte` — rewrite into integration-CRUD UI driven by registry field metadata fetched from `/api/integrations/types`.

---

## Phase 1 — Data model + registry

### Task 1: `integrations` table + CRUD helpers

**Files:**
- Modify: `src/server/db.ts`
- Test: `src/server/db.integrations.test.ts`

**Interfaces:**
- Produces: `listIntegrations(): IntegrationRow[]`, `getIntegration(id: number): IntegrationRow | null`, `createIntegration(input): IntegrationRow`, `updateIntegration(id, input): IntegrationRow | null`, `deleteIntegration(id): void`. `IntegrationRow = { id: number; name: string; type: string; config: Record<string, unknown>; enabled: boolean; refreshSeconds: number | null }`.

- [ ] **Step 1: Write the failing test**
```ts
import { expect, test } from 'bun:test';
import { createIntegration, deleteIntegration, getIntegration, listIntegrations, updateIntegration } from './db';

test('integration CRUD round-trips config as JSON', () => {
  const row = createIntegration({ name: 'Radarr 4K', type: 'radarr', config: { url: 'http://r', apiKey: 'k' }, enabled: true, refreshSeconds: 60 });
  expect(row.id).toBeGreaterThan(0);
  expect(getIntegration(row.id)?.config).toEqual({ url: 'http://r', apiKey: 'k' });
  const upd = updateIntegration(row.id, { ...row, name: 'Radarr HD' });
  expect(upd?.name).toBe('Radarr HD');
  expect(listIntegrations().some((r) => r.id === row.id)).toBe(true);
  deleteIntegration(row.id);
  expect(getIntegration(row.id)).toBeNull();
});
```

- [ ] **Step 2: Run test, verify it fails** — `bun test src/server/db.integrations.test.ts` → FAIL (functions not exported).

- [ ] **Step 3: Implement.** Add migration `version: 3, name: 'integrations_table'`:
```ts
{
  version: 3,
  name: 'integrations_table',
  up: `
    CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      refresh_seconds INTEGER
    );
  `,
},
```
Add helpers (after `getAllSettings`):
```ts
export type IntegrationRow = {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  refreshSeconds: number | null;
};

type Raw = { id: number; name: string; type: string; config: string; enabled: number; refresh_seconds: number | null };
const toRow = (r: Raw): IntegrationRow => ({
  id: r.id, name: r.name, type: r.type,
  config: JSON.parse(r.config), enabled: !!r.enabled, refreshSeconds: r.refresh_seconds,
});

export function listIntegrations(): IntegrationRow[] {
  return (db.query('SELECT * FROM integrations ORDER BY id').all() as Raw[]).map(toRow);
}
export function getIntegration(id: number): IntegrationRow | null {
  const r = db.query('SELECT * FROM integrations WHERE id = $id').get({ $id: id }) as Raw | null;
  return r ? toRow(r) : null;
}
export function createIntegration(input: Omit<IntegrationRow, 'id'>): IntegrationRow {
  const info = db.query(
    'INSERT INTO integrations (name, type, config, enabled, refresh_seconds) VALUES ($name,$type,$config,$enabled,$rs)',
  ).run({ $name: input.name, $type: input.type, $config: JSON.stringify(input.config), $enabled: input.enabled ? 1 : 0, $rs: input.refreshSeconds });
  return getIntegration(Number(info.lastInsertRowid)) as IntegrationRow;
}
export function updateIntegration(id: number, input: Omit<IntegrationRow, 'id'>): IntegrationRow | null {
  db.query('UPDATE integrations SET name=$name, type=$type, config=$config, enabled=$enabled, refresh_seconds=$rs WHERE id=$id')
    .run({ $id: id, $name: input.name, $type: input.type, $config: JSON.stringify(input.config), $enabled: input.enabled ? 1 : 0, $rs: input.refreshSeconds });
  return getIntegration(id);
}
export function deleteIntegration(id: number): void {
  db.query('DELETE FROM integrations WHERE id = $id').run({ $id: id });
}
```

- [ ] **Step 4: Run test, verify PASS** — `bun test src/server/db.integrations.test.ts`.

- [ ] **Step 5: Commit** — `git commit -m "feat(db): add integrations table + CRUD helpers"`.

### Task 2: Registry contract + field metadata

**Files:**
- Create: `src/server/integrations/registry.ts`
- Test: `src/server/integrations/registry.test.ts`

**Interfaces:**
- Produces: `IntegrationType` (union of the 15 type strings), `FieldDef = { key: string; label: string; secret?: boolean; kind?: 'text' | 'number' | 'list' | 'select'; options?: string[] }`, `IntegrationDef = { label: string; defaultRefreshSeconds: number; fields: FieldDef[]; fetch: (config: Record<string, unknown>) => Promise<unknown>; actions?: Record<string, (config: Record<string, unknown>, ...args: any[]) => Promise<unknown>> }`, and `INTEGRATIONS: Record<IntegrationType, IntegrationDef>`. Helper `integrationTypes(): { type: IntegrationType; label: string; defaultRefreshSeconds: number; fields: FieldDef[] }[]` for the UI (strips functions).

- [ ] **Step 1: Failing test** — assert every type has a non-empty `label` and a `fetch`, and that `integrationTypes()` omits `fetch`/`actions`:
```ts
import { expect, test } from 'bun:test';
import { INTEGRATIONS, integrationTypes } from './registry';

test('every integration type declares label + fetch', () => {
  for (const [type, def] of Object.entries(INTEGRATIONS)) {
    expect(def.label, type).toBeTruthy();
    expect(typeof def.fetch, type).toBe('function');
  }
  const meta = integrationTypes();
  expect(meta.length).toBe(Object.keys(INTEGRATIONS).length);
  expect((meta[0] as Record<string, unknown>).fetch).toBeUndefined();
});
```

- [ ] **Step 2: Run, verify FAIL** (module missing).

- [ ] **Step 3: Implement** the registry. Wire each `fetch`/`actions` to the refactored integration functions from Phase 2 (this task may import functions that still read env until Task 3.x lands them — that is fine; the signature change in Phase 2 makes these calls type-correct). Skeleton:
```ts
import type { FieldDef, IntegrationDef } from './registry-types'; // or inline
// imports of refactored integration fns ...

export type IntegrationType =
  | 'monitor' | 'docker' | 'qbittorrent' | 'transmission' | 'adguard'
  | 'jellyfin' | 'beszel' | 'radarr' | 'sonarr' | 'reelward'
  | 'reddit' | 'hackernews' | 'weather' | 'calendar' | 'speedtest';

export const INTEGRATIONS: Record<IntegrationType, IntegrationDef> = {
  radarr: {
    label: 'Radarr', defaultRefreshSeconds: 60,
    fields: [ { key: 'url', label: 'URL' }, { key: 'apiKey', label: 'API Key', secret: true } ],
    fetch: (c) => getArrSummary('radarr', c as ArrConfig),
  },
  // ... all 15, fields per the type table above
};

export function integrationTypes() {
  return (Object.entries(INTEGRATIONS) as [IntegrationType, IntegrationDef][])
    .map(([type, d]) => ({ type, label: d.label, defaultRefreshSeconds: d.defaultRefreshSeconds, fields: d.fields }));
}
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(integrations): add registry contract + field metadata"`.

> Note: Task 2 and Phase 2 are mutually dependent at the type level. Implement Phase 2 signatures first if the registry won't typecheck, or stub `fetch: async () => ({ error: 'wip' })` then replace per integration. The reviewer gate for Task 2 is the test in Step 1.

---

## Phase 2 — Refactor integrations to `(config)` signature

**Pattern (apply to every integration file):** replace each `process.env.X` read with a field from a typed `config` parameter; the "not configured" guards stay but check `config.x` instead. Export a `*Config` type per integration. Example for `arr.ts`:

```ts
// before
function env(kind: ArrKind, name: 'URL' | 'API_KEY') { return process.env[`${kind.toUpperCase()}_${name}`]?.trim() || null; }
export async function getArrSummary(kind: ArrKind): Promise<ArrPayload | { error: string }> {
  const base = env(kind, 'URL')?.replace(/\/$/, ''); ...
}
// after
export type ArrConfig = { url?: string; apiKey?: string };
export async function getArrSummary(kind: ArrKind, config: ArrConfig): Promise<ArrPayload | { error: string }> {
  const base = config.url?.trim().replace(/\/$/, '') || null;
  const key = config.apiKey?.trim() || null;
  if (!base) return { error: `${kind} URL not configured` };
  if (!key) return { error: `${kind} API key not configured` };
  ...
}
```

### Tasks 3.1–3.15: one per integration file

For each file below, the steps are identical: **(1)** update the colocated test (or add one) to pass `config` and mock `fetch`; **(2)** run it, see it fail; **(3)** change the signature + swap env reads for `config` fields per the mapping; **(4)** run, see green; **(5)** commit `refactor(<name>): read config arg instead of env`.

| Task | File | Fn(s) | env → config field |
|------|------|-------|--------------------|
| 3.1 | `integrations/arr.ts` | `getArrSummary(kind, config)` | `{URL,API_KEY}` → `{url, apiKey}` |
| 3.2 | `integrations/qbittorrent.ts` | `getQBittorrentTorrents(config)`, `qbittorrentAction(config, hash, action)` | `QBIT_*` → `{url, user, pass}` |
| 3.3 | `integrations/transmission.ts` | `getTransmissionTorrents(config)`, `transmissionAction(config, hash, action)` | `TRANSMISSION_*` → `{url, user, pass}` |
| 3.4 | `integrations/adguard.ts` | `getAdGuardStats(config)`, `setAdGuardProtection(config, enabled, ms?)` | `ADGUARD_*` → `{url, user, pass}` |
| 3.5 | `integrations/jellyfin.ts` | `getJellyfinSessions(config)`, `getJellyfinImage(config, itemId)` | `JELLYFIN_*` → `{url, apiKey}` |
| 3.6 | `integrations/beszel.ts` | `getBeszelSystems(config)` | `BESZEL_*` → `{url, user, pass, token}` |
| 3.7 | `integrations/reelward.ts` | `getReelwardSummary(config)` | `REELWARD_*` → `{url, apiKey}` |
| 3.8 | `integrations/openweather.ts` | `getOpenWeather(config, loc)` | `OPENWEATHER_API_KEY` → `config.apiKey`; loc from `config` |
| 3.9 | `integrations/speedtest.ts` | `getSpeedtestSummary(config, max)`, `triggerSpeedtestRun(config)` | `SPEEDTEST_TRACKER_*` → `{url, apiToken}` |
| 3.10 | `integrations/calendar.ts` | `getCalendarEvents(config)` | `CALENDAR_ICS_URLS` → `config.icsUrls: string[]` |
| 3.11 | `integrations/docker-client.ts` | `listContainers(config, show)`, `containerAction(config, id, action)`, `containerLogs(config, id, tail)`; `dockerFetch` takes hosts | `DOCKER_RO_HOST/RW_HOST` → `config.roHost/rwHost` |
| 3.12 | `integrations/reddit.ts` | `getRedditPosts(config)` — iterate `config.subreddits` | (was widget `subreddit`) |
| 3.13 | `integrations/hackernews.ts` | `getHackerNews(config?, limit?)` | none (config `{}`) |
| 3.14 | `integrations/monitor.ts` | `checkSites(config)` — `config.sites` | (was widget `sites`) |
| 3.15 | wire all into `registry.ts` | replace stubs with real `fetch`/`actions` | — |

> Each `*Config` type is exported from its file and consumed by `registry.ts`. The qbittorrent/transmission tests currently mutate `process.env`; rewrite them to build a `config` object (drop the env save/restore dance).

---

## Phase 3 — Scheduler, hub, channels

### Task 4: `Channel` → string; hub keys by string

**Files:** Modify `src/server/types.ts`, `src/server/sse/hub.ts`.

- [ ] Replace the `Channel` union with `export type Channel = string;` (channels are now `int:<id>`). Keep `ChannelPayload` union. Add `export type IntegrationConfig = Record<string, unknown>;`.
- [ ] `hub.ts`: `cache`/`subscribe` already use `Channel`; with `Channel = string` no code change beyond the type import compiling. Verify `bun test` for hub still green.
- [ ] Commit `refactor(sse): channels are dynamic strings`.

### Task 5: Scheduler iterates integration rows

**Files:** Modify `src/server/sse/scheduler.ts`. Test: `src/server/sse/scheduler.test.ts`.

**Interfaces:**
- Produces: `startScheduler()`, `refreshIntegration(id: number): Promise<void>`, `initScheduler()`. Channel for row `id` is `` `int:${id}` ``.

- [ ] **Step 1: Failing test** — seed one fake integration, stub its registry `fetch`, call `startScheduler()`, assert `hub.getSnapshot().get('int:<id>')` holds the fetched payload. (Mock `listIntegrations` + a registry entry; use a fake timer or call the internal refresh directly.)
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement:**
```ts
import { listIntegrations, getIntegration } from '../db';
import { INTEGRATIONS, type IntegrationType } from '../integrations/registry';
import { hub } from './hub';

const timers = new Map<number, ReturnType<typeof setInterval>>();

export async function refreshIntegration(id: number): Promise<void> {
  const row = getIntegration(id);
  if (!row || !row.enabled) return;
  const def = INTEGRATIONS[row.type as IntegrationType];
  if (!def) return;
  try {
    const data = await def.fetch(row.config);
    hub.publish(`int:${id}`, data as never);
  } catch (err) {
    console.error(`[scheduler] int:${id} (${row.type}) failed:`, err);
    hub.publish(`int:${id}`, { error: String(err) });
  }
}

export function startScheduler(): void {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();
  for (const row of listIntegrations()) {
    if (!row.enabled) continue;
    const def = INTEGRATIONS[row.type as IntegrationType];
    if (!def) continue;
    const secs = row.refreshSeconds ?? def.defaultRefreshSeconds;
    const run = () => void refreshIntegration(row.id);
    run();
    timers.set(row.id, setInterval(run, secs * 1000));
  }
}

export function initScheduler(): void { startScheduler(); }
```
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** `refactor(scheduler): poll integration rows by id`.

> The scheduler must restart when integrations change. The CRUD routes (Task 6) call `startScheduler()` after any create/update/delete. The old `onConfigChange` subscription is dropped here (config no longer carries integration cadence).

---

## Phase 4 — API surface

### Task 6: `/api/integrations` CRUD + types + restart scheduler

**Files:** Modify `src/server/app.ts`. Test: `src/server/app.integrations.test.ts`.

- [ ] **Step 1: Failing test** — `GET /api/integrations/types` returns the registry metadata array; `POST /api/integrations` creates a row; `GET /api/integrations` lists it (config returned, secrets included is acceptable — server-side only, same trust model as today); `DELETE` removes it.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** (remove the `/api/settings` GET/POST block and the import of `deleteSetting/getAllSettings/setSetting`):
```ts
import { createIntegration, deleteIntegration, listIntegrations, updateIntegration } from './db';
import { integrationTypes } from './integrations/registry';
import { startScheduler } from './sse/scheduler';

app.get('/api/integrations/types', (c) => c.json(integrationTypes()));
app.get('/api/integrations', (c) => c.json(listIntegrations()));
app.post('/api/integrations', async (c) => {
  const b = await c.req.json();
  const row = createIntegration({ name: b.name, type: b.type, config: b.config ?? {}, enabled: b.enabled ?? true, refreshSeconds: b.refreshSeconds ?? null });
  startScheduler();
  return c.json(row);
});
app.put('/api/integrations/:id', async (c) => {
  const b = await c.req.json();
  const row = updateIntegration(Number(c.req.param('id')), { name: b.name, type: b.type, config: b.config ?? {}, enabled: b.enabled ?? true, refreshSeconds: b.refreshSeconds ?? null });
  if (!row) return c.json({ error: 'Not found' }, 404);
  startScheduler();
  return c.json(row);
});
app.delete('/api/integrations/:id', (c) => {
  deleteIntegration(Number(c.req.param('id')));
  startScheduler();
  return c.json({ ok: true });
});
```
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** `feat(api): integrations CRUD endpoints`.

### Task 7: Rewrite action + data routes to resolve config by id

**Files:** Modify `src/server/app.ts`.

- [ ] Replace each per-type GET/POST that read env-backed integrations with id-scoped routes that load `getIntegration(id)` and pass `row.config` to the refactored fn. New shape:
  - `GET /api/integrations/:id/data` → look up row, call `INTEGRATIONS[row.type].fetch(row.config)`, return JSON. This replaces `/api/monitor`, `/api/docker/containers`, `/api/downloads/:client`, `/api/adguard/stats`, `/api/jellyfin/sessions`, `/api/beszel/systems`, `/api/radarr/summary`, `/api/sonarr/summary`, `/api/reelward/summary`, `/api/calendar`, `/api/speedtest/summary`, `/api/weather`, `/api/reddit/:subreddit`, `/api/hackernews`.
  - Actions become `POST /api/integrations/:id/action/:action` (+ body for args like container id / torrent hash). Handler resolves `INTEGRATIONS[row.type].actions?.[action]`, calls with `row.config` + args, then `await refreshIntegration(Number(id))`.
  - `GET /api/integrations/:id/jellyfin-image/:itemId` keeps the binary-proxy shape (calls `getJellyfinImage(row.config, itemId)`).
- [ ] Keep the Reddit/HN server-side `cached(...)` wrapper inside the scheduler's `fetch` for those types (cache key `reddit:<id>`) so the 429 protection survives; the route just reads the hub snapshot or `fetch`.
- [ ] `bun test`; commit `refactor(api): id-scoped data + action routes`.

### Task 8: Drop DB env injection

**Files:** Modify `src/server/index.ts`.

- [ ] Remove the `getAllSettings()` loop that injects into `process.env` (lines ~11–17) and the `getAllSettings` import. Keep `LABBY_PORT`/`LABBY_DB_PATH` as real env.
- [ ] `bun test`; commit `refactor: stop injecting settings into process.env`.

---

## Phase 5 — Config schema (widgets bind by integrationId)

### Task 9: Widgets carry `integrationId`; drop per-instance widget config

**Files:** Modify `src/server/config/schema.ts`. Test: `src/server/config/schema.test.ts`.

- [ ] Add `integrationId: z.number().int()` to every integration-backed widget variant; **remove** the per-instance config fields now owned by the integration row: `monitor.sites`, `downloads.client`, `reddit.subreddit`, `docker.show`, `weather.city/lat/lon/units`. Keep display-only fields (`title`, `style`, `variant`, `max`, `systems`, `units` display hint if needed).
- [ ] Delete `collectMonitorSites`, `collectDownloadClients`, `collectWeatherLocations`, `weatherLocationKey`, `getDockerShow`, `hasWidgetType`, and `refreshSeconds` from `DashboardSchema` (cadence now per integration row). Update `schema.test.ts` accordingly.
- [ ] **Step: failing test → implement → green → commit** `refactor(schema): widgets reference integrationId`.

---

## Phase 6 — Web stores + widgets

### Task 10: Dynamic per-integration stores

**Files:** Modify `src/web/src/lib/stores.ts`. Add `src/web/src/lib/types.ts` entry for `IntegrationRow`.

**Interfaces:**
- Produces: `getStore(id: number): Writable<WidgetState<unknown>>` (lazily created, memoized in a `Map`), `initStream()` routes SSE event `int:<id>` to `getStore(id)`, `markStale()` iterates the map.

- [ ] Replace the 13 fixed stores + `handlers` map with:
```ts
const stores = new Map<number, Writable<WidgetState<unknown>>>();
export function getStore(id: number) {
  let s = stores.get(id);
  if (!s) { s = writable<WidgetState<unknown>>(emptyState()); stores.set(id, s); }
  return s;
}
function idFromEvent(name: string): number | null {
  const m = /^int:(\d+)$/.exec(name); return m ? Number(m[1]) : null;
}
```
  In `initStream`, instead of registering named listeners up front (ids are dynamic), use `es.onmessage` is not enough because events are named — so register a listener via the `EventSource` `message`-style by listening for the known prefix. Since `EventSource` requires a concrete event name, fetch `/api/integrations` first, then `addEventListener('int:'+id, …)` for each id; also re-run on reconnect.
- [ ] Test: `src/web` has no test runner wired for Svelte stores by default — add a `bun test` unit on `idFromEvent`/`getStore` memoization in `src/web/src/lib/stores.test.ts`.
- [ ] Commit `refactor(web): per-integration dynamic stores`.

### Task 11: Widget components read by `integrationId`

**Files:** Modify each `src/web/src/widgets/*.svelte` that previously imported a fixed store.

- [ ] Each widget takes an `integrationId: number` prop (passed from the dashboard renderer using `widget.integrationId`) and subscribes via `getStore(integrationId)`. Replace `import { radarrStore }` etc. with `const store = getStore(integrationId)`. Monitor/weather/reddit read their list data from the payload (now sourced from the integration row server-side), not from widget props.
- [ ] Update the dashboard renderer (the component iterating `widget`s — likely `Dashboard.svelte`/`Widget.svelte`) to pass `integrationId` and to look up the widget→type from the integration where needed.
- [ ] Manual check via `bun run build` + load; commit `refactor(web): widgets bind to integrationId`.

---

## Phase 7 — Manage Integrations UI

### Task 12: Rewrite `Settings.svelte` as integration CRUD

**Files:** Modify `src/web/src/Settings.svelte`.

- [ ] Fetch `/api/integrations/types` (registry metadata: type, label, fields) and `/api/integrations` (existing rows). Render the list of rows with add/edit/delete; the add/edit form is generated from the selected type's `fields` (text/secret/number/list). Save via `POST`/`PUT`/`DELETE /api/integrations/:id`. Remove the old `KNOWN_SERVICES` hardcoded list and the flat-key form.
- [ ] List fields needing array input (`monitor.sites`, `reddit.subreddits`, `calendar.icsUrls`) use a simple multiline textarea split on newlines.
- [ ] `bun run build`; manual verify add/edit/delete + dashboard reflects changes; commit `feat(web): integration management UI`.

---

## Phase 8 — Seed, docs, verify

### Task 13: Seed defaults + dashboard migration

**Files:** Modify `src/server/db.ts` (migration 4), `README.md`, delete `.env.example`, `.gitignore`.

- [ ] Migration `version: 4, name: 'seed_default_dashboard'` inserts a minimal default `dashboard` (pages/columns/widgets referencing seeded integration ids) and a couple of disabled example integration rows (e.g. a `monitor` with sample sites) so a fresh install renders. (Replaces the old `DEFAULT_DASHBOARD` which embedded `sites`/`refreshSeconds`.) Update `DEFAULT_DASHBOARD` to the new widget shape (`integrationId`, no per-instance config, no `refreshSeconds`).
- [ ] Delete `.env.example`; remove the `!.env.example` exception from `.gitignore`.
- [ ] README: finish the `.env` removal already started; replace the "Widget types / Env vars" table with a "Built-in integrations" list (types + what each needs), and document that everything is managed on the **Manage Services** page, stored in `integrations`.
- [ ] Commit `feat: seed default integrations + dashboard; drop .env`.

### Task 14: Full verification

- [ ] `bun test` — all green (paste output).
- [ ] `cd src/web && bun run build` then `bun run build` (root) — succeeds.
- [ ] `bun run start`, open `:8080`, add one integration of each kind you can reach, confirm the widget fills via SSE, confirm an action (docker start/stop or torrent pause) triggers an immediate refresh.
- [ ] Commit `chore: integrations-table refactor complete`.

---

## Self-Review notes

- **Spec coverage:** table (Task 1) ✓; name+type+JSON config ✓; handler map per integration (Task 2/3.15) ✓; multiple-per-type via unique `name` + id-keyed channels (Tasks 4/5/10) ✓; widget `integrationId` (Tasks 9/11) ✓; everything-in-table incl. reddit/hackernews/monitor/calendar (Phase 2 + registry) ✓; clean break (no creds migration; Task 13) ✓; backend+UI (Phases 4–7) ✓.
- **Open risk:** `EventSource` named-event subscription is dynamic — Task 10 must (re)subscribe after fetching the integration list and on every reconnect, or late-created integrations won't stream until reload.
- **Type consistency:** `IntegrationRow` shape is identical in `db.ts` and `src/web/src/lib/types.ts`; `*Config` types flow from each integration file into `registry.ts`; channel string format `int:<id>` is used identically in scheduler (`publish`), app SSE (pass-through), and stores (`idFromEvent`).
