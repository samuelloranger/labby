// End-to-end smoke test driven by Playwright under bun's test runner (no extra
// deps — `playwright` is already in devDependencies, chromium already installed).
//
//   bun test e2e/dashboard.test.ts                 # spawns a local instance
//   LABBY_E2E_URL=https://labby.example bun test e2e/  # test the live platform
//
// What it guards:
//  - the SPA shell renders and the page never throws an uncaught error
//  - every widget reaches a terminal state (no card stuck on its skeleton)
//  - a network failure (unreachable monitor site) degrades to a "down" state,
//    not a crash or an infinite spinner
//  - integration data endpoints stay 200 and serve identical payloads on repeat
//    hits when polled in quick succession

import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type Browser, chromium } from 'playwright';

const EXTERNAL = process.env.LABBY_E2E_URL;
const PORT = 8099;
const BASE = EXTERNAL ?? `http://localhost:${PORT}`;
const E2E_DB = join(tmpdir(), `labby-e2e-${process.pid}.db`);

// Skip cleanly where no browser is installed (fresh clone / CI / Docker build)
// so the unit suite under `bun test` never breaks on a missing chromium.
let hasBrowser = false;
try {
  hasBrowser = existsSync(chromium.executablePath());
} catch {
  hasBrowser = false;
}
const e2e = hasBrowser ? test : test.skip;

let server: ReturnType<typeof Bun.spawn> | null = null;
let browser: Browser;
let hnIntegrationId: number | null = null;

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} never became ready`);
}

beforeAll(async () => {
  if (!hasBrowser) return;
  if (!EXTERNAL) {
    try {
      unlinkSync(E2E_DB);
    } catch {
      /* fresh */
    }
    server = Bun.spawn(['bun', 'run', 'src/server/index.ts'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        LABBY_PORT: String(PORT),
        LABBY_DB_PATH: E2E_DB,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }
  try {
    await waitForServer(BASE);
  } catch (e) {
    if (server) {
      console.error('server stdout:', await new Response(server.stdout).text());
      console.error('server stderr:', await new Response(server.stderr).text());
    }
    throw e;
  }

  if (!EXTERNAL) {
    await fetch(`${BASE}/api/integrations/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Reachability',
        type: 'monitor',
        enabled: true,
        refreshSeconds: 30,
        config: {
          sites: [
            {
              title: 'Unreachable',
              url: 'https://nope.invalid.example',
              checkUrl: 'http://127.0.0.1:1',
              icon: 'lucide:server',
            },
          ],
        },
      }),
    });

    await fetch(`${BASE}/api/integrations/3`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Launcher',
        type: 'monitor',
        enabled: true,
        refreshSeconds: 30,
        config: {
          sites: [
            {
              title: 'Unreachable',
              checkUrl: 'http://127.0.0.1:1',
              icon: 'lucide:server',
            },
          ],
        },
      }),
    });

    const hnRes = await fetch(`${BASE}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HN E2E',
        type: 'hackernews',
        enabled: true,
        refreshSeconds: 240,
        config: {},
      }),
    });
    const hnRow = await hnRes.json();
    hnIntegrationId = hnRow.id;
  } else {
    const rows = await (await fetch(`${BASE}/api/integrations`)).json();
    const hn = rows.find((r: { type: string }) => r.type === 'hackernews');
    hnIntegrationId = hn?.id ?? null;
  }

  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
  if (!EXTERNAL) {
    try {
      unlinkSync(E2E_DB);
    } catch {
      /* gone */
    }
  }
});

e2e('dashboard renders without uncaught errors and every widget reaches a terminal state', async () => {
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(BASE, { waitUntil: 'load' });

  // shell rendered
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10_000 });

  // no widget left spinning on its skeleton
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0, null, {
    timeout: 15_000,
  });

  // a fatal client error (the kind that blanks the board) must not happen.
  // favicon/asset 404s are console noise, not page crashes — only pageerror is fatal.
  expect(pageErrors).toEqual([]);

  await page.close();
}, 30_000);

e2e('an unreachable service degrades to a down state, not a crash', async () => {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  // the e2e setup points monitor integration 1 at 127.0.0.1:1; it must surface as down.
  // (skipped against a live URL whose config we don't control)
  if (!EXTERNAL) {
    await page.locator('.dot.down').first().waitFor({ state: 'visible', timeout: 15_000 });
  }
  await page.close();
}, 30_000);

e2e('integration data endpoints stay 200 and serve a stable payload on repeat hits', async () => {
  if (!hnIntegrationId) return;
  const url = `${BASE}/api/integrations/${hnIntegrationId}/data`;
  const first = await fetch(url);
  expect(first.status).toBe(200);
  const a = await first.text();

  const second = await fetch(url);
  expect(second.status).toBe(200);
  const b = await second.text();

  expect(b).toBe(a);
}, 30_000);
