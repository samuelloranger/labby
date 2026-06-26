# Integration-Driven Layout — Design

Date: 2026-06-26
Status: Approved (pre-implementation)

## Goal

Remove Labby's separate, hand-edited dashboard layout (pages → columns → widgets JSON). The configuration page (Manage Services) becomes the single source of the dashboard: **every enabled integration renders as its widget, in `position` order.** Adding an integration adds a card; reordering on the config page reorders the board. This eliminates the "create integration → manually place widget in JSON" gap (the reason a bookmarks integration never appeared on the dashboard).

## Decisions (locked)

- **Single masonry flow.** Drop pages and columns entirely. Every integration is a card auto-flowed into the responsive masonry grid (what the default theme already does — it flattens columns today). Order = config order.
- **Drag-and-drop reordering** on the config page, using **native HTML5 drag-and-drop** (no new dependency), with a drag handle. Order persists in a new `position` column.
- **Display options move into integration config.** Per-widget options that lived in the layout JSON (monitor `variant`/`style`; `max` on feeds, *arr, calendar, downloads, beszel; beszel `systems`) become fields on the integration form, stored in the integration's `config` JSON.
- **Multi-page goes away** (single board).
- **A one-time migration preserves the user's current board** (order + per-widget options) instead of resetting it.

## Current architecture (context)

- Dashboard JSON in `settings.dashboard`: `{ title, theme, pages:[{name, columns:[{size, widgets:[{type, integrationId, ...opts}]}]}] }`.
- `integrations` table: `{ id, name, type, config(JSON), enabled, refresh_seconds }`. Secrets live in `config`.
- `App.svelte` renders pages→columns→widgets; for each widget it looks up the integration by `widget.integrationId` and passes `integrationType` to `WidgetHost`.
- `WidgetHost.svelte` maps `widget.type` → component, passing props (`integrationId`, `max`, monitor `variant`/`style`, downloads `client` derived from integration type, *arr `kind`).
- Widget data arrives via `getStore(integrationId)` + SSE `int:${id}` (per-integration; unchanged by this work).
- `type`-name relationships that the new mapping must preserve:
  - integration `qbittorrent` / `transmission` → **Downloads** component, `client` = the integration type.
  - integration `radarr` / `sonarr` → **Arr** component, `kind` = the integration type.
  - integration `reddit` / `hackernews` → **Feed** component (different icon/fallback per type).
  - integration `monitor` → **Monitor** component, `variant` (rows/tiles) + `style` from config.
  - all others → their 1:1 component.
- Theme/title stay relevant: `Header` shows `config.title`; theme drives first-paint.

## 1. Data model

- **`integrations.position`** — new `INTEGER` column (migration). `listIntegrations()` returns rows ordered by `position ASC, id ASC`. New integrations get `position` = current max + 1 (or `id` fallback).
- **Display options live in `config`** (no new columns). Fields added to the registry (see §3) so the form reads/writes them automatically.
- **`dashboard` settings row → `{ title, theme }`.** `pages` removed.

## 2. Schema (`src/server/config/schema.ts`)

- `DashboardSchema` becomes:
  ```ts
  export const DashboardSchema = z.object({
    title: z.string().default('Labby'),
    theme: ThemeConfigSchema.default({ default: 'system', layout: 'masonry' }),
  });
  ```
- **Delete** `WidgetSchema`, `ColumnSchema`, `PageSchema`, the `Widget` type export, and `SiteSchema` usage that only fed widgets (keep `SiteSchema` — monitor config still uses sites). `sanitizeDashboard` stays (deep clone of `{title,theme}`).
- `ThemeConfigSchema.layout` (masonry/columns) is now vestigial — keep the field for back-compat parsing but the UI always renders masonry. (Leaving it avoids breaking older stored theme blobs.)

## 3. Registry (`src/server/integrations/registry.ts`)

Add display-option fields to the relevant types' `fields` arrays (kind `number` or `select`), so the existing Settings form renders them and stores them in `config`:

- `monitor`: `{ key:'variant', label:'Display', kind:'select', options:['rows','tiles'] }`, `{ key:'style', label:'Density', kind:'select', options:['default','compact'] }`
- `qbittorrent`, `transmission`: `{ key:'max', label:'Max items', kind:'number' }`
- `beszel`: `{ key:'max', label:'Max systems', kind:'number' }` (keep existing `systems` handling if present in config)
- `radarr`, `sonarr`, `reelward`: `{ key:'max', label:'Max items', kind:'number' }`
- `reddit`, `hackernews`: `{ key:'max', label:'Max items', kind:'number' }`
- `calendar`: `{ key:'max', label:'Max events', kind:'number' }`

`fetch` functions are unchanged (they already accept the full config; `max` is a display concern read on the client, so the server need not use it — the widget components slice by `max`).

## 4. DB (`src/server/db.ts`)

- Migration: `ALTER TABLE integrations ADD COLUMN position INTEGER;` then backfill `position = id` for existing rows.
- `IntegrationRow` gains `position: number`. `toRow` maps it; `createIntegration` sets `position` = `(SELECT COALESCE(MAX(position),0)+1 FROM integrations)`; `listIntegrations` `ORDER BY position, id`.
- New: `reorderIntegrations(orderedIds: number[]): void` — in one transaction, set `position` = array index for each id.
- `replaceAllIntegrations` (restore) must insert `position` too.

## 5. Server routes (`src/server/app.ts`)

- `POST /api/integrations/reorder` — body `{ ids: number[] }`, validated with Zod, calls `reorderIntegrations`, then `startScheduler()` is **not** needed (order doesn't affect polling), returns `{ ok: true }`.
- Backup/restore: `RestoreSchema.dashboard` becomes the new `{title, theme}` shape; `integrations` row shape gains `position`. Export already serializes whatever `listIntegrations()` returns (now includes `position`).

## 6. One-time data migration (preserve current board)

A run-once migration (guarded by a `settings` flag `layout_migrated=1`, or a numbered migration that runs JS):

1. Read the existing `dashboard` JSON. If it has `pages`:
2. Walk `pages[].columns[].widgets[]` in order. For each widget, by `integrationId`:
   - merge the widget's display options (`max`, `variant`, `style`, `systems`) into that integration's `config` (don't overwrite existing config keys that aren't display options).
   - assign the integration's `position` from a running counter following the widget walk order.
3. Integrations not referenced by any widget keep `position = id` (appended after).
4. Rewrite `dashboard` to `{ title, theme }`.
5. Set the `layout_migrated` flag.

This runs on the user's live instance so their current order + options survive.

## 7. Frontend

### `App.svelte`
- Remove page tabs, `activePageIndex`, columns/masonry branch on `theme.layout`.
- Fetch enabled integrations (ordered) — reuse the existing `/api/integrations` fetch — filter `enabled`, sort by `position`.
- Render a single masonry `.grid` of `<WidgetHost {integration} />` for each.
- Keep `initStream()` (SSE) and the `integrationsById` map source-of-truth, now also the render list.

### `WidgetHost.svelte`
- Props change from `{ widget, integrationType }` to `{ integration }` where `integration = { id, type, name, config }`.
- Switch on `integration.type`; derive props:
  - title = `integration.name`
  - `integrationId` = `integration.id`
  - `monitor`: `variant = config.variant ?? 'rows'`, `style = config.style`
  - `qbittorrent`/`transmission`: `<Downloads client={integration.type} max={config.max} />`
  - `radarr`/`sonarr`: `<Arr kind={integration.type} max={config.max} />`
  - `reddit`/`hackernews`: `<Feed icon=… max={config.max} />`
  - `bookmarks`: `<Bookmarks />` (its links come from config via the integration store)
  - others: 1:1 component with `max` where applicable.

### `Settings.svelte`
- Service cards become reorderable via native HTML5 DnD: each card gets `draggable`, a drag handle, and `dragstart`/`dragover`/`drop` handlers that compute the new order and call `POST /api/integrations/reorder`, then reload the list. Provide a visible focus state on the handle; keyboard reordering is out of scope for v1 (documented limitation).
- Display-option fields render automatically (they're registry fields now). No bespoke per-field UI needed beyond the existing `select`/`number` handling.
- The export/import backup section (added previously) stays at the page footer.

### `Header.svelte`
- Remove page tabs (no `pages`). Title display unchanged.

## 8. Types (web)

- `src/web/src/lib/types.ts`: remove `Widget`, `Column`, `Page`; `Dashboard` becomes `{ title, theme }`. `IntegrationRow` gains `position: number`.
- Keep server/web duplication in sync.

## 9. Testing

- `schema.test.ts`: `{title, theme}` parses; a payload with `pages` still parses (pages ignored) — no throw.
- `db.integrations.test.ts`: `position` round-trips; `createIntegration` assigns increasing positions; `reorderIntegrations([...])` persists the given order; `listIntegrations` returns position order.
- `registry.test.ts`: monitor has `variant`+`style` fields; feeds/*arr/calendar/downloads/beszel have a `max` field. (Bump any field-count assertions.)
- `app` test: `POST /api/integrations/reorder` reorders; backup round-trips `position` + config display options.
- Migration test: given an old `dashboard` JSON with widgets carrying `max`/`variant` and a custom order, the migration merges options into the matching integrations' config and assigns positions in widget order; `dashboard` is rewritten to `{title,theme}`.

## Out of scope

- Multi-page dashboards (removed).
- Keyboard-accessible drag reordering (up/down arrows could be a later a11y addition).
- A separate visual canvas/grid editor (the config list *is* the editor).
- Per-integration width/spanning (single masonry sizing only).

## Affected files

- `src/server/config/schema.ts` — shrink `DashboardSchema`, delete widget/column/page schemas.
- `src/server/config/loader.ts` — validate new shape (likely no change beyond schema).
- `src/server/db.ts` — `position` column + migration, `reorderIntegrations`, `IntegrationRow.position`, create/list/replace updates, one-time data migration.
- `src/server/integrations/registry.ts` — display-option fields.
- `src/server/app.ts` — `/api/integrations/reorder`, restore schema update.
- `src/web/src/App.svelte` — integration-driven render, drop pages/columns.
- `src/web/src/components/WidgetHost.svelte` — integration-keyed mapping.
- `src/web/src/components/Header.svelte` — drop page tabs.
- `src/web/src/Settings.svelte` — drag reorder + reorder call.
- `src/web/src/lib/types.ts` — drop Widget/Column/Page, `Dashboard` shrink, `IntegrationRow.position`.
- Tests alongside each.
