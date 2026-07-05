# Plex Integration — Design

**Date:** 2026-06-29
**Status:** Approved (design), pending spec review
**Branch:** `feat/plex-integration` (stacked on `feat/emby-sabnzbd-integrations`; PR depends on #11)

## Goal

Add **Plex** as a media now-playing integration, and consolidate the
Jellyfin/Emby/Plex now-playing cards into ONE shared `MediaSessions.svelte`
widget (replacing the duplicated `Jellyfin.svelte` + `Emby.svelte`).

## Why this is not an Emby copy

Plex's API differs from Jellyfin/Emby (verified against current docs —
plexopedia.com, plexapi.dev):
- Endpoint `GET {base}/status/sessions`; auth `X-Plex-Token` (header or query).
- Returns JSON with `Accept: application/json` (no XML parser dependency needed).
- `MediaContainer.size` = active session count; `MediaContainer.Metadata[]` = items.
- Per item: `title`, `grandparentTitle` (series), `index`/`parentIndex`
  (episode/season), `viewOffset`/`duration` (**milliseconds**, not ticks),
  `thumb`/`grandparentThumb` (poster **path**), nested `User.title`,
  `Player.title`/`Player.product`, and `TranscodeSession` (present ⇒ transcoding).
- Poster is a relative **path** (`/library/metadata/668/thumb/123`), unlike
  Emby's item id → the image proxy is path-based and must validate the path.

## Consolidation: shared MediaSessions widget

The Jellyfin/Emby/Plex payloads are the same shape (`sessions[]` + `playing`),
and the three widgets differ only by icon and poster-rewrite prefix. Unify:

- New `src/web/src/widgets/MediaSessions.svelte` with props
  `{ title: string; integrationId: number; type: 'jellyfin' | 'emby' | 'plex' }`.
- Icon/fallback derived from `type` (`di:jellyfin`/`di:emby`/`di:plex`, fallback `film`).
- **Generic poster rewrite:** every media server emits the placeholder
  `/api/<type>/image/<rest>`; the widget rewrites
  `/api/<type>/image` → `/api/integrations/<integrationId>/<type>-image`,
  preserving whatever follows (`/<itemId>` for Jellyfin/Emby, `?path=<thumb>`
  for Plex). One `posterSrc` covers all three.
- Delete `Jellyfin.svelte` and `Emby.svelte`; `WidgetHost.svelte` routes all
  three types to `<MediaSessions {title} integrationId={id} {type} />`.

## Server — `src/server/integrations/plex.ts`

- `PlexConfig = { url?: string; token?: string }`
- `getPlexSessions(config): Promise<PlexPayload | { error: string }>`
  - Missing url → `{error:'PLEX_URL not configured'}`; missing token →
    `{error:'PLEX_TOKEN not configured'}`.
  - `GET {base}/status/sessions`, headers `Accept: application/json`,
    `X-Plex-Token: token`. Wrapped in `soft('Plex', ...)`; non-OK →
    `{error:'Plex error: <status>'}`.
  - Parse `MediaContainer.Metadata` (default `[]`). For each item:
    - progress = `duration > 0 ? round(viewOffset/duration*100) : 0` (ms).
    - title: if `grandparentTitle` → `${grandparentTitle} — ${SxxExx or title}`,
      where `SxxExx` is built from `parentIndex`/`index` when both present;
      else `title`.
    - subtitle: `[year, quality, transcode?'transcode':'direct play']` joined
      ` · ` — year from `year`, quality from media stream height when available
      (`Media[0].videoResolution` or height) else `'unknown'`.
    - user = `User.title ?? 'unknown'`; device = `Player.title ?? Player.product ?? 'unknown'`.
    - isTranscoding = `TranscodeSession` present.
    - posterUrl: prefer `thumb` then `grandparentThumb`; emit
      `/api/plex/image?path=<encodeURIComponent(thumb)>` (undefined if no thumb).
  - Return `{ sessions, playing: sessions.length }` (or use `MediaContainer.size`).
- `getPlexImage(config, thumbPath): Promise<Response | { error: string }>`
  - Validate `thumbPath` starts with `/` and NOT `//` (reject absolute URLs /
    protocol-relative / host) → else `{error:'Invalid image path'}` (SSRF guard).
  - `GET {base}${thumbPath}` with `X-Plex-Token` header; non-OK → `{error}`.
  - Returns upstream Response for the route to stream.

## Types

- `types.ts`: `PlexSession`, `PlexPayload = { sessions: PlexSession[]; playing: number }`
  (same shape as `EmbySession`/`EmbyPayload`). Add `PlexPayload` to `ChannelPayload`.
- `src/web/src/lib/stores.ts`: `PlexData` (mirror). The shared widget casts the
  store data to a common `{ sessions: MediaSession[]; playing: number }` shape;
  `JellyfinData`/`EmbyData`/`PlexData` are structurally identical.

## Route — `app.ts`

- `GET /api/integrations/:id/plex-image` with `?path=<thumb>` query param.
  - Guard `row.type === 'plex'` else 404.
  - Read `path` from query; call `getPlexImage(row.config, path)`; on error 502;
    else stream body with `Cache-Control: private, max-age=300` (mirror jellyfin/emby routes).

## Registry — `registry.ts`

```
plex: {
  label: 'Plex',
  defaultRefreshSeconds: 15,
  fields: [
    { key: 'url', label: 'URL' },
    { key: 'token', label: 'Token', secret: true },
  ],
  fetch: (c) => getPlexSessions(c as PlexConfig),
}
```
Add `'plex'` to `IntegrationType` union. Bump the integration-type count in
`registry.test.ts` and `app.integrations.test.ts` (18 → 19).

## Icons

`scripts/vendor-icons.ts`: add `'plex'` to `SLUGS`.

## Error handling

`getPlexSessions`/`getPlexImage` return `Payload | {error}`, never throw
(fail-soft contract). Missing config / unreachable / bad token / invalid image
path → `{error}`.

## Testing — `plex.test.ts`

Colocated, mock `fetch` (`as unknown as typeof fetch`):
- Missing url → error; missing token → error.
- Session parse: a movie (title only) and an episode (grandparentTitle + index
  → SxxExx), assert progress (viewOffset/duration), user, device, isTranscoding,
  posterUrl contains the thumb path, `Accept` + `X-Plex-Token` sent.
- Upstream non-OK → `{error:'Plex error: <status>'}`.
- fetch throws → `{error}`.
- `getPlexImage`: reject `http://evil.com` and `//evil.com` (SSRF guard),
  accept a relative `/library/...` path and return the Response.

Web: the consolidation is covered by build/typecheck; no new web unit test
(the `posterSrc` rewrite is exercised by existing patterns). If a focused test
is cheap, add one for the `type`-based rewrite producing the right route.

## Touch list

- Create: `plex.ts`, `plex.test.ts`, `src/web/src/widgets/MediaSessions.svelte`
- Modify: `types.ts`, `registry.ts`, `app.ts`, `registry.test.ts`,
  `app.integrations.test.ts`, `WidgetHost.svelte`, `stores.ts`,
  `scripts/vendor-icons.ts`
- Delete: `src/web/src/widgets/Jellyfin.svelte`, `src/web/src/widgets/Emby.svelte`

No changes to: `schema.ts`, `scheduler.ts`, `hub.ts`, SSE plumbing.

## Out of scope (YAGNI)

- Plex write actions (no stop/terminate session, no playback control).
- Plex library/recently-added widgets, server stats, multi-server.
- Migrating Jellyfin/Emby payload types to a single shared `MediaPayload` type
  name — the three remain structurally identical typedefs (web/server
  duplicated-by-design); only the *widget* is unified.
