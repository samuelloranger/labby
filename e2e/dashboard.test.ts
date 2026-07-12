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
// Tests that create/delete integrations must never run against a live target
// (LABBY_E2E_URL) — that would mutate its config and restart its scheduler.
const e2eLocalOnly = hasBrowser && !EXTERNAL ? test : test.skip;

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

e2e('backup export stays in the server filesystem', async () => {
  const page = await browser.newPage();
  let method = '';
  await page.route('**/api/backup', async (route) => {
    method = route.request().method();
    if (method === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ path: 'config/backups/labby-backup-test.json' }),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });

  await page.goto(`${BASE}/#settings`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Export backup' }).click();
  await page.waitForTimeout(100);
  expect(method).toBe('POST');
  await page.getByText('Saved to config/backups/labby-backup-test.json').waitFor({ state: 'visible', timeout: 5_000 });
  expect(page.url()).toBe(`${BASE}/#settings`);
  await page.close();
}, 30_000);

e2e('Customize dialog traps focus, closes on Escape, and returns focus to its trigger', async () => {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10_000 });

  const trigger = page.getByRole('button', { name: 'Customize interface' });
  await trigger.click();

  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });

  for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5_000 });
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
    'Customize interface',
  );

  await page.close();
}, 30_000);

e2e('Integration dialog traps focus, closes on backdrop click, and returns focus to its trigger', async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/#settings`, { waitUntil: 'load' });
  await page.locator('.svc-card').first().waitFor({ state: 'visible', timeout: 10_000 });

  const trigger = page.locator('.type-pick').first();
  const triggerLabel = await trigger.textContent();
  await trigger.click();

  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });

  for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);

  await page.mouse.click(2, 2); // far corner, outside the dialog panel
  await dialog.waitFor({ state: 'detached', timeout: 5_000 });
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe(
    triggerLabel?.trim(),
  );

  await page.close();
}, 30_000);

e2e('Service reordering is keyboard-reachable on a desktop (fine pointer) viewport', async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/#settings`, { waitUntil: 'load' });
  await page.locator('.svc-card').first().waitFor({ state: 'visible', timeout: 10_000 });

  const moveDown = page.locator('.svc-card').first().locator('button[aria-label="Move down"]');
  expect(await moveDown.isVisible()).toBe(true);

  const namesBefore = await page.locator('.svc-title h3').allTextContents();
  await moveDown.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const namesAfter = await page.locator('.svc-title h3').allTextContents();

  expect(namesAfter[0]).toBe(namesBefore[1]);
  expect(namesAfter[1]).toBe(namesBefore[0]);

  await page.close();
}, 30_000);

e2eLocalOnly('Docker widget counts only running containers as "Running"', async () => {
  const createRes = await fetch(`${BASE}/api/integrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Docker E2E',
      type: 'docker',
      enabled: true,
      refreshSeconds: 300,
      config: { show: 'all' },
    }),
  });
  const { id } = (await createRes.json()) as { id: number };

  const page = await browser.newPage();
  try {
    const containers = [
      { id: 'a', name: 'up-1', image: 'x', state: 'running', status: 'Up', cpuPercent: 1 },
      { id: 'b', name: 'up-2', image: 'x', state: 'running', status: 'Up', cpuPercent: 1 },
      { id: 'c', name: 'down-1', image: 'x', state: 'exited', status: 'Exited', cpuPercent: null },
    ];
    await page.route(`**/api/integrations/${id}/data`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ containers }),
      });
    });

    await page.goto(BASE, { waitUntil: 'load' });
    const card = page.getByRole('button', { name: /Docker E2E/ });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    const gaugeValue = await card.locator('.gauge .v').first().textContent();
    expect(gaugeValue?.trim()).toBe('2');

    await card.click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    const meta = await dialog.locator('.mm').textContent();
    expect(meta?.trim()).toBe('2/3 running');
  } finally {
    await page.close();
    await fetch(`${BASE}/api/integrations/${id}`, { method: 'DELETE' });
  }
}, 30_000);

e2e('Canceling the Customize dialog discards the unsaved custom CSS preview', async () => {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10_000 });

  const draftCss = 'body { background: rgb(1, 2, 3) !important; }';

  await page.getByRole('button', { name: 'Customize interface' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#settings-css').fill(draftCss);

  const liveWhileOpen = await page.evaluate(
    () => document.getElementById('labby-custom-css-dynamic')?.textContent ?? '',
  );
  expect(liveWhileOpen).toContain('rgb(1, 2, 3)');

  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 5_000 });

  const liveAfterCancel = await page.evaluate(
    () => document.getElementById('labby-custom-css-dynamic')?.textContent ?? '',
  );
  expect(liveAfterCancel).not.toContain('rgb(1, 2, 3)');

  await page.getByRole('button', { name: 'Customize interface' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'visible', timeout: 5_000 });
  expect(await page.locator('#settings-css').inputValue()).not.toContain('rgb(1, 2, 3)');

  await page.close();
}, 30_000);

e2eLocalOnly('Downloads modal caps the list at the configured max and reports what is hidden', async () => {
  const createRes = await fetch(`${BASE}/api/integrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Downloads E2E',
      type: 'qbittorrent',
      enabled: true,
      refreshSeconds: 300,
      config: { max: 2 },
    }),
  });
  const { id } = (await createRes.json()) as { id: number };

  const page = await browser.newPage();
  try {
    const torrents = Array.from({ length: 5 }, (_, i) => ({
      name: `torrent-${i}`,
      progress: 50,
      dlSpeed: 0,
      upSpeed: 0,
      state: 'downloading',
      hash: `hash-${i}`,
    }));
    await page.route(`**/api/integrations/${id}/data`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ torrents, aggregateDlSpeed: 0, aggregateUpSpeed: 0 }),
      });
    });

    await page.goto(BASE, { waitUntil: 'load' });
    const card = page.getByRole('button', { name: /Downloads E2E/ });
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await card.click();

    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    const rows = dialog.locator('.tor');
    await rows.first().waitFor({ state: 'visible', timeout: 5_000 });
    expect(await rows.count()).toBe(2);
    await dialog
      .getByText('+3 more not shown')
      .waitFor({ state: 'visible', timeout: 5_000 });
  } finally {
    await page.close();
    await fetch(`${BASE}/api/integrations/${id}`, { method: 'DELETE' });
  }
}, 30_000);
