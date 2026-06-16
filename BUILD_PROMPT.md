# Labby — Cursor build prompt

> Paste the block below into Cursor's agent. It builds the whole app at `~/sites/labby`.
> The design is already declared in `~/sites/labby/design/` — `labby-ui.html` is the visual
> source of truth, `DESIGN.md` is the token + behavior spec. The agent must MATCH them.

---

````text
Build a self-hosted homelab dashboard called **Labby** at `~/sites/labby` (a standalone git
repo; the design/ folder already exists — do NOT overwrite it). It lives alongside ~/sites/redoxide.

## Goal & philosophy
A dashboard as lightweight as Glance but interactive like Homarr. Single small Bun process,
single container, low memory. Config is plain **JSON files on disk** (config-as-code,
git-friendly) — NO database, NO login (it runs behind a reverse proxy restricted to LAN/VPN,
so the app is unauthenticated by design; document this loudly in the README). Widgets are
interactive at runtime: buttons call service APIs through a thin backend that keeps all
credentials server-side.

## DESIGN — match the declared UI exactly
The look is LOCKED. Before writing UI, open and follow:
- `design/labby-ui.html` — canonical visual reference (open in a browser; replicate it)
- `design/DESIGN.md` — exact CSS tokens, glass recipe, layout, widget→component map, states, motion, a11y
Summary: Apple **glassmorphism** (frosted translucent cards, `backdrop-filter: blur(20px)
saturate(180%)`, 1px light-edge highlight via `inset 0 1px 0`) over a warm amber/peach
gradient-mesh wallpaper, **Apple system orange** accent (`#FF9500` light / `#FF9F0A` dark),
**full-bleed** (no max-width container, 40px side padding), rounded 20px cards, the Airbnb
search pill, SF system font with **Manrope** fallback (self-hosted), and **dashboard-icons**
brand logos (homarr-labs set, vendored locally) with **custom image-URL support**, using Lucide
line-icons only for UI controls.
Light + dark themes, both defined as `[data-theme]` token sets — port the `:root` blocks from
DESIGN.md verbatim.

## First-paint theming (REQUIRED — implement exactly as DESIGN.md §"First-paint theming")
- `index.html`: `<html data-theme="__LABBY_THEME__">` + the blocking inline resolver script as
  the FIRST thing in `<head>` (server value → localStorage['labby-theme'] → system).
- Hono middleware string-replaces `__LABBY_THEME__` from the `labby_theme` cookie, else from
  `config/dashboard.json` `theme.default` (emit "" for "system" so the script uses the OS).
- `POST /api/theme` persists the cookie; the toggle writes cookie + localStorage + sets data-theme.
- Result: correct theme in the first byte, zero flash.

## Stack (non-negotiable)
- **Runtime:** Bun (TypeScript, strict). No Python, no Node-only APIs Bun lacks.
- **Backend:** Hono — JSON API + serves the built frontend + the theme middleware, ONE process/port.
- **Frontend:** Svelte + Vite, compiled to a tiny bundle.
- Minimal deps. Targets: final image < 150 MB, idle RAM < 128 MB.

## Repo layout (suggested)
```
~/sites/labby/
  design/            # ALREADY EXISTS — visual source of truth, do not modify
  src/server/        # Hono app, API routes, theme middleware, integration proxy
    integrations/    # one client each: docker, qbittorrent, transmission, adguard, jellyfin
    config/          # JSON loader + zod schema + file-watch hot reload
  web/               # Svelte app (Vite); web/src/app.css holds the DESIGN.md tokens
    src/widgets/     # Monitor, Docker, Downloads, AdGuard, Jellyfin, Launcher
  config/            # USER config bind-mounted at runtime; ship dashboard.example.json (gitignore real)
  Dockerfile  docker-compose.yml  .env.example  README.md
```

## Config format — JSON, hot-reloaded (zod-validated; invalid → error widget, never crash)
`config/dashboard.json`:
```json
{
  "title": "Labby",
  "theme": { "default": "system" },
  "refreshSeconds": { "monitor": 30, "docker": 10, "downloads": 5, "adguard": 60, "jellyfin": 15 },
  "pages": [{
    "name": "Overview",
    "columns": [
      { "size": "small", "widgets": [
        { "type": "monitor", "title": "Core", "style": "compact", "sites": [
          { "title": "AdGuard", "url": "https://adguard.samlo.cloud", "checkUrl": "http://adguardhome:3000", "icon": "di:adguard-home", "okCodes": [200,301,302,401,403] }
        ]}
      ]},
      { "size": "full", "widgets": [
        { "type": "docker", "title": "Containers", "show": "running" },
        { "type": "downloads", "title": "qBittorrent", "client": "qbittorrent" },
        { "type": "downloads", "title": "Transmission", "client": "transmission" },
        { "type": "monitor", "title": "Launcher", "variant": "tiles", "sites": [] }
      ]},
      { "size": "small", "widgets": [
        { "type": "adguard", "title": "AdGuard" },
        { "type": "jellyfin", "title": "Jellyfin" }
      ]}
    ]
  }]
}
```
Icon resolver — the `icon` field accepts a prefixed string (see DESIGN.md §Icons):
`di:<slug>` → dashboard-icons logo (resolve to vendored `/icons/di/<slug>.svg`, CDN fallback);
`http(s)://…` → **custom remote image URL** (user's own logo); `/…` or relative → **custom local
image**; `sh:<slug>` → selfh.st; `lucide:<name>` → built-in Lucide line icon (UI controls +
fallback glyph). `http(s):`/`/path`/`di:`/`sh:` render as `<img class="logo">`; `lucide:` as inline
`<svg>`. Always set `onerror` to fall back to the configured `lucide:` glyph so a missing logo
never breaks layout. **Custom image URLs must be first-class** — users point `icon` at any URL.

## Backend API (credentials NEVER reach the browser; server polls + pushes via SSE — see "Live data")
- `GET  /api/config` → sanitized dashboard.json
- `GET  /api/monitor` → server-side checks each `checkUrl`, returns `{status, latencyMs}` (okCodes = up; conn refused = down; follow redirects)
- `GET  /api/docker/containers` · `GET /api/docker/containers/:id/logs?tail=200` · `POST /api/docker/containers/:id/:action` (start|stop|restart)
- `GET  /api/downloads/:client` → normalized `{name,progress,dlSpeed,upSpeed,state,hash}` · `POST /api/downloads/:client/:hash/:action` (pause|resume)
- `GET  /api/adguard/stats` · `POST /api/adguard/protection` `{enabled,durationMs}`
- `GET  /api/jellyfin/sessions`
- `POST /api/theme` `{theme}` → sets `labby_theme` cookie
If an integration's env is missing or the service is down, return `{error}`; the widget shows an
error state — never crash. One dead integration must never blank the board.

## Live data — SSE (auto-refresh, no client polling)
The server is the single poller; the browser never polls on a timer.
- A **scheduler** runs one timer per channel at `config.refreshSeconds[channel]`, refreshes that
  integration's cache, and pushes the new payload to an in-process **broadcast hub**.
- `GET /api/stream` is a **Server-Sent Events** endpoint (Hono `streamSSE`, `Content-Type:
  text/event-stream`). On connect it immediately **replays the current cached snapshot** for every
  channel (widgets fill instantly), then streams updates as the scheduler produces them.
- **Named events per channel**, JSON `data` (same shape as the matching `GET /api/*`):
  `monitor`, `docker`, `downloads:qbittorrent`, `downloads:transmission`, `adguard`, `jellyfin`.
- **Keepalive:** emit a `: ping` comment every ~15s so proxies don't drop idle connections.
- The `GET /api/*` endpoints stay as the initial-render fallback (if EventSource is unavailable)
  and are reused internally by the scheduler. **POST** action endpoints stay as-is, but after a
  successful action (container start/stop/restart, pause/resume, protection toggle) trigger an
  **immediate refresh + broadcast** of that channel so the UI updates without waiting for the tick.

**Frontend:** open ONE `EventSource('/api/stream')`; route each named event to its widget store;
widgets update reactively. `EventSource` **auto-reconnects** on drop — show a subtle "reconnecting"
indicator in the header until the stream re-opens, then it self-heals. No per-widget polling timers.

## Integration protocols (each in its own module)
**Docker** — Engine API over the Tecnativa socket proxies (plain HTTP; strip `tcp://`→`http://`):
reads (`/containers/json?all=true`, `/{id}/json`, `/{id}/stats?stream=false`, `/{id}/logs`) →
`DOCKER_RO_HOST`; writes (`POST /{id}/start|stop|restart`) → `DOCKER_RW_HOST`. Demux the 8-byte
log frame headers for non-TTY containers.
**qBittorrent** (WebUI v2): `POST /api/v2/auth/login` (keep SID) → `GET /api/v2/torrents/info`;
pause/resume `POST /api/v2/torrents/pause|resume?hashes=` — qB 5.x renamed to `stop|start`, support both.
**Transmission** (RPC `/transmission/rpc`): handle the 409 `X-Transmission-Session-Id` handshake;
methods `torrent-get` (ids,name,status,percentDone,rateDownload,rateUpload), `torrent-stop`, `torrent-start`.
**AdGuard** (basic auth): `GET /control/stats`, `GET /control/status`, `POST /control/protection` `{enabled,duration}`.
**Jellyfin**: `GET /Sessions` header `X-Emby-Token: <key>`; surface NowPlayingItem + user + client.

## Environment (.env.example)
```
LABBY_PORT=8080
DOCKER_RO_HOST=tcp://docker-proxy-ro:2375
DOCKER_RW_HOST=tcp://docker-proxy-rw:2375
QBIT_URL=http://vpn:8282        QBIT_USER=   QBIT_PASS=
TRANSMISSION_URL=http://vpn:9091/transmission/rpc   TRANSMISSION_USER=   TRANSMISSION_PASS=
ADGUARD_URL=http://adguardhome:3000   ADGUARD_USER=   ADGUARD_PASS=
JELLYFIN_URL=http://jellyfin:8096     JELLYFIN_API_KEY=
```

## Deployment
**Dockerfile** multi-stage: install + `vite build` + bundle server → final `oven/bun:1-slim`,
run as non-root, expose `LABBY_PORT`, self-host the Manrope woff2.
**docker-compose.yml**:
```yaml
services:
  labby:
    build: .
    container_name: labby
    restart: unless-stopped
    env_file: .env
    volumes: [ "./config:/app/config:ro" ]
    networks: [homelab_network, docker-proxy-ro, docker-proxy-rw, homelab_secure]
    security_opt: ["no-new-privileges:true"]
    deploy: { resources: { limits: { memory: 256M } } }
networks:
  homelab_network: { external: true }
  docker-proxy-ro: { external: true }
  docker-proxy-rw: { external: true }
  homelab_secure:  { external: true }
```
**README** must include: the no-auth/behind-proxy assumption, how to add a widget, and the Caddy
block to add to the homelab repo (`labby.samlo.cloud` → `reverse_proxy labby:8080`, with imports
`crowdsec-protection`, `access-log`, `local-only`, `security-headers`). **SSE note:** Caddy
auto-disables buffering for `text/event-stream`, but if `/api/stream` stalls behind the proxy set
`reverse_proxy labby:8080 { flush_interval -1 }`; never gzip the stream.

## Homelab service reference (internal container endpoints on homelab_network unless noted)
Jellyfin `jellyfin:8096` (`/health`) · Audiobookshelf `audiobookshelf:80` (`/healthcheck`) ·
Reelward `reelward:3000` (link-only) · Jackett `jackett:9117` (health `/favicon.ico`) ·
qBittorrent `vpn:8282` · Transmission `vpn:9091` (`/transmission/web/`) · Immich `immich-server:2283` ·
Gitea `gitea:3000` · Vaultwarden `vaultwarden:80` (`/alive`, on **homelab_secure**) · Kan `kan-web:3000` ·
Budget `budget:3001` · Jollyboard `jollyboard-frontend:3000` · Bunnyfile `bunnyfile:3001` ·
C411 `c411-manager:3011` · Arcane `arcane:3552` · AdGuard `adguardhome:3000` · Beszel `beszel:8090` ·
Uptime Kuma `uptime-kuma:3001` · Kopia `kopia:51515` · ntfy `ntfy:80` · Home Assistant `192.168.50.30:8123`.
Public links: `https://<name>.samlo.cloud`. Custom apps (Reelward, Budget, Jollyboard, Bunnyfile,
C411, Kan) = link tiles only (no integration).

## Quality bar
- TypeScript strict; zod-validate config and all external responses.
- bun test for each integration client (mock fetch) and config validation; write the test with the client.
- Every widget: loading / error / empty / ready states (see DESIGN.md). reduced-motion respected.
- Match DESIGN.md tokens exactly; no ad-hoc colors. backdrop-filter only on header + cards (drop to
  near-opaque fallback if scroll janks). No external calls except configured services.
- Commit in logical steps; end with a working `docker compose up -d` + populated README + dashboard.example.json.

## Build order
1. Scaffold (git init, bun, tsconfig, Vite+Svelte, Hono hello).
2. index.html + first-paint theme inline script + Hono theme middleware (`__LABBY_THEME__`) + `/api/theme`.
3. Config loader + zod schema + file-watch + `/api/config`.
4. Integration clients + tests (docker → qbittorrent → transmission → adguard → jellyfin).
5. API routes + cache layer + the SSE scheduler/broadcast hub + `GET /api/stream` (snapshot replay → live events; 15s keepalive; broadcast-on-action).
6. app.css tokens (from DESIGN.md) + Svelte shell (full-bleed grid, frosted header) + an `Icon`
   component implementing the resolver (di:/http(s)://custom URL//local/sh:/lucide:) + a build step
   that vendors the `di:` slugs used in config into `web/public/icons/di/` + widget components — match labby-ui.html.
7. Dockerfile + docker-compose + .env.example + README + dashboard.example.json (using the service reference).
````
