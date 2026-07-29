---
name: deploying-labby
description: Use when deploying, shipping, or releasing labby — cutting a version tag, publishing the ghcr Docker image, pulling the new image on the homelab host, verifying the deploy, or rolling back a bad one without losing the SQLite config DB.
---

# Deploying Labby

## Overview

Labby ships as a single Docker image, `ghcr.io/samuelloranger/labby`. Publishing is **tag-triggered**: `.github/workflows/docker.yml` runs only on `push: tags: v*.*.*`. Pushing to `main` never publishes an image. The version source of truth is `version` in `package.json` (currently `1.8.0`); the tag must match it.

**Core invariant: the SQLite DB is host state, not image state.** All persistent data lives in `config/labby.db` (`DB_PATH` in `src/server/db.ts`, `process.cwd()/config/labby.db`, overridable with `LABBY_DB_PATH`). The container has it only through the bind mount `./config:/app/config`. Nothing in the image carries data forward — pull the wrong compose file, or `docker compose down -v` in the wrong directory, and integrations plus credentials are gone. `config/*.db` is gitignored, so there is no copy in git.

## Repo vs deploy directory

Source is canonical in this repo. The deployed stack lives in a separate host-side directory — referred to below as `$DEPLOY_DIR` — which is **not** part of this repository and holds its own `docker-compose.yml`, the real `.env` (all integration secrets), and `config/` with the live `labby.db`. The compose file committed here is a bare example (no `.env`, no networks) — **never deploy from it**.

The deployed compose adds: `pull_policy: always`, `container_name: labby`, `user: "1000:1000"` (the image's `labby` user is uid 999 and cannot write the host-owned bind mount), four external networks (`homelab_network`, `docker-proxy-ro`, `docker-proxy-rw`, `homelab_secure`), `no-new-privileges`, and a 256M memory limit. It publishes no ports — Caddy reaches `labby:8080` over `homelab_network`.

`$DEPLOY_DIR/docker-compose.override.yml` pins `image: labby:local` for local testing. **It is active whenever present** and will silently keep you on a stale local image; move it aside before shipping.

## The Procedure

```bash
cd this repo
bun run typecheck && bun test && bun run lint    # what CI gates on
# bump "version" in package.json, commit
git tag v1.8.0 && git push origin main --tags
gh run watch $(gh run list --workflow 'Publish Docker Image' --limit 1 --json databaseId -q '.[0].databaseId')

cd $DEPLOY_DIR
cp config/labby.db config/labby.db.pre-1.8.0-$(date +%Y%m%d-%H%M%S)   # house convention, see config/
ls docker-compose.override.yml   # must NOT exist; move it aside if it does
docker compose pull && docker compose up -d
```

Migrations are automatic: `src/server/db.ts` runs its `migrations` array on module load, tracked in the `_migrations` table, each version applied once. There is no migrate command and no rollback path — a migration is forward-only, which is why the pre-deploy DB copy matters.

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR + push to `main` | `test` job: install `--frozen-lockfile`, `typecheck`, `bun test`, `build:web`, `build:server`. `lint` job: `bun run lint` (Biome). Skips `vendor-icons` so CI needs no CDN. |
| `docker.yml` | push tag `v*.*.*` | **The publisher.** Buildx `linux/amd64,linux/arm64` → ghcr, tagged `{{version}}`, `{{major}}.{{minor}}`, `{{major}}`, plus branch/sha. A second job rebuilds the README screenshot via Playwright and auto-commits to `main`. |
| `docs.yml` | push to `main` touching `docs/**`, `package.json`, `bun.lock`, itself; or manual | Builds VitePress with `VITEPRESS_BASE=/labby/` and pushes it into the `samlo-cloud` repo. Unrelated to the image. |

Note `docker.yml` does **not** depend on `ci.yml` — the tag publishes whether or not CI is green. Run the pre-flight checks yourself.

## Verify

```bash
docker compose ps                      # labby Up, restart count 0
docker compose logs --tail=50 labby    # look for "Running migration:" lines, no crash loop
docker compose exec labby ls -l /app/config/labby.db   # non-zero, recent mtime
```
Then load the dashboard through Caddy and confirm widgets render (a blank board means the DB mount is wrong, not that integrations are down — integrations fail soft and render per-widget errors).

## Rollback

The image tags are immutable, so rollback is a pin, not a rebuild. In `$DEPLOY_DIR/docker-compose.yml` change `image:` to the previous version (e.g. `ghcr.io/samuelloranger/labby:1.7.1`), then `docker compose up -d`. Restore `config/labby.db` from the pre-deploy copy **only** if the bad release ran a migration — an older image against a newer schema is the failure mode that needs it. Stop the container before swapping the DB file.

## Landmines

- `docker compose down -v` in `$DEPLOY_DIR` is not destructive today (the mount is a bind, not a named volume) — but never run it while chasing a bad deploy; `down` + `up -d` is enough.
- `bun run build` calls `scripts/vendor-icons.ts`, which fetches from the dashboard-icons CDN. It's fine locally, but don't add it to a gate.
- Re-tagging an existing version to "republish" overwrites a tag consumers may already have pulled. Ship the next patch instead.

## TODO(sam)

- TODO(sam): confirm which host `$DEPLOY_DIR` is deployed on and whether the deploy is run locally or over SSH — no host or deploy script is recorded anywhere in either repo.
- TODO(sam): the `POST /api/backup` route (`src/server/app.ts:340`) writes JSON backups to `config/backups/` — decide whether that, or the manual `labby.db.pre-*` copies in `$DEPLOY_DIR/config/`, is the sanctioned pre-deploy backup. Both patterns are currently in use.
