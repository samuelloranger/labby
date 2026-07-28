# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Self-hosters running services on a homelab, viewing Labby over their own LAN or VPN. Confirmed usage scenes, all three load-bearing:

- **Desktop browser tab** — open alongside other work, mouse and keyboard primary, density matters.
- **Browser homepage / new tab** — seen dozens of times a day in short bursts. First-paint speed and instant scanability dominate; this is why the zero-flash theme resolver exists.
- **Phone, checking in** — quick glance or a control action (stop a container, pause a torrent) from a phone on the LAN/VPN. Thumb-driven, so the mobile layout and touch target sizes are real requirements, not afterthoughts.

Wall/kiosk display is *not* a target scene.

Labby is a public open-source project (MIT, GHCR image, appeared in selfh.st Self-Host Weekly), so the audience is other self-hosters, not one operator.

## Product Purpose

A single-container homelab dashboard that shows live service status and lets the user act on it without leaving the page. Success is the user glancing at one tab and knowing everything is fine — or fixing it in one click when it isn't.

## Positioning

"Lightweight like Glance, interactive like Homarr." The differentiator is holding both at once: one Bun process and one container with no external dependencies, while still supporting write actions against integrated services (start/stop containers, pause/resume torrents, toggle AdGuard protection).

Second differentiator: **the browser never polls.** The server polls each integration on its own interval and pushes over SSE, with the latest payload cached per stream so a new tab fills instantly on connect.

## Operating Context

- Deployed as `ghcr.io/samuelloranger/labby`, one container, one mounted `config/` volume.
- Runs behind a reverse proxy restricted to LAN or VPN. **There is no authentication** — anyone who can reach the app can read status and control every integrated service. This is a deliberate design decision, documented in the README.
- Configured entirely in-app on the Manage Services page; no config file to hand-edit.
- Config and service credentials live in SQLite at `config/labby.db`. `config/` must be writable by the container's uid or writes fail with `SQLITE_READONLY`.
- Backups are written server-side to `config/backups/` in plaintext including credentials, and are never returned in an API response.

## Capabilities and Constraints

**Confirmed functionality**
- 18+ integration types: service monitor, Docker, qBittorrent, Transmission, SABnzbd, AdGuard, Jellyfin, Emby, Plex, Beszel, Radarr, Sonarr, Rawkoon, weather, calendar, speedtest, bookmarks, Reddit, Hacker News.
- Write actions: container start/stop/restart, torrent pause/resume, AdGuard protection toggle. Each forces an immediate refresh and broadcast rather than waiting for the next tick.
- Theming: 11 palettes × light/dark/system, persisted to the DB, resolved before first paint so there is no flash.

**Technical constraints**
- One Bun process serving a JSON API, a Svelte 5 SPA, and an SSE stream. No separate frontend server in production.
- Server and web are separate build roots with separate tsconfigs; payload types are duplicated by design between `src/server/types.ts` and `src/web/src/lib/stores.ts`.
- All service credentials stay server-side; the browser only ever receives sanitized data.
- Integrations must fail soft — each returns `Payload | { error }` and never throws to the route. One dead integration must never blank the board.

**Terminology**
- An **integration** is a configured row in the DB (`id`, `type`, `config`, `enabled`, `refreshSeconds`, `position`) — it is the unit of everything: SSE event name, hub cache key, store key, scheduler timer all key off `int:${id}`.
- A **widget** is the Svelte component that renders one integration.
- `Channel` in `src/server/types.ts` is a legacy payload-shape alias, not a routing contract.

## Brand Commitments

Name **Labby** and the existing logo (`src/web/public/icons/labby.svg`) are fixed.

The current visual world — glass / `backdrop-filter`, warm amber default palette — is **not** binding. The user's position: *look is negotiable, function isn't.* What must be preserved is the widget set, SSE liveness, and the zero-config single-container story. A future visual direction may replace the glass-and-amber language if there is a reason.

## Evidence on Hand

- Real screenshot at `docs/screenshot-v1.3.0.png` (README hero).
- Real GitHub signals: MIT license, tagged releases, Docker build workflow, GHCR package, Buy Me a Coffee link at `buymeacoffee.com/samlo122`.
- Real coverage: featured in selfh.st "Self-Host Weekly" (26 June 2026), which drove the star spike; syndicated onward to Yahoo Tech.
- **Absent — must not be fabricated:** no testimonials, no named users or customers, no install counts, no uptime/performance benchmarks beyond the measured compression figures (JS 271,913 → 61,001 bytes; CSS 66,634 → 12,265 bytes), no pricing or commercial tier.

## Product Principles

1. **One glance answers the question.** The default state is "everything is fine"; anything wrong must be findable without scrolling or clicking.
2. **Never blank the board.** A dead integration, invalid config, or dropped stream degrades to an error inside its own card. The dashboard keeps rendering.
3. **Push, don't poll.** Liveness is the product. The browser holds one EventSource and never sets a timer.
4. **Zero-config to first value.** One container, one volume, no file to edit. Everything else is configured in the UI.
5. **Credentials never reach the browser.** Server-side only, sanitized payloads, no exceptions — this is what makes a no-auth app defensible behind a VPN.

## Accessibility & Inclusion

**WCAG 2.2 AA is a real target**, confirmed by the user. As a public open-source project, AA is the credible bar, not an aspiration.

Product-specific implications:

- **Live status must be perceivable non-visually.** The core value is streamed state change; screen-reader users currently get silence. Live regions are a product requirement, not polish.
- **Status must not be color-only.** Up/warn/down is currently a 9px colored dot. Needs a text or shape alternative (WCAG 1.4.1).
- **Contrast must hold across all 22 themes.** Status tokens are currently declared once in `:root` and never re-tuned, so they measure 1.7–3.0:1 on the 11 light themes.
- **Touch targets matter** because the phone scene is confirmed real (WCAG 2.5.8).

Tracked as board task #177.
