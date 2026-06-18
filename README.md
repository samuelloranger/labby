# Labby

![Dashboard Screenshot](docs/screenshot-v1.0.4.png)

A self-hosted homelab dashboard — lightweight like [Glance](https://github.com/glanceapp/glance), interactive like [Homarr](https://github.com/homarr-labs/homarr). One Bun process, one container, config stored in a small SQLite database and editable in-app.

## Features

- **Widgets** — service monitor, Docker, qBittorrent/Transmission, AdGuard, Jellyfin, Beszel, Radarr, Sonarr, Reelward, weather, Reddit, Hacker News
- **Live updates** — server polls integrations and pushes changes over SSE (no client-side polling)
- **Interactive** — start/stop containers, pause/resume torrents, toggle AdGuard protection
- **Config & credentials** — stored in SQLite (`config/labby.db`), automatically seeded with a default layout on first run, Zod-validated; edit service URLs/keys from the in-app Manage Services page
- **Theming** — named color schemes saved to the DB; no flash on first paint

## Security

**Labby has no authentication.** Run it behind a reverse proxy restricted to your LAN or VPN. Anyone who can reach the app can read status and control integrated services.

Do not expose Labby to the public internet without network-level access control.

## Quick start

```bash
cp .env.example .env
# Edit .env with your service URLs and credentials
bun install && (cd src/web && bun install)
bun run build
bun run start
```

Open `http://localhost:8080`.

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Point `.env` at your homelab services, then edit URLs/keys live from the **Manage Services** page (the Database icon in the header). On first run Labby automatically seeds its SQLite DB (`config/labby.db`) with a default layout via built-in migrations. The DB lives in the mounted `config/` volume, so it must be writable **by the user the container runs as** — set `user: "<uid>:<gid>"` in `docker-compose.yml` to match the owner of `config/`, or writes fail with `SQLITE_READONLY`. Adjust `docker-compose.yml` networks to match your setup.

## Configuration

User config lives in the SQLite database. Invalid config shows an error state instead of crashing the server.

### Widget types

| Type                   | Env vars                           |
| ---------------------- | ---------------------------------- |
| `monitor`              | — (HTTP checks only)               |
| `docker`               | `DOCKER_RO_HOST`, `DOCKER_RW_HOST` |
| `downloads`            | `QBIT_*` or `TRANSMISSION_*`       |
| `adguard`              | `ADGUARD_*`                        |
| `jellyfin`             | `JELLYFIN_*`                       |
| `beszel`               | `BESZEL_*`                         |
| `radarr`               | `RADARR_URL`, `RADARR_API_KEY`     |
| `sonarr`               | `SONARR_URL`, `SONARR_API_KEY`     |
| `reelward`             | `REELWARD_URL`, `REELWARD_API_KEY` |
| `weather`              | `OPENWEATHER_API_KEY`              |
| `speedtest`            | `SPEEDTEST_TRACKER_URL`, `SPEEDTEST_TRACKER_API_TOKEN` |
| `reddit`, `hackernews` | —                                  |

### Icons

The `icon` field accepts prefixed strings:

| Prefix     | Example                                                           |
| ---------- | ----------------------------------------------------------------- |
| `di:`      | `di:jellyfin` — dashboard-icons (vendored at build, CDN fallback) |
| `sh:`      | `sh:immich` — selfh.st                                            |
| `lucide:`  | `lucide:film` — built-in line icon                                |
| URL / path | `https://…` or `/icons/custom.svg`                                |

### Refresh intervals

Set per-channel poll cadence in `refreshSeconds`. The browser receives updates via SSE, not its own timers.

## Development

```bash
bun run dev              # API on :8080 (watch mode)
cd src/web && bun run dev    # Vite dev server, proxies /api → :8080
bun test
```

For frontend work, run **both** dev servers. `bun run dev` alone does not serve the SPA until you `bun run build`.

## Stack

- **Runtime** — Bun, TypeScript (strict)
- **Backend** — Hono (JSON API, static SPA, SSE)
- **Frontend** — Svelte 5, Vite
- **Config** — SQLite (`bun:sqlite`), Zod validation, automatically seeded via migrations

## License

MIT
