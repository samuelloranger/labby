# Development

Install dependencies:

```bash
bun install
cd src/web && bun install
```

Run the API server:

```bash
bun run dev
```

Run the Vite frontend:

```bash
cd src/web && bun run dev
```

For frontend work, run both dev servers. The Vite dev server proxies API requests to the Bun server.

## Checks

```bash
bun run typecheck
bun test
bun run lint
```

## Docs

Run the VitePress docs locally:

```bash
bun run docs:dev
```

Build the static docs site:

```bash
bun run docs:build
```
