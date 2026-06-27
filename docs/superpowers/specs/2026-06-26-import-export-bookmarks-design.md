# Import/Export + Bookmarks — Design

Date: 2026-06-26
Status: Approved (pre-implementation)

## Goal

Add two adoption-driving features to Labby:

1. **Import/Export** — a full backup/restore of the entire configuration (dashboard layout + service integrations, including credentials).
2. **Bookmarks** — a static link-tile widget (an app launcher), the "front door" use case every competing dashboard has and Labby lacks.

The two pair naturally: there is currently no in-app layout editor, so export→edit→import is the practical way to hand-edit the dashboard JSON, and bookmarks are placed that way.

## Context (current state)

- **Two data stores:**
  - `settings(key, value)` table — the `dashboard` key holds the whole dashboard JSON (title, theme, pages → columns → widgets).
  - `integrations(id, name, type, config, enabled, refresh_seconds)` table — service connections. **Secrets live in `config`** (API keys, passwords).
- Widgets reference an integration by `integrationId` (number). Every existing widget type requires an integration.
- **No layout-editor UI and no dashboard-write endpoint exist** — the dashboard JSON is edited by hand in the DB today.
- Integration types are driven by a registry map (`src/server/integrations/registry.ts`): each type is `{ label, defaultRefreshSeconds, fields, fetch(config), actions? }`. The Settings page ("Manage Services") renders a CRUD form from `integrationTypes()` meta, with a repeatable list-field editor already used for monitor `sites` and calendar `calendars`.
- Widgets render via a `WidgetHost.svelte` `{#if widget.type === …}` switch. Live data normally arrives over SSE channels driven by the scheduler.
- `Icon.svelte` / `resolveIconSrc` render any `http(s)://` or `/path` icon string as an `<img>`. `data:` URIs are NOT currently handled (only `di:`, `sh:`, `http(s)://`, `/path`, `lucide:`).

## Decisions (locked)

- Export = **full backup** (dashboard + integrations **with secrets**). Single export, with a plaintext-credentials warning in the UI.
- Import = **full replace / restore**, behind a confirm dialog. Integration IDs preserved so widget references stay valid.
- Bookmarks = **integration type + one-time fetch** (approach A). Reuses the existing integrations CRUD form as the "dedicated editor."
- Favicon auto-fetch on add; **store the resolved favicon URL** (string), not a data URI.

---

## 1. Schema change (`src/server/config/schema.ts`)

Add one variant to `WidgetSchema` (the discriminated union):

```ts
z.object({
  type: z.literal('bookmarks'),
  title: z.string(),
  integrationId,
}),
```

Keep the duplicated web-side type (`src/web/src/lib/stores.ts` / types) in sync. No other schema change — links live in the integration `config`, not the widget.

## 2. Import / Export

### Export — `GET /api/backup`

Returns:

```jsonc
{
  "version": 1,
  "exportedAt": "<ISO timestamp>",
  "dashboard": { /* parsed dashboard JSON */ },
  "integrations": [ /* listIntegrations(), incl. secrets */ ]
}
```

Response sets `Content-Disposition: attachment; filename="labby-backup-<YYYY-MM-DD>.json"`. Browser downloads it.

### Restore — `POST /api/restore`

1. Parse + validate the envelope with a Zod schema (`version === 1`, `dashboard` matches `DashboardSchema`, `integrations` matches the integration-row shape).
2. On validation failure → `400` with the error message; DB untouched.
3. On success, in a single `db.transaction(() => …)`:
   - `replaceAllIntegrations(rows)` — wipe `integrations`, bulk-insert each row with its explicit `id`.
   - `setSetting('dashboard', JSON.stringify(dashboard, null, 2))`.
4. After the transaction: `reloadConfig()` (re-reads config, notifies listeners → scheduler restarts timers).

### db.ts helper

```ts
export function replaceAllIntegrations(rows: IntegrationRow[]): void
```

Runs inside the caller's transaction: `DELETE FROM integrations;` then `INSERT INTO integrations (id, name, type, config, enabled, refresh_seconds) VALUES (…)` for each row (explicit `id`).

### UI (`Settings.svelte`, "Manage Services" header)

- **Export backup** button → `window.location = '/api/backup'` (triggers download). Adjacent ⚠️ note: "Backup contains plaintext credentials — store it securely."
- **Import backup** button → hidden `<input type="file" accept="application/json">`. On file pick → confirm dialog: *"This replaces all services and your dashboard layout with the backup's contents. Continue?"* → `POST /api/restore` → on success reload the page (or re-fetch integrations + dashboard); on error show the message.

## 3. Bookmarks widget

### Registry (`src/server/integrations/registry.ts`)

New entry:

```ts
bookmarks: {
  label: 'Bookmarks',
  // no defaultRefreshSeconds → not scheduled, no SSE channel
  fields: [{ key: 'links', label: 'Links', kind: 'list' }],
  fetch: (c) => ({ links: (c.links as Link[]) ?? [] }),
  // no actions
},
```

- **Link shape:** `{ title: string; url: string; icon?: string }`.
- No channel is added to the scheduler; bookmarks data is never polled.

### Rendering

- **`Bookmarks.svelte`** — on mount, `GET /api/integrations/:id/data` once; render a responsive tile grid (icon + title), each tile an `<a href target="_blank" rel="noopener">`. Implements loading / error / empty / ready states and respects reduced-motion, consistent with other widgets. Uses `Icon.svelte` for each link's icon (falls back to a lucide glyph when `icon` is empty/unreachable).
- **`WidgetHost.svelte`** — add `{:else if widget.type === 'bookmarks'}` → `<Bookmarks …/>`.

### Editor (`Settings.svelte`)

Add a `links` list editor for the bookmarks type, mirroring the existing `addSite`/`removeSite` pattern: rows of `title`, `url`, `icon` (with favicon preview, see §4). The integrations CRUD form, type picker, save, and delete are reused as-is.

## 4. Favicon auto-fetch

### Endpoint — `GET /api/favicon?url=<url>`

1. Validate `url` is a syntactically valid `http(s)` URL → else `{ icon: null }`.
2. Fetch the page HTML using the `http.ts` `soft` wrapper (timeout, errors → soft null).
3. Regex-scan for a `<link rel="…icon…" href="…">` (matches `icon`, `shortcut icon`, `apple-touch-icon`); resolve the `href` to an absolute URL against the page URL.
4. Fallback: `<origin>/favicon.ico`.
5. Return `{ icon: <absolute url> | null }`.

```
// ponytail: regex parse, not a full HTML parser — swap in a parser if it misses real-world sites
```

### Frontend

In the links editor, on a link's `url` blur, if its `icon` field is empty, call `/api/favicon?url=…` and populate `icon` with the returned URL. The field stays editable and clearable. Stored value is the URL string → rendered by `Icon.svelte` unchanged.

**Note:** works for LAN/internal hosts because the *server* fetches the favicon (same reachability as monitoring). Storing the URL (not a data URI) means the browser later loads it directly — fine on LAN/VPN. Data-URI durability is a possible future enhancement (would require a `data:` branch in `resolveIconSrc`).

## 5. Testing

- **`backup.test.ts`** — export envelope shape; restore round-trip preserves integration ids + dashboard; malformed payload → 400 and DB unchanged (rollback).
- **`registry.test.ts`** — bookmarks `fetch` returns `{ links }` from config (incl. empty default).
- **`favicon.test.ts`** — mocked `fetch`: parses `<link rel=icon>`; falls back to `/favicon.ico`; returns `{ icon: null }` on fetch failure / invalid URL.

## Out of scope

- Drag-and-drop / visual layout editor (separate, larger feature). Bookmarks placement uses the dashboard JSON, now editable via export→edit→import.
- Selective / partial import, merge mode, encrypted backups, data-URI favicon storage.

## Affected files

- `src/server/config/schema.ts` — bookmarks widget variant.
- `src/server/db.ts` — `replaceAllIntegrations`.
- `src/server/integrations/registry.ts` — bookmarks type.
- `src/server/integrations/favicon.ts` (new) — favicon resolver, + `favicon.test.ts`.
- `src/server/app.ts` — `/api/backup`, `/api/restore`, `/api/favicon` routes; + `backup.test.ts`.
- `src/web/src/components/WidgetHost.svelte` — bookmarks branch.
- `src/web/src/components/Bookmarks.svelte` (new) — tile grid.
- `src/web/src/Settings.svelte` — export/import buttons + links editor + favicon call.
- `src/web/src/lib/stores.ts` (+ web types) — keep widget type in sync.
