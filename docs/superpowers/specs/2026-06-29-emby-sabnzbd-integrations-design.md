# Emby + SABnzbd Integrations — Design

**Date:** 2026-06-29
**Status:** Approved (design), pending spec review

## Goal

Add two new integration types to Labby:

- **Emby** — media server now-playing card (separate module, dedicated widget)
- **SABnzbd** — usenet download client card (dedicated usenet widget)

Both plug into the existing instance-based integration architecture: a registry
entry + client + payload types + a widget branch. No SSE/channel/scheduler
changes — the generic `int:${id}` scheduler and `POST /api/integrations/:id/action/:name`
route absorb both.

## Architecture context (verified)

- Integration **types** are defined in `src/server/integrations/registry.ts`
  (`IntegrationType` union + `INTEGRATIONS` map). `schema.ts` does **not**
  enumerate types — no schema change needed.
- Scheduler (`sse/scheduler.ts`) iterates DB integration rows generically,
  calls `def.fetch(row.config)`, publishes to channel `int:${id}`.
- Web routing (`stores.ts`) is generic: one `EventSource`, per-id store,
  `getStore(id)` returns `Writable<WidgetState<unknown>>`; each widget casts
  `store.data` to its own type.
- Actions: `POST /api/integrations/:id/action/:action` reads body `{args:[...]}`
  and spreads into `def.actions[action](config, ...args)`. Web widgets POST
  `{args:[id]}` (see `Downloads.svelte` `toggle`).

## Emby

### Decision
Separate module (own `emby.ts`, `EmbyPayload`, `Emby.svelte`) rather than reusing
Jellyfin. Emby and Jellyfin diverged broadly since the 2018 fork, but the narrow
slice Labby uses is verified identical in Emby's current API: `/Sessions`,
`X-Emby-Token` header auth, `NowPlayingItem`, `/Items/{id}/Images/Primary`.
Isolation chosen so future Emby-specific divergence stays contained.

### Server — `src/server/integrations/emby.ts`
- `EmbyConfig = { url?: string; apiKey?: string }`
- `getEmbySessions(config): Promise<EmbyPayload | {error}>`
  - Missing `url` → `{error:'EMBY_URL not configured'}`; missing `apiKey` →
    `{error:'EMBY_API_KEY not configured'}`.
  - `GET ${base}/Sessions`, headers `X-Emby-Token: key`, `Accept: application/json`.
  - Wrapped in `soft('Emby', ...)`; non-OK → `{error:'Emby error: <status>'}`.
  - Parse `NowPlayingItem` → session shape identical to Jellyfin
    (title/series/episode, year/quality/transcode subtitle, progress %,
    user, device, `posterUrl`, `isTranscoding`).
  - `posterUrl` = `/api/emby/image/${itemId}` (rewritten client-side, see widget).
- `getEmbyImage(config, itemId): Promise<Response | {error}>`
  - `GET ${base}/Items/{id}/Images/Primary?maxHeight=120`, `X-Emby-Token`.
  - Returns upstream `Response` for the route to stream (key never reaches browser).
- Reuses `http.ts` helpers `normalizeBase`, `soft`, `TIMEOUT_MS`.

Note: Emby may serve its API under an `/emby` path prefix depending on setup.
The URL field handles this — the user enters the full base (e.g.
`http://host:8096` or `http://host:8096/emby`). Documented in the field, no code branch.

### Types
- `types.ts`: `EmbySession`, `EmbyPayload = { sessions: EmbySession[]; playing: number }`
  (mirror `JellyfinSession`/`JellyfinPayload`). Add `EmbyPayload` to `ChannelPayload` union.
- `src/web/src/lib/stores.ts`: `EmbyData` (mirror `JellyfinData`).

### Route — `app.ts`
- `GET /api/integrations/:id/emby-image/:itemId`
  - Guard `row.type === 'emby'` else 404.
  - Calls `getEmbyImage(row.config, itemId)`, streams body with
    `Cache-Control: private, max-age=300` (mirror jellyfin-image route).

### Registry entry
```
emby: {
  label: 'Emby',
  defaultRefreshSeconds: 15,
  fields: [
    { key: 'url', label: 'URL' },
    { key: 'apiKey', label: 'API Key', secret: true },
  ],
  fetch: (c) => getEmbySessions(c as EmbyConfig),
}
```

### Web — `src/web/src/widgets/Emby.svelte`
- Own copy of `Jellyfin.svelte`. Poster rewrite swaps
  `/api/emby/image/` → `/api/integrations/${integrationId}/emby-image/`.
- `WidgetHost.svelte`: `{:else if integration.type === 'emby'} <Emby {title} integrationId={id} />`.
- `scripts/vendor-icons.ts`: add `'emby'` to `SLUGS`.

## SABnzbd

### Decision
Dedicated usenet widget (not reusing the Torrent/Downloads shape). Usenet has no
upload/ratio, and the queue exposes usenet-specific aggregates (MB left, total
time left, paused state) worth showing directly.

### API (verified — sabnzbd.org/wiki/configuration/5.0/api)
- Queue: `GET ${base}/api?mode=queue&output=json&apikey=KEY`
  - Queue object: `paused` (bool), `speed` ("1.3 M"), `kbpersec` (numeric KB/s),
    `timeleft` ("0:12:34"), `sizeleft`, `mbleft`, `mb`, `noofslots`, `slots[]`.
  - Slot: `nzo_id`, `filename`, `percentage` (string), `mb`, `mbleft`,
    `sizeleft`, `timeleft`, `status` ("Downloading"/"Paused"/...), `index`.
- Pause item: `?mode=queue&name=pause&value=NZO_ID&apikey=KEY` → `{status, nzo_ids}`.
- Resume item: `?mode=queue&name=resume&value=NZO_ID&apikey=KEY`.
- Auth: `apikey` in query string (no session/cookie).

### Server — `src/server/integrations/sabnzbd.ts`
- `SabnzbdConfig = { url?: string; apiKey?: string; max?: number }`
- `getSabnzbdQueue(config): Promise<SabnzbdPayload | {error}>`
  - Missing url → `{error:'SABNZBD_URL not configured'}`; missing apiKey →
    `{error:'SABNZBD_API_KEY not configured'}`.
  - `GET ${base}/api?mode=queue&output=json&apikey=KEY`, wrapped in `soft('SABnzbd', ...)`.
  - SABnzbd returns HTTP 200 with `{error: "..."}` body on a bad apikey — detect
    and surface as `{error}` rather than parsing as a queue.
  - Map to payload (numbers parsed defensively from strings).
- `sabnzbdAction(config, nzoId, action: 'pause'|'resume'): Promise<{ok:true}|{error}>`
  - `GET ${base}/api?mode=queue&name=${action}&value=${nzoId}&apikey=KEY`.

### Payload
```ts
// types.ts
export type SabnzbdSlot = {
  id: string;          // nzo_id
  name: string;        // filename
  progress: number;    // percentage, 0..100
  sizeLeftMb: number;  // mbleft
  timeLeft: string;    // timeleft
  status: string;      // status
};
export type SabnzbdPayload = {
  paused: boolean;
  speedBps: number;    // kbpersec * 1024
  sizeLeftMb: number;  // mbleft
  timeLeft: string;    // timeleft
  slots: SabnzbdSlot[];
};
```
Add `SabnzbdPayload` to `ChannelPayload` union. Mirror as `SabnzbdData` in `stores.ts`.

### Registry entry
```
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
}
```

### Web — `src/web/src/widgets/Sabnzbd.svelte`
- New widget. Header: aggregate download speed (format `speedBps`), total time
  left, paused badge when `paused`.
- Per-slot rows: name, progress bar, MB left, ETA, pause/resume button.
- Action POST mirrors `Downloads.svelte`: optimistic flip, `POST
  /api/integrations/${id}/action/${action}` body `{args:[slot.id]}`, revert on failure.
- Respect `max` (slice slots). Loading/error/empty/ready states + reduced-motion,
  per project convention.
- `WidgetHost.svelte`: `{:else if integration.type === 'sabnzbd'} <Sabnzbd {title} integrationId={id} max={c.max} />`.
- `scripts/vendor-icons.ts`: add `'sabnzbd'` to `SLUGS`.

## Error handling
Both clients return `Payload | {error}`, never throw to the route (existing
fail-soft contract). Missing config / unreachable service / bad key → `{error}`.
One dead integration never blanks the board.

## Testing
Colocated, mock `fetch` (matches existing integration tests):

- `emby.test.ts`: now-playing parse (movie + episode), missing url, missing key,
  upstream non-OK, image proxy returns Response / error.
- `sabnzbd.test.ts`: queue parse (slot mapping, kbpersec→speedBps,
  percentage string→number), missing config, bad-apikey error body, pause/resume
  action URL shape.

## Touch list
**Emby (~8):** `emby.ts`, `emby.test.ts`, `types.ts`, `registry.ts`, `app.ts`,
`Emby.svelte`, `WidgetHost.svelte`, `stores.ts`, `vendor-icons.ts`.
**SABnzbd (~8):** `sabnzbd.ts`, `sabnzbd.test.ts`, `types.ts`, `registry.ts`,
`Sabnzbd.svelte`, `WidgetHost.svelte`, `stores.ts`, `vendor-icons.ts`.

No changes to: `schema.ts`, `scheduler.ts`, `hub.ts`, SSE event plumbing.

## Out of scope (YAGNI)
- Emby/SABnzbd write actions beyond pause/resume (no delete, no priority, no
  speed limit). Add when asked.
- SABnzbd history view, server stats, category management.
- Sharing code between Emby and Jellyfin (explicitly chosen separate).
