# Labby

A self-hosted homelab dashboard — lightweight like [Glance](https://github.com/glanceapp/glance), interactive like [Homarr](https://github.com/homarr-labs/homarr). One Bun process, one container, config-as-code JSON on disk.

## Features

- **Widgets** — service monitor, Docker, qBittorrent/Transmission, AdGuard, Jellyfin, Beszel, weather, Reddit, Hacker News
- **Live updates** — server polls integrations and pushes changes over SSE (no client-side polling)
- **Interactive** — start/stop containers, pause/resume torrents, toggle AdGuard protection
- **Config on disk** — `config/dashboard.json`, Zod-validated, hot-reloaded
- **Theming** — light, dark, or system; no flash on first paint

## Security

**Labby has no authentication.** Run it behind a reverse proxy restricted to your LAN or VPN. Anyone who can reach the app can read status and control integrated services.

Do not expose Labby to the public internet without network-level access control.

## Quick start

```bash
cp .env.example .env
cp config/dashboard.example.json config/dashboard.json
# Edit .env with your service URLs and credentials
bun install && (cd web && bun install)
bun run build
bun run start
```

Open `http://localhost:8080`.

### Docker

```bash
cp .env.example .env
cp config/dashboard.example.json config/dashboard.json
docker compose up -d --build
```

Mount `config/` read-only and point `.env` at your homelab services. Adjust `docker-compose.yml` networks to match your setup.

## Configuration

User config lives in `config/dashboard.json`. Invalid config shows an error state instead of crashing the server. See `config/dashboard.example.json` for a full layout.

### Widget types

| Type | Env vars |
|------|----------|
| `monitor` | — (HTTP checks only) |
| `docker` | `DOCKER_RO_HOST`, `DOCKER_RW_HOST` |
| `downloads` | `QBIT_*` or `TRANSMISSION_*` |
| `adguard` | `ADGUARD_*` |
| `jellyfin` | `JELLYFIN_*` |
| `beszel` | `BESZEL_*` |
| `weather` | `OPENWEATHER_API_KEY` |
| `reddit`, `hackernews` | — |

### Icons

The `icon` field accepts prefixed strings:

| Prefix | Example |
|--------|---------|
| `di:` | `di:jellyfin` — dashboard-icons (vendored at build, CDN fallback) |
| `sh:` | `sh:immich` — selfh.st |
| `lucide:` | `lucide:film` — built-in line icon |
| URL / path | `https://…` or `/icons/custom.svg` |

### Refresh intervals

Set per-channel poll cadence in `refreshSeconds`. The browser receives updates via SSE, not its own timers.

## Development

```bash
bun run dev              # API on :8080 (watch mode)
cd web && bun run dev    # Vite dev server, proxies /api → :8080
bun test
```

For frontend work, run **both** dev servers. `bun run dev` alone does not serve the SPA until you `bun run build`.

## Stack

- **Runtime** — Bun, TypeScript (strict)
- **Backend** — Hono (JSON API, static SPA, SSE)
- **Frontend** — Svelte 5, Vite
- **Config** — JSON on disk, Zod validation, file watcher

## License

MIT
