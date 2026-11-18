# Contributing to Labby

Labby is a self-hosted homelab dashboard: one Bun process serving a JSON API (Hono), a Svelte 5 SPA, and an SSE stream. Service URLs, credentials, and the dashboard layout live in a small SQLite database and are edited in-app — not in a config file.

**Adding an integration is the ideal first PR**, and `src/server/integrations/registry.ts` is why. Each integration type declares its config as a typed list of fields, and the app generates everything around it:

- the **Manage Services form** renders one input per field (text, number, list, select — masked for secrets),
- fields marked `secret: true` are **redacted from every API response** and kept server-side,
- the **scheduler polls your fetch function** and pushes results to widgets over SSE,
- **actions** (start/stop/pause/…) get an authenticated route for free.

You write one typed client module and one widget component. Typical first PR: a few hundred lines, end to end, and your service shows up on real dashboards.

## Dev setup

Requires [Bun](https://bun.sh). Dependencies live in two places — the repo root and `src/web/`:

```bash
bun install && (cd src/web && bun install)
```

Run both dev servers (the Bun server only serves the *built* SPA; for frontend work you need Vite too):

```bash
bun run dev                  # API on :8080, watch mode
cd src/web && bun run dev    # Vite dev server, proxies /api → :8080
```

Before opening a PR, run the same gates CI runs (see `.github/workflows/ci.yml`):

```bash
bun run typecheck    # tsc --noEmit
bun run test         # bun test --parallel
bun run lint         # biome check (bun run format fixes formatting)
```

CI also runs `bun run build:web` and `bun run build:server` — build if you touched the web app or the server bundle. A single test file: `bun test src/server/integrations/speedtest.test.ts`.

## Adding a new integration

The walkthrough below adds a fictional `acme` service — self-hosted, URL + API key, a read-only summary, one action. Adapt names to your service. Model files worth opening first: `src/server/integrations/speedtest.ts` (small client), `src/server/integrations/arr.ts`, `src/server/integrations/c411.ts` (credential hygiene), and `src/server/integrations/speedtest.test.ts` (test style).

### 1. Create the client module

`src/server/integrations/acme.ts` — a typed config and a fetch-style function that returns the payload **or** `{ error: string }`, never throwing:

```ts
import type { AcmePayload } from '../types';
import { normalizeBase, soft, TIMEOUT_MS } from './http';

export type AcmeConfig = { url?: string; apiKey?: string; max?: number };

export async function getAcmeSummary(
  config: AcmeConfig,
): Promise<AcmePayload | { error: string }> {
  // The MAX_FIELD form input lands in the config as "max"; default for rows without one.
  const max = config.max ?? 5;
  const base = normalizeBase(config.url);
  const key = config.apiKey?.trim() || null;
  if (!base) return { error: 'Acme URL not configured' };
  if (!key) return { error: 'Acme API key not configured' };

  return soft('Acme', async () => {
    const res = await fetch(`${base}/api/v1/status`, {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { error: `Acme error: ${res.status}` };

    const body = (await res.json()) as { version?: unknown; items?: unknown[] };
    // Map upstream JSON into your payload explicitly — never a passthrough.
    return {
      version: typeof body.version === 'string' ? body.version : null,
      items: (body.items ?? []).slice(0, max).map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          id: String(item.id ?? ''),
          title: String(item.title ?? 'Unknown'),
          status: String(item.status ?? ''),
        };
      }),
    };
  });
}
```

House rules, all borrowed from the existing clients:

- **Fail soft.** Missing config and unreachable upstreams return `{ error }` — one dead integration must never blank the board. `soft()` (from `./http`) converts thrown errors into `{ error }` for you.
- **Always time out.** Every upstream call passes `AbortSignal.timeout(TIMEOUT_MS)` (15 s) so a hung service can't stall polling.
- **Parse defensively.** Narrow upstream JSON field by field (`String()`/`Number()`/`typeof`) or validate with a Zod schema like `c411.ts` does. Build the exact object you return — an explicit allowlist, not the raw upstream body.
- **Never leak credentials.** Upstream error bodies and exception messages can contain the key you just sent — catch and return a generic message instead (see the `catch` in `fetchProfile`, which `getC411Profile` delegates to). Never `console.log` a config or token.
- **Actions** (optional) follow the same shape — see `triggerSpeedtestRun` in `speedtest.ts`: return `{ ok: true } | { error }`.

### 2. Declare the payload types

Add `AcmeItem` / `AcmePayload` to `src/server/types.ts`. The web app can't import server types (separate build roots, separate tsconfigs), so **duplicate the shape** in `src/web/src/lib/stores.ts` as `AcmeData` — types are duplicated by design there; keep the two in sync when you change a payload.

### 3. Register the type in `registry.ts`

In `src/server/integrations/registry.ts`:

1. Add `'acme'` to the `IntegrationType` union.
2. Add its entry to the `INTEGRATIONS` record:

```ts
acme: {
  label: 'Acme',
  defaultRefreshSeconds: 60,
  fields: [
    { key: 'url', label: 'URL' },
    { key: 'apiKey', label: 'API Key', secret: true },
    MAX_FIELD,
  ],
  fetch: (c) => getAcmeSummary(c as AcmeConfig),
  actions: {
    restart: (c, id) => acmeAction(c as AcmeConfig, id as string),
  },
},
```

What each piece buys you:

- **`fields`** drives the Manage Services form and the type list at `GET /api/integrations/types`. `kind` picks the input (`text` default, `number`, `list`, `select` + `options`); `MAX_FIELD` is the shared "max items" field.
- **`secret: true`** is the redaction contract: `publicIntegration()` in `src/server/app.ts` strips those keys from every API response, and `preserveSecrets()` keeps the stored value when the edit form submits them blank.
- **`defaultRefreshSeconds`** is the poll interval the scheduler uses when a row doesn't set its own `refreshSeconds`. The scheduler (`src/server/sse/scheduler.ts`) calls your `fetch` on that cadence and publishes the result on the `int:<id>` SSE channel — widgets update live with no extra wiring.
- **`actions`** is optional. When present, `POST /api/integrations/:id/action/:action` (body `{ "args": [...] }`) dispatches to it and Labby refreshes the widget right after — `restart: (c, id)` above receives `args: [id]`.

### 4. Build the widget

Create `src/web/src/widgets/Acme.svelte`, modeled on a simple one like `Speedtest.svelte`. Widgets take `{ title, integrationId, max }` props and read their per-integration store:

```svelte
<script lang="ts">
  import { getStore, type AcmeData, type WidgetState } from '$lib/stores';

  let { title, integrationId, max = 5 }: { title: string; integrationId: number; max?: number } =
    $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<AcmeData>);
</script>
```

`WidgetState` carries `loading`, `error`, `stale`, and `data`. Every widget renders **all four states** — skeleton while loading, error message, empty state, ready content — and respects reduced-motion. Upstream text renders as plain text; Svelte escapes it and the codebase never uses `{@html}`.

Wire it up in `src/web/src/components/WidgetHost.svelte`: import the component and add a branch to its `{#if}` chain (`{:else if integration.type === 'acme'}`). If your payload fits an existing widget, reuse it instead — `radarr`/`sonarr` share `Arr.svelte`, `jellyfin`/`emby`/`plex` share `MediaSessions.svelte`, `reddit`/`hackernews` share `Feed.svelte`.

### 5. Pick the icon

If the service has a [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) slug, add it to `SLUGS` in `scripts/vendor-icons.ts` and run `bun run vendor-icons` to vendor it into `src/web/public/icons/di/`. Icon references accept prefixes — `di:` (dashboard-icons), `sh:` (selfh.st), `lucide:` (built-in line icons) — or a plain URL/path; `src/web/src/components/Icon.svelte` resolves them.

Whatever icon you choose, register it: add `acme: 'di:acme'` to the `TYPE_ICONS` map in `src/web/src/Settings.svelte`. The Manage Services type picker and the services list render from that map — a type without an entry falls back to a generic `lucide:box`.

### 6. Test it

Colocated `src/server/integrations/acme.test.ts`, `bun:test`, mocked `globalThis.fetch` — same style as `speedtest.test.ts`:

```ts
import { describe, expect, mock, test } from 'bun:test';
import { getAcmeSummary } from './acme';

describe('Acme client', () => {
  test('reports missing config', async () => {
    expect(await getAcmeSummary({})).toEqual({ error: 'Acme URL not configured' });
    expect(await getAcmeSummary({ url: 'http://acme.test' })).toEqual({
      error: 'Acme API key not configured',
    });
  });

  test('maps the status payload', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://acme.test/api/v1/status');
      expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('test_key');
      return Response.json({
        version: '1.2.3',
        items: [{ id: 1, title: 'Widget', status: 'up' }],
      });
    }) as unknown as typeof fetch;

    const result = await getAcmeSummary({ url: 'http://acme.test', apiKey: 'test_key' });
    globalThis.fetch = originalFetch;

    expect('items' in result).toBe(true);
    if ('items' in result) {
      expect(result.version).toBe('1.2.3');
      expect(result.items).toHaveLength(1);
    }
  });
});
```

Restore `globalThis.fetch` in a `finally` when a test can fail mid-flight. If your service is credential-sensitive, add assertions that error paths never echo the secret — see the `handles HTTP … without echoing upstream secrets` tests in `c411.test.ts`.

### 7. Update the lists that count

- `src/server/integrations/registry.test.ts` pins the registry: add your type to `ALL_TYPES` and bump the entry counts.
- `TYPE_ICONS` in `src/web/src/Settings.svelte`: the type-picker and services-list icons (see step 5).
- Add a row to the integrations table in `docs/guide/integrations.md`.

### 8. What a review will look for

- Fail-soft behavior everywhere: missing config, bad auth, unreachable host → `{ error }`, never a crash.
- `AbortSignal.timeout(TIMEOUT_MS)` on every upstream call.
- Credentials marked `secret: true`, never logged, echoed, or embedded in error text; upstream responses mapped through an explicit allowlist.
- Upstream JSON narrowed defensively; server and web payload types kept in sync.
- Widget covers loading / error / empty / ready and respects reduced-motion.
- Colocated tests with mocked fetch, and all gates green.

## Other ways to help

- **Bug fixes** — open an issue first with a repro; a failing test that pins it is the best first commit of the fix.
- **Docs** — the VitePress site lives in `docs/` (`bun run docs:dev` to preview). Short, concrete corrections beat rewrites.
- **Themes** — color tokens live in `src/web/src/app.css`; named schemes are stored in the DB and applied with zero flash on first paint.

## Security notes

- **Secrets stay server-side.** `secret: true` fields are stripped from API responses (`publicIntegration` in `src/server/app.ts`) and preserved on blank re-submits. Never put a credential in anything the browser receives.
- **No telemetry.** Labby phones home to nobody — the server calls only the services you configure (plus the build-time icon vendoring). Keep it that way.
- **Treat upstream data as hostile text.** Render it as plain text (Svelte escapes; `{@html}` is never used), and don't pass upstream URLs through unchecked — see the avatar URL allowlisting in `c411.ts`.
