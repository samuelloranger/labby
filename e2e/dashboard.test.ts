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
//  - the cached feed endpoints stay 200 and serve identical payloads on repeat
//    hits (the Reddit 429 guard)

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type Browser, chromium } from 'playwright';

const EXTERNAL = process.env.LABBY_E2E_URL;
const PORT = 8099;
const BASE = EXTERNAL ?? `http://localhost:${PORT}`;

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
    server = Bun.spawn(['bun', 'run', 'src/server/index.ts'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        LABBY_PORT: String(PORT),
        LABBY_CONFIG_PATH: new URL('../config/dashboard.e2e.json', import.meta.url).pathname,
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
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
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
  // the e2e config points a monitor site at 127.0.0.1:1; it must surface as down.
  // (skipped against a live URL whose config we don't control)
  if (!EXTERNAL) {
    await page.locator('.dot.down').first().waitFor({ state: 'visible', timeout: 15_000 });
  }
  await page.close();
}, 30_000);

e2e('cached feed endpoints stay 200 and serve a stable payload on repeat hits', async () => {
  const first = await fetch(`${BASE}/api/hackernews`);
  expect(first.status).toBe(200);
  const a = await first.text();

  const second = await fetch(`${BASE}/api/hackernews`);
  expect(second.status).toBe(200);
  const b = await second.text();

  // within the cache window the two responses are byte-identical (one upstream
  // fetch served both) — or both are a soft error object, never a 5xx.
  expect(b).toBe(a);
}, 30_000);
