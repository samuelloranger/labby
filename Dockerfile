# syntax=docker/dockerfile:1

# --- deps: lockfile-driven install, cached unless deps change ---
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY web/package.json web/bun.lock* ./web/
RUN bun install && cd web && bun install

# --- build: compile the Svelte SPA + bundle the server into one process ---
FROM deps AS build
WORKDIR /app
COPY . .
# Vite copies web/public/{icons,fonts} (vendored brand icons + self-hosted
# Manrope) into web/dist — no build-time network needed beyond `bun install`.
RUN cd web && bun run build
# --target bun inlines hono/zod into dist/index.js, so the runtime image needs
# no node_modules.
RUN bun build src/server/index.ts --outdir dist --target bun

# --- runtime: minimal, non-root, single port ---
FROM oven/bun:1-slim AS runtime
WORKDIR /app
RUN groupadd --system labby && useradd --system --gid labby labby
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
# Ship the example so a bare `docker run` (no mounted config) boots a demo board.
COPY --from=build /app/config/dashboard.example.json ./config/dashboard.example.json
COPY package.json ./
USER labby
ENV LABBY_PORT=8080
EXPOSE 8080
CMD ["bun", "run", "dist/index.js"]
