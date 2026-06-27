import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { getConfig, getConfigState, reloadConfig, saveThemeSettings } from './config/loader';
import { DashboardSchema, DensitySchema, LayoutSchema, sanitizeDashboard, ThemeSchema } from './config/schema';
import {
  createIntegration,
  db,
  deleteIntegration,
  getIntegration,
  getSetting,
  listIntegrations,
  replaceAllIntegrations,
  reorderIntegrations,
  setSetting,
  updateIntegration,
} from './db';
import { containerLogs, type DockerConfig } from './integrations/docker-client';
import { resolveFavicon } from './integrations/favicon';
import { getJellyfinImage, type JellyfinConfig } from './integrations/jellyfin';
import { INTEGRATIONS, type IntegrationType, integrationTypes } from './integrations/registry';
import { hub } from './sse/hub';
import { refreshIntegration, startScheduler } from './sse/scheduler';

const app = new Hono();

const WEB_DIST = path.join(process.cwd(), 'src', 'web', 'dist');
const INDEX_PATH = path.join(WEB_DIST, 'index.html');

function themeFromConfig(): string {
  const config = getConfig();
  const def = config?.theme.default ?? 'system';
  if (def !== 'system') return def;
  return '';
}

function customCssFromConfig(): string {
  const config = getConfig();
  return config?.theme.customCss ?? '';
}

app.use('*', async (c, next) => {
  if (c.req.path === '/' || c.req.path === '/index.html') {
    const html = await readFile(INDEX_PATH, 'utf-8').catch(() => null);
    if (html) {
      const theme = themeFromConfig();
      let patched = html.replaceAll('__LABBY_THEME__', theme);
      const customCss = customCssFromConfig();
      patched = patched.replace(
        '</head>',
        `<style id="labby-custom-css">${customCss}</style></head>`,
      );
      // HTML must always revalidate so a new build's hashed assets are picked up
      // (assets themselves are immutable-cached in serveStatic).
      c.header('Cache-Control', 'no-cache');
      return c.html(patched);
    }
  }
  await next();
});

app.get('/api/config', (c) => {
  const state = getConfigState();
  if (!state.ok) return c.json({ error: state.error }, 500);
  return c.json(sanitizeDashboard(state.config));
});

app.get('/api/favicon', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ icon: null });
  return c.json(await resolveFavicon(url));
});

app.get('/api/integrations/types', (c) => c.json(integrationTypes()));

app.get('/api/integrations', (c) => c.json(listIntegrations()));

app.post('/api/integrations', async (c) => {
  const b = await c.req.json();
  if (!b.name || !b.type) return c.json({ error: 'name and type required' }, 400);
  const row = createIntegration({
    name: b.name,
    type: b.type,
    config: b.config ?? {},
    enabled: b.enabled ?? true,
    refreshSeconds: b.refreshSeconds ?? null,
  });
  startScheduler();
  return c.json(row);
});

app.put('/api/integrations/:id', async (c) => {
  const b = await c.req.json();
  if (!b.name || !b.type) return c.json({ error: 'name and type required' }, 400);
  const row = updateIntegration(Number(c.req.param('id')), {
    name: b.name,
    type: b.type,
    config: b.config ?? {},
    enabled: b.enabled ?? true,
    refreshSeconds: b.refreshSeconds ?? null,
  });
  if (!row) return c.json({ error: 'Not found' }, 404);
  startScheduler();
  return c.json(row);
});

app.delete('/api/integrations/:id', (c) => {
  deleteIntegration(Number(c.req.param('id')));
  startScheduler();
  return c.json({ ok: true });
});

app.post('/api/integrations/reorder', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid reorder payload' }, 400);
  reorderIntegrations(parsed.data.ids);
  return c.json({ ok: true });
});

app.get('/api/integrations/:id/data', async (c) => {
  const row = getIntegration(Number(c.req.param('id')));
  if (!row) return c.json({ error: 'Not found' }, 404);
  const def = INTEGRATIONS[row.type as IntegrationType];
  if (!def) return c.json({ error: `Unknown integration type: ${row.type}` }, 400);
  return c.json(await def.fetch(row.config));
});

app.post('/api/integrations/:id/action/:action', async (c) => {
  const row = getIntegration(Number(c.req.param('id')));
  if (!row) return c.json({ error: 'Not found' }, 404);
  const def = INTEGRATIONS[row.type as IntegrationType];
  const fn = def?.actions?.[c.req.param('action')];
  if (!fn) return c.json({ error: 'Unknown action' }, 400);
  const body = await c.req.json<{ args?: unknown[] }>().catch(() => ({ args: [] }));
  const result = await fn(row.config, ...(body.args ?? []));
  if (result && typeof result === 'object' && 'error' in result) return c.json(result, 502);
  await refreshIntegration(row.id).catch(() => {});
  return c.json({ ok: true });
});

app.get('/api/integrations/:id/jellyfin-image/:itemId', async (c) => {
  const row = getIntegration(Number(c.req.param('id')));
  if (!row || row.type !== 'jellyfin') return c.json({ error: 'Not found' }, 404);
  const result = await getJellyfinImage(row.config as JellyfinConfig, c.req.param('itemId'));
  if ('error' in result) return c.json(result, 502);
  return new Response(result.body, {
    headers: {
      'Content-Type': result.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
});

app.get('/api/integrations/:id/logs/:containerId', async (c) => {
  const row = getIntegration(Number(c.req.param('id')));
  if (!row || row.type !== 'docker') return c.json({ error: 'Not found' }, 404);
  const tail = Number(c.req.query('tail') ?? 200);
  const result = await containerLogs(row.config as DockerConfig, c.req.param('containerId'), tail);
  if ('error' in result) return c.json(result, 502);
  return c.json(result);
});

app.post('/api/theme', async (c) => {
  const body = await c.req.json<{
    theme?: string;
    layout?: string;
    density?: string;
    customCss?: string;
  }>();
  const updates: Parameters<typeof saveThemeSettings>[0] = {};

  if (body.theme !== undefined) {
    const parsed = ThemeSchema.safeParse(body.theme);
    if (!parsed.success) {
      return c.json({ error: 'Invalid theme' }, 400);
    }
    updates.default = parsed.data;
  }
  if (body.layout !== undefined) {
    const parsed = LayoutSchema.safeParse(body.layout);
    if (!parsed.success) {
      return c.json({ error: 'Invalid layout' }, 400);
    }
    updates.layout = parsed.data;
  }
  if (body.density !== undefined) {
    const parsed = DensitySchema.safeParse(body.density);
    if (!parsed.success) {
      return c.json({ error: 'Invalid density' }, 400);
    }
    updates.density = parsed.data;
  }
  if (body.customCss !== undefined) {
    updates.customCss = body.customCss;
  }

  await saveThemeSettings(updates);
  return c.json({ ok: true });
});

app.get('/api/stream', (c) =>
  streamSSE(c, async (stream) => {
    const snapshot = hub.getSnapshot();
    for (const [channel, data] of snapshot) {
      try {
        await stream.writeSSE({ event: channel, data: JSON.stringify(data) });
      } catch {
        return; // client disconnected mid-replay
      }
    }

    // Writes to a closed stream reject; swallow so a disconnected client never
    // produces an unhandled rejection.
    const unsub = hub.subscribe((msg) => {
      stream.writeSSE({ event: msg.channel, data: JSON.stringify(msg.data) }).catch(() => {});
    });

    const keepalive = setInterval(() => {
      stream.write(': ping\n\n').catch(() => {});
    }, 15000);

    let resolve: () => void;
    const abortPromise = new Promise<void>((r) => {
      resolve = r;
    });

    stream.onAbort(() => {
      clearInterval(keepalive);
      unsub();
      resolve();
    });

    await abortPromise;
  }),
);

async function serveStatic(c: Context) {
  // Resolve under WEB_DIST and reject anything that escapes it via `../` traversal.
  const resolved = path.resolve(WEB_DIST, `.${c.req.path}`);
  if (resolved !== WEB_DIST && !resolved.startsWith(WEB_DIST + path.sep)) {
    return c.notFound();
  }
  const file = Bun.file(resolved);
  if (!(await file.exists())) return c.notFound();
  // Set an explicit Content-Type — c.body() does not infer it, and browsers
  // reject JS modules / CSS served without the correct MIME type.
  c.header('Content-Type', file.type || 'application/octet-stream');
  if (c.req.path === '/sw.js' || c.req.path === '/manifest.webmanifest') {
    c.header('Cache-Control', 'no-cache');
  } else {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return c.body(file.stream());
}

app.get('/assets/*', serveStatic);
app.get('/icons/*', serveStatic);
app.get('/fonts/*', serveStatic);
app.get('/manifest.webmanifest', serveStatic);
app.get('/sw.js', serveStatic);

// --- backup / restore ---
app.get('/api/backup', (c) => {
  const dashboardRaw = getSetting('dashboard');
  let dashboard: unknown = null;
  if (dashboardRaw) {
    try {
      dashboard = JSON.parse(dashboardRaw);
    } catch {
      dashboard = null; // corrupt row — export best-effort rather than 500
    }
  }
  const exportedAt = new Date().toISOString();
  const body = {
    version: 1 as const,
    exportedAt,
    dashboard,
    integrations: listIntegrations(),
  };
  c.header('Content-Type', 'application/json');
  c.header(
    'Content-Disposition',
    `attachment; filename="labby-backup-${exportedAt.slice(0, 10)}.json"`,
  );
  return c.body(JSON.stringify(body, null, 2));
});

const INTEGRATION_TYPES = Object.keys(INTEGRATIONS) as [IntegrationType, ...IntegrationType[]];

const RestoreSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  // Export emits null when the dashboard row is missing/corrupt; accept it back.
  dashboard: DashboardSchema.nullable(),
  integrations: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      // Reject unknown types so a corrupt/hand-edited backup can't write rows
      // the scheduler and UI will silently drop.
      type: z.enum(INTEGRATION_TYPES),
      config: z.record(z.unknown()),
      enabled: z.boolean(),
      refreshSeconds: z.number().int().nullable(),
      position: z.number().int().optional(),
    }),
  ),
});

app.post('/api/restore', async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = RestoreSchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid backup file' }, 400);
  }
  const { dashboard, integrations } = parsed.data;
  // Atomic: integrations + dashboard land together or not at all, so a crash
  // mid-restore can't leave a half-applied (split-brain) state.
  db.transaction(() => {
    replaceAllIntegrations(integrations);
    if (dashboard) setSetting('dashboard', JSON.stringify(dashboard, null, 2));
  })();
  await reloadConfig();
  startScheduler();
  return c.json({ ok: true });
});

app.get('*', async (c) => {
  const html = await readFile(INDEX_PATH, 'utf-8').catch(() => null);
  if (!html) return c.text('Labby frontend not built. Run: bun run build', 503);
  const theme = themeFromConfig();
  let patched = html.replaceAll('__LABBY_THEME__', theme);
  const customCss = customCssFromConfig();
  patched = patched.replace('</head>', `<style id="labby-custom-css">${customCss}</style></head>`);
  c.header('Cache-Control', 'no-cache');
  return c.html(patched);
});

export { app };
