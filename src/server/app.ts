import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getConfig, getConfigState, saveThemeSettings } from './config/loader';
import {
  collectMonitorSites,
  collectWeatherLocations,
  getDockerShow,
  sanitizeDashboard,
  ThemeSchema,
  LayoutSchema,
} from './config/schema';
import { getAdGuardStats, setAdGuardProtection } from './integrations/adguard';
import { getArrSummary } from './integrations/arr';
import { getBeszelSystems } from './integrations/beszel';
import { cached } from './integrations/cache';
import { getCalendarEvents } from './integrations/calendar';
import { containerAction, containerLogs, listContainers } from './integrations/docker-client';
import { getHackerNews } from './integrations/hackernews';
import { getJellyfinImage, getJellyfinSessions } from './integrations/jellyfin';
import { checkSites } from './integrations/monitor';
import { getOpenWeather } from './integrations/openweather';
import { getQBittorrentTorrents, qbittorrentAction } from './integrations/qbittorrent';
import { getRedditPosts } from './integrations/reddit';
import { getReelwardSummary } from './integrations/reelward';
import { getSpeedtestSummary, triggerSpeedtestRun } from './integrations/speedtest';
import { getTransmissionTorrents, transmissionAction } from './integrations/transmission';
import { hub } from './sse/hub';
import { refreshChannel } from './sse/scheduler';
import type { Channel } from './types';

const app = new Hono();

const WEB_DIST = path.join(process.cwd(), 'web', 'dist');
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
      patched = patched.replace('</head>', `<style id="labby-custom-css">${customCss}</style></head>`);
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

import { deleteSetting, getAllSettings, setSetting } from './db';

app.get('/api/settings', (c) => {
  const dbSettings = getAllSettings();
  delete dbSettings['dashboard'];
  return c.json(dbSettings);
});

app.post('/api/settings', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  // Full replace: the form sends the complete desired set, so any stored key
  // it omits was cleared/removed by the user and must be deleted to persist.
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'dashboard') {
      setSetting(key, value);
      process.env[key] = value;
    }
  }
  for (const key of Object.keys(getAllSettings())) {
    if (key !== 'dashboard' && !(key in body)) {
      deleteSetting(key);
      delete process.env[key];
    }
  }
  return c.json({ ok: true });
});

app.get('/api/monitor', async (c) => {
  const config = getConfig();
  if (!config) return c.json({ error: 'Config not loaded' }, 500);
  const sites = collectMonitorSites(config);
  const data = await checkSites(sites);
  return c.json(data);
});

app.get('/api/docker/containers', async (c) => {
  const config = getConfig();
  const show = config ? getDockerShow(config) : 'running';
  const data = await listContainers(show);
  return c.json(data);
});

app.post('/api/docker/containers/:id/:action', async (c) => {
  const action = c.req.param('action') as 'start' | 'stop' | 'restart';
  if (!['start', 'stop', 'restart'].includes(action)) {
    return c.json({ error: 'Invalid action' }, 400);
  }
  const result = await containerAction(c.req.param('id'), action);
  if ('error' in result) return c.json(result, 502);
  await refreshChannel('docker');
  return c.json({ ok: true });
});

app.get('/api/docker/containers/:id/logs', async (c) => {
  const tail = Number(c.req.query('tail') ?? 200);
  const result = await containerLogs(c.req.param('id'), tail);
  if ('error' in result) return c.json(result, 502);
  return c.json(result);
});

app.get('/api/downloads/:client', async (c) => {
  const client = c.req.param('client');
  if (client === 'qbittorrent') return c.json(await getQBittorrentTorrents());
  if (client === 'transmission') return c.json(await getTransmissionTorrents());
  return c.json({ error: 'Unknown client' }, 400);
});

app.post('/api/downloads/:client/:hash/:action', async (c) => {
  const client = c.req.param('client');
  const action = c.req.param('action') as 'pause' | 'resume';
  const hash = c.req.param('hash');
  if (!['pause', 'resume'].includes(action)) return c.json({ error: 'Invalid action' }, 400);

  const result =
    client === 'qbittorrent'
      ? await qbittorrentAction(hash, action)
      : client === 'transmission'
        ? await transmissionAction(hash, action)
        : { error: 'Unknown client' };

  if ('error' in result) return c.json(result, 502);
  await refreshChannel(`downloads:${client}` as Channel);
  return c.json({ ok: true });
});

app.get('/api/adguard/stats', async (c) => c.json(await getAdGuardStats()));

app.post('/api/adguard/protection', async (c) => {
  const body = await c.req.json<{ enabled: boolean; durationMs?: number }>();
  const result = await setAdGuardProtection(body.enabled, body.durationMs);
  if ('error' in result) return c.json(result, 502);
  await refreshChannel('adguard');
  return c.json({ ok: true });
});

app.get('/api/jellyfin/sessions', async (c) => c.json(await getJellyfinSessions()));

app.get('/api/beszel/systems', async (c) => c.json(await getBeszelSystems()));

app.get('/api/radarr/summary', async (c) => c.json(await getArrSummary('radarr')));

app.get('/api/sonarr/summary', async (c) => c.json(await getArrSummary('sonarr')));

app.get('/api/reelward/summary', async (c) => c.json(await getReelwardSummary()));

app.get('/api/calendar', async (c) => c.json(await getCalendarEvents()));

app.get('/api/speedtest/summary', async (c) => {
  const max = Number(c.req.query('max') ?? 10);
  return c.json(await getSpeedtestSummary(max));
});

app.post('/api/speedtest/run', async (c) => {
  const result = await triggerSpeedtestRun();
  if ('error' in result) return c.json(result, 502);
  return c.json(result);
});

app.post('/api/speedtest/refresh', async (c) => {
  await refreshChannel('speedtest');
  return c.json({ ok: true });
});

app.get('/api/weather', async (c) => {
  const config = getConfig();
  if (!config) return c.json({ error: 'Config not loaded' }, 500);
  const locations = collectWeatherLocations(config);
  if (locations.length === 0) return c.json({ locations: {} });
  const entries = await Promise.all(
    locations.map(async (loc) => [loc.key, await getOpenWeather(loc)] as const),
  );
  return c.json({ locations: Object.fromEntries(entries) });
});

app.get('/api/jellyfin/image/:id', async (c) => {
  const result = await getJellyfinImage(c.req.param('id'));
  if ('error' in result) return c.json(result, 502);
  return new Response(result.body, {
    headers: {
      'Content-Type': result.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
});

// 4-min server-side cache: the client polls every 5 min, so this collapses all
// browsers/tabs into one upstream fetch per window and rides out Reddit 429s by
// serving the last good payload (see integrations/cache.ts).
const FEED_TTL = 240_000;

app.get('/api/reddit/:subreddit', async (c) => {
  const sub = c.req.param('subreddit');
  return c.json(await cached(`reddit:${sub}`, FEED_TTL, () => getRedditPosts(sub)));
});

app.get('/api/hackernews', async (c) =>
  c.json(await cached('hackernews', FEED_TTL, () => getHackerNews())),
);

app.post('/api/theme', async (c) => {
  const body = await c.req.json<{ theme?: string; layout?: string; customCss?: string }>();
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
  return c.body(file.stream());
}

app.get('/assets/*', serveStatic);
app.get('/icons/*', serveStatic);
app.get('/fonts/*', serveStatic);
app.get('/manifest.webmanifest', serveStatic);

app.get('*', async (c) => {
  const html = await readFile(INDEX_PATH, 'utf-8').catch(() => null);
  if (!html) return c.text('Labby frontend not built. Run: bun run build', 503);
  const theme = themeFromConfig();
  let patched = html.replaceAll('__LABBY_THEME__', theme);
  const customCss = customCssFromConfig();
  patched = patched.replace('</head>', `<style id="labby-custom-css">${customCss}</style></head>`);
  return c.html(patched);
});

export { app };
