import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8099;

// Integration roster: id -> type + display name. The screenshot dashboard binds
// each widget to one of these by integrationId, and the mock SSE feeds each
// `int:<id>` channel the matching demo payload.
const INTEGRATIONS = [
  { id: 1, type: 'monitor', name: 'Services' },
  { id: 2, type: 'adguard', name: 'AdGuard Home' },
  { id: 3, type: 'speedtest', name: 'Speedtest' },
  { id: 4, type: 'calendar', name: 'Upcoming' },
  { id: 5, type: 'docker', name: 'Containers' },
  { id: 6, type: 'jellyfin', name: 'Now Playing' },
  { id: 7, type: 'weather', name: 'Weather' },
  { id: 8, type: 'beszel', name: 'Systems' },
  { id: 9, type: 'qbittorrent', name: 'qBittorrent' },
  { id: 10, type: 'transmission', name: 'Transmission' },
  { id: 11, type: 'radarr', name: 'Radarr' },
  { id: 12, type: 'sonarr', name: 'Sonarr' },
  { id: 13, type: 'reelward', name: 'Reelward' },
  { id: 14, type: 'reddit', name: 'r/homelab' },
  { id: 15, type: 'hackernews', name: 'Hacker News' },
];

async function main() {
  console.log('Starting Labby server...');
  const server = spawn('bun', ['run', 'dist/index.js'], {
    env: { ...process.env, LABBY_PORT: String(PORT), LABBY_DB_PATH: ':memory:' },
    stdio: 'ignore',
  });

  await new Promise((r) => setTimeout(r, 2000));

  console.log('Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });

  const page = await context.newPage();

  // ── Mock the SSE stream ────────────────────────────────────────────────
  // The real client opens one EventSource and, on connect, fetches
  // /api/integrations then subscribes to each `int:<id>` event. We replace
  // EventSource with a stub that replays a demo payload the moment a channel
  // is subscribed — no race with the async integration fetch.
  console.log('Mocking EventSource...');
  await page.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    const baseTime = Date.now();

    // payload per integration id (keyed as the SSE event name `int:<id>`)
    const payloads: Record<string, unknown> = {
      'int:1': {
        sites: [
          { title: 'AdGuard', checkUrl: 'http://adguardhome:3000', url: 'https://adguard.example.com', icon: 'di:adguard-home', status: 'up', latencyMs: 12 },
          { title: 'qBittorrent', checkUrl: 'http://qbittorrent:8080', url: 'https://qb.example.com', icon: 'di:qbittorrent', status: 'up', latencyMs: 18 },
          { title: 'Jellyfin', checkUrl: 'http://jellyfin:8096/health', url: 'https://jellyfin.example.com', icon: 'di:jellyfin', status: 'up', latencyMs: 9 },
          { title: 'Vaultwarden', checkUrl: 'http://vaultwarden:80', url: 'https://vault.example.com', icon: 'di:vaultwarden', status: 'up', latencyMs: 14 },
          { title: 'Immich', checkUrl: 'http://immich:2283', url: 'https://photos.example.com', icon: 'di:immich', status: 'up', latencyMs: 21 },
          { title: 'Gitea', checkUrl: 'http://gitea:3000', url: 'https://git.example.com', icon: 'di:gitea', status: 'up', latencyMs: 16 },
          { title: 'Caddy', checkUrl: 'http://caddy:2019/config', url: 'https://caddy.example.com', icon: 'di:caddy', status: 'up', latencyMs: 7 },
          { title: 'Home Assistant', checkUrl: 'http://homeassistant:8123', url: 'https://ha.example.com', icon: 'di:home-assistant', status: 'warn', latencyMs: 450 },
        ],
        summary: { up: 7, warn: 1, down: 0 },
      },
      'int:2': { queries: 32540, blockedPercent: 14.2, avgLatencyMs: 9, rulesCount: 106000, protectionEnabled: true },
      'int:3': {
        latest: { id: 1, ping: 8, download: 940000000, upload: 520000000, createdAt: new Date(baseTime).toISOString() },
        history: [
          { id: 2, ping: 9, download: 920000000, upload: 510000000, createdAt: new Date(baseTime - 3600000).toISOString() },
          { id: 3, ping: 12, download: 880000000, upload: 490000000, createdAt: new Date(baseTime - 7200000).toISOString() },
          { id: 4, ping: 8, download: 935000000, upload: 515000000, createdAt: new Date(baseTime - 10800000).toISOString() },
          { id: 5, ping: 10, download: 910000000, upload: 500000000, createdAt: new Date(baseTime - 14400000).toISOString() },
          { id: 6, ping: 11, download: 895000000, upload: 505000000, createdAt: new Date(baseTime - 18000000).toISOString() },
        ],
      },
      'int:4': {
        events: [
          { title: 'Team standup', start: now + 3600, end: now + 5400, allDay: false, location: 'Google Meet', calendar: 'Work' },
          { title: 'Dentist appointment', start: now + 86400, end: now + 90000, allDay: false, location: '123 Main St', calendar: 'Personal' },
          { title: 'Server maintenance window', start: now + 172800, end: now + 187200, allDay: true, calendar: 'Homelab' },
        ],
      },
      'int:5': {
        containers: [
          { id: '1', name: 'jellyfin', image: 'jellyfin/jellyfin:latest', state: 'running', status: 'Up 5 days', cpuPercent: 1.2 },
          { id: '2', name: 'caddy', image: 'caddy:2', state: 'running', status: 'Up 12 days', cpuPercent: 0.1 },
          { id: '3', name: 'adguard', image: 'adguard/adguardhome', state: 'running', status: 'Up 3 days', cpuPercent: 0.5 },
          { id: '4', name: 'qbittorrent', image: 'linuxserver/qbittorrent', state: 'running', status: 'Up 2 days', cpuPercent: 0.8 },
          { id: '5', name: 'vaultwarden', image: 'vaultwarden/server', state: 'running', status: 'Up 10 days', cpuPercent: 0.2 },
          { id: '6', name: 'immich', image: 'ghcr.io/immich-app/immich-server', state: 'running', status: 'Up 7 days', cpuPercent: 2.1 },
          { id: '7', name: 'beszel-agent', image: 'henrygd/beszel-agent', state: 'running', status: 'Up 15 days', cpuPercent: 0.0 },
          { id: '8', name: 'speedtest', image: 'henrygd/speedtest-tracker', state: 'running', status: 'Up 1 day', cpuPercent: 0.3 },
        ],
      },
      'int:6': {
        sessions: [
          { id: '1', title: 'Dune: Part Two', subtitle: '4K HDR · Direct Play', user: 'samuel', device: 'Apple TV', progress: 0.45, isTranscoding: false },
          { id: '2', title: 'The Bear — S03E08', subtitle: '1080p · Transcoding', user: 'alice', device: 'Chrome', progress: 0.78, isTranscoding: true },
        ],
        playing: 2,
      },
      'int:7': {
        city: 'Montreal', country: 'CA', temp: 24, feelsLike: 27, tempMin: 18, tempMax: 28,
        humidity: 62, windSpeed: 12, windDeg: 210, description: 'Partly cloudy', icon: '02d',
        sunrise: 1687166400, sunset: 1687219200, units: 'metric',
        forecast: [
          { date: '2026-06-19', label: 'Tomorrow', tempMin: 19, tempMax: 29, icon: '01d' },
          { date: '2026-06-20', label: 'Friday', tempMin: 17, tempMax: 25, icon: '10d' },
          { date: '2026-06-21', label: 'Saturday', tempMin: 20, tempMax: 30, icon: '01d' },
        ],
      },
      'int:8': {
        systems: [
          { id: 's1', name: 'pve-01', host: '10.0.1.10', status: 'up', cpuPercent: 14.2, memoryPercent: 57, diskPercent: 42, uptimeSeconds: 2592000, loadAvg: [0.8, 0.6, 0.5] },
          { id: 's2', name: 'nas-01', host: '10.0.1.20', status: 'up', cpuPercent: 3.1, memoryPercent: 28, diskPercent: 71, uptimeSeconds: 5184000, loadAvg: [0.2, 0.3, 0.2] },
          { id: 's3', name: 'rpi-dns', host: '10.0.1.5', status: 'up', cpuPercent: 1.5, memoryPercent: 42, diskPercent: 18, uptimeSeconds: 8640000, loadAvg: [0.1, 0.1, 0.1] },
        ],
        disks: [
          { id: 'd1', systemId: 's1', name: '/dev/nvme0n1', model: 'Samsung 980 Pro 1TB', type: 'NVMe', state: 'healthy', tempC: 38, capacityBytes: 1000000000000, usedPercent: 42, hours: 8760, reallocatedSectors: 0, pendingSectors: 0, offlineUncorrectable: 0, mediaErrors: 0, wearPercent: 3 },
          { id: 'd2', systemId: 's2', name: '/dev/sda', model: 'WD Red Plus 8TB', type: 'HDD', state: 'healthy', tempC: 32, capacityBytes: 8000000000000, usedPercent: 71, hours: 22000, reallocatedSectors: 0, pendingSectors: 0, offlineUncorrectable: 0, mediaErrors: 0, wearPercent: null },
          { id: 'd3', systemId: 's2', name: '/dev/sdb', model: 'WD Red Plus 8TB', type: 'HDD', state: 'healthy', tempC: 34, capacityBytes: 8000000000000, usedPercent: 71, hours: 22000, reallocatedSectors: 0, pendingSectors: 0, offlineUncorrectable: 0, mediaErrors: 0, wearPercent: null },
        ],
        summary: { up: 3, down: 0, paused: 0, pending: 0, unknown: 0 },
      },
      'int:9': {
        torrents: [
          { name: 'Ubuntu 24.04.1 LTS Desktop (amd64)', progress: 100, dlSpeed: 0, upSpeed: 125000, state: 'seeding', hash: 'a1b2c3', eta: null, ratio: 2.4 },
          { name: 'Debian 12.8 netinst (amd64)', progress: 72, dlSpeed: 4500000, upSpeed: 890000, state: 'downloading', hash: 'd4e5f6', eta: 420, ratio: 0.3 },
          { name: 'Fedora Workstation 41 Live x86_64', progress: 45, dlSpeed: 2800000, upSpeed: 150000, state: 'downloading', hash: 'g7h8i9', eta: 1200, ratio: 0.1 },
        ],
        aggregateDlSpeed: 7300000, aggregateUpSpeed: 1165000,
      },
      'int:10': {
        torrents: [
          { name: 'Arch Linux 2024.12.01 (x86_64)', progress: 100, dlSpeed: 0, upSpeed: 50000, state: 'seeding', hash: 'j1k2l3', eta: null, ratio: 3.1 },
          { name: 'openSUSE Tumbleweed DVD x86_64', progress: 88, dlSpeed: 1200000, upSpeed: 340000, state: 'downloading', hash: 'm4n5o6', eta: 180, ratio: 0.6 },
        ],
        aggregateDlSpeed: 1200000, aggregateUpSpeed: 390000,
      },
      'int:11': {
        version: '5.14.0', queue: 1, missing: 3,
        upcoming: [
          { id: 'r1', title: 'Dune: Part Three', date: '2026-11-20', status: 'announced' },
          { id: 'r2', title: 'The Batman Part II', date: '2026-10-02', status: 'announced' },
          { id: 'r3', title: 'Blade Runner 2099', date: '2027-03-15', status: 'announced' },
        ],
      },
      'int:12': {
        version: '4.0.11', queue: 0, missing: 2,
        upcoming: [
          { id: 's1', title: 'Severance — S03E01', date: '2026-09-12', status: 'upcoming' },
          { id: 's2', title: 'The Last of Us — S03E01', date: '2026-08-04', status: 'upcoming' },
          { id: 's3', title: 'Arcane — S03E01', date: '2027-01-10', status: 'upcoming' },
        ],
      },
      'int:13': {
        upcoming: [
          { id: 'rw1', title: 'Nosferatu Extended', date: '2026-08-15' },
          { id: 'rw2', title: 'Mickey 17', date: '2026-07-22' },
        ],
        trackers: [
          { name: 'BHD', connected: true, ratio: 2.8 },
          { name: 'PTP', connected: true, ratio: 1.5 },
        ],
        rss: { status: 'ok', releasesFound: 48, releasesGrabbed: 12, nextRunAt: null },
      },
      'int:14': {
        subreddit: 'r/homelab',
        posts: [
          { title: 'Finally finished my 42U rack build — full network diagram inside', url: 'https://reddit.com/r/homelab/1', score: 2847, comments: 312, subreddit: 'r/homelab', createdUtc: now - 7200 },
          { title: 'Moving from Proxmox to bare-metal NixOS — my experience after 6 months', url: 'https://reddit.com/r/homelab/2', score: 1523, comments: 189, subreddit: 'r/homelab', createdUtc: now - 14400 },
          { title: 'PSA: WD Red Plus 8TB on sale at Amazon — lowest price ever', url: 'https://reddit.com/r/homelab/3', score: 892, comments: 67, subreddit: 'r/homelab', createdUtc: now - 21600 },
          { title: 'How I automated my entire media stack with just 3 containers', url: 'https://reddit.com/r/homelab/4', score: 634, comments: 45, subreddit: 'r/homelab', createdUtc: now - 28800 },
          { title: 'Is anyone else running Beszel for monitoring? Just switched from Uptime Kuma', url: 'https://reddit.com/r/homelab/5', score: 421, comments: 78, subreddit: 'r/homelab', createdUtc: now - 36000 },
        ],
      },
      'int:15': {
        posts: [
          { title: 'Show HN: I built a homelab dashboard that replaces 5 different tools', url: 'https://news.ycombinator.com/1', score: 547, comments: 203, author: 'labbuilder', createdUtc: now - 3600 },
          { title: 'SQLite is not a toy database (2024)', url: 'https://news.ycombinator.com/2', score: 1284, comments: 412, author: 'sqlite_fan', createdUtc: now - 10800 },
          { title: 'Understanding Linux networking for homelabbers', url: 'https://news.ycombinator.com/3', score: 389, comments: 92, author: 'netadmin', createdUtc: now - 18000 },
          { title: 'The state of self-hosted alternatives in 2026', url: 'https://news.ycombinator.com/4', score: 721, comments: 156, author: 'selfhoster', createdUtc: now - 25200 },
          { title: 'Bun 2.0 released with native SQLite improvements', url: 'https://news.ycombinator.com/5', score: 892, comments: 234, author: 'bundev', createdUtc: now - 32400 },
        ],
      },
    };

    class MockEventSource {
      url: string;
      onopen?: () => void;
      onerror?: () => void;
      _listeners: Record<string, ((e: MessageEvent) => void)[]> = {};

      constructor(url: string) {
        this.url = url;
        // fire open so the client proceeds to fetch /api/integrations + subscribe
        setTimeout(() => this.onopen?.(), 80);
      }

      addEventListener(event: string, handler: (e: MessageEvent) => void) {
        (this._listeners[event] ??= []).push(handler);
        // replay this channel's snapshot as soon as it's subscribed
        if (event in payloads) {
          const e = new Event(event) as MessageEvent;
          (e as unknown as { data: string }).data = JSON.stringify(payloads[event]);
          setTimeout(() => handler(e), 0);
        }
      }

      close() {}
    }
    (window as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  });

  // ── Mock /api/integrations: the roster the client subscribes against ────
  console.log('Mocking integrations endpoint...');
  await page.route('**/api/integrations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        INTEGRATIONS.map((i) => ({ id: i.id, name: i.name, type: i.type, config: {}, enabled: true, refreshSeconds: null })),
      ),
    });
  });

  // ── Mock /api/config: widgets bind to integrations by integrationId ─────
  console.log('Mocking config endpoint...');
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Labby',
        theme: { default: 'dark', layout: 'masonry', density: 'compact' },
        pages: [
          {
            name: 'Overview',
            columns: [
              {
                size: 'small',
                widgets: [
                  { type: 'monitor', title: 'Services', integrationId: 1, style: 'compact' },
                  { type: 'adguard', title: 'AdGuard Home', integrationId: 2 },
                  { type: 'speedtest', title: 'Speedtest', integrationId: 3, max: 6 },
                  { type: 'calendar', title: 'Upcoming', integrationId: 4, max: 5 },
                ],
              },
              {
                size: 'full',
                widgets: [
                  { type: 'docker', title: 'Containers', integrationId: 5 },
                  { type: 'jellyfin', title: 'Now Playing', integrationId: 6 },
                  { type: 'weather', title: 'Weather', integrationId: 7 },
                  { type: 'beszel', title: 'Systems', integrationId: 8, max: 5 },
                ],
              },
              {
                size: 'small',
                widgets: [
                  { type: 'downloads', title: 'qBittorrent', integrationId: 9, max: 5 },
                  { type: 'downloads', title: 'Transmission', integrationId: 10, max: 5 },
                  { type: 'radarr', title: 'Radarr', integrationId: 11, max: 5 },
                  { type: 'sonarr', title: 'Sonarr', integrationId: 12, max: 5 },
                  { type: 'reelward', title: 'Reelward', integrationId: 13, max: 5 },
                ],
              },
              {
                size: 'small',
                widgets: [
                  { type: 'reddit', title: 'r/homelab', integrationId: 14, max: 5 },
                  { type: 'hackernews', title: 'Hacker News', integrationId: 15, max: 5 },
                ],
              },
            ],
          },
        ],
      }),
    });
  });

  console.log('Navigating to Labby...');
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });

  // Wait for the mock snapshots to render into every widget.
  await new Promise((r) => setTimeout(r, 3000));

  console.log('Taking screenshot...');
  await page.evaluate(() => (document.body.style.overflow = 'hidden'));

  const pkg = require('../package.json');
  const version = pkg.version;
  const filename = `screenshot-v${version}.png`;
  const filepath = `docs/${filename}`;

  await page.screenshot({ path: filepath, fullPage: false });

  console.log(`Saved ${filepath}`);
  await browser.close();
  server.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
