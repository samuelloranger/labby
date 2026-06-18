import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8099;

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

  console.log('Mocking EventSource...');
  await page.addInitScript(() => {
    class MockEventSource {
      url: string;
      onopen?: () => void;
      onerror?: () => void;
      _listeners: Record<string, ((e: any) => void)[]>;

      constructor(url: string) {
        this.url = url;
        this._listeners = {};

        setTimeout(() => {
          if (this.onopen) this.onopen();

          const push = (event: string, data: any) => {
            const e: any = new Event(event);
            e.data = JSON.stringify(data);
            if (this._listeners[event]) {
              for (const h of this._listeners[event]) h(e);
            }
          };

          // ── Monitor (Core services — compact rows) ────────────────────
          push('monitor', {
            sites: [
              {
                title: 'AdGuard',
                checkUrl: 'http://adguardhome:3000',
                url: 'https://adguard.example.com',
                icon: 'di:adguard-home',
                status: 'up',
                latencyMs: 12,
              },
              {
                title: 'qBittorrent',
                checkUrl: 'http://qbittorrent:8080',
                url: 'https://qb.example.com',
                icon: 'di:qbittorrent',
                status: 'up',
                latencyMs: 5,
              },
              {
                title: 'Jellyfin',
                checkUrl: 'http://jellyfin:8096/health',
                url: 'https://jellyfin.example.com',
                icon: 'di:jellyfin',
                status: 'up',
                latencyMs: 25,
              },
              {
                title: 'Vaultwarden',
                checkUrl: 'http://vaultwarden:80',
                url: 'https://vault.example.com',
                icon: 'di:vaultwarden',
                status: 'up',
                latencyMs: 8,
              },
              {
                title: 'Immich',
                checkUrl: 'http://immich:2283',
                url: 'https://photos.example.com',
                icon: 'di:immich',
                status: 'up',
                latencyMs: 18,
              },
              {
                title: 'Gitea',
                checkUrl: 'http://gitea:3000',
                url: 'https://git.example.com',
                icon: 'di:gitea',
                status: 'up',
                latencyMs: 14,
              },
              {
                title: 'Caddy',
                checkUrl: 'http://caddy:2019/config',
                url: 'https://caddy.example.com',
                icon: 'di:caddy',
                status: 'up',
                latencyMs: 3,
              },
              {
                title: 'Home Assistant',
                checkUrl: 'http://homeassistant:8123',
                url: 'https://ha.example.com',
                icon: 'di:home-assistant',
                status: 'warn',
                latencyMs: 450,
              },
            ],
            summary: { up: 7, warn: 1, down: 0 },
          });

          // ── Docker ────────────────────────────────────────────────────
          push('docker', {
            containers: [
              {
                id: '1',
                name: 'jellyfin',
                image: 'jellyfin/jellyfin:latest',
                state: 'running',
                status: 'Up 5 days',
                cpuPercent: 1.2,
              },
              {
                id: '2',
                name: 'caddy',
                image: 'caddy:2',
                state: 'running',
                status: 'Up 12 days',
                cpuPercent: 0.1,
              },
              {
                id: '3',
                name: 'adguard',
                image: 'adguard/adguardhome',
                state: 'running',
                status: 'Up 3 days',
                cpuPercent: 0.5,
              },
              {
                id: '4',
                name: 'qbittorrent',
                image: 'linuxserver/qbittorrent',
                state: 'running',
                status: 'Up 2 days',
                cpuPercent: 0.8,
              },
              {
                id: '5',
                name: 'vaultwarden',
                image: 'vaultwarden/server',
                state: 'running',
                status: 'Up 10 days',
                cpuPercent: 0.2,
              },
              {
                id: '6',
                name: 'immich',
                image: 'ghcr.io/immich-app/immich-server',
                state: 'running',
                status: 'Up 7 days',
                cpuPercent: 2.1,
              },
              {
                id: '7',
                name: 'beszel-agent',
                image: 'henrygd/beszel-agent',
                state: 'running',
                status: 'Up 15 days',
                cpuPercent: 0.0,
              },
              {
                id: '8',
                name: 'speedtest',
                image: 'henrygd/speedtest-tracker',
                state: 'running',
                status: 'Up 1 day',
                cpuPercent: 0.3,
              },
            ],
          });

          // ── Downloads: qBittorrent ────────────────────────────────────
          push('downloads:qbittorrent', {
            torrents: [
              {
                name: 'Ubuntu 24.04.1 LTS Desktop (amd64)',
                progress: 100,
                dlSpeed: 0,
                upSpeed: 125000,
                state: 'seeding',
                hash: 'a1b2c3',
                eta: null,
                ratio: 2.4,
              },
              {
                name: 'Debian 12.8 netinst (amd64)',
                progress: 72,
                dlSpeed: 4500000,
                upSpeed: 890000,
                state: 'downloading',
                hash: 'd4e5f6',
                eta: 420,
                ratio: 0.3,
              },
              {
                name: 'Fedora Workstation 41 Live x86_64',
                progress: 45,
                dlSpeed: 2800000,
                upSpeed: 150000,
                state: 'downloading',
                hash: 'g7h8i9',
                eta: 1200,
                ratio: 0.1,
              },
            ],
            aggregateDlSpeed: 7300000,
            aggregateUpSpeed: 1165000,
          });

          // ── Downloads: Transmission ───────────────────────────────────
          push('downloads:transmission', {
            torrents: [
              {
                name: 'Arch Linux 2024.12.01 (x86_64)',
                progress: 100,
                dlSpeed: 0,
                upSpeed: 50000,
                state: 'seeding',
                hash: 'j1k2l3',
                eta: null,
                ratio: 3.1,
              },
              {
                name: 'openSUSE Tumbleweed DVD x86_64',
                progress: 88,
                dlSpeed: 1200000,
                upSpeed: 340000,
                state: 'downloading',
                hash: 'm4n5o6',
                eta: 180,
                ratio: 0.6,
              },
            ],
            aggregateDlSpeed: 1200000,
            aggregateUpSpeed: 390000,
          });

          // ── AdGuard ───────────────────────────────────────────────────
          push('adguard', {
            queries: 32540,
            blockedPercent: 14.2,
            avgLatencyMs: 9,
            rulesCount: 106000,
            protectionEnabled: true,
          });

          // ── Jellyfin ──────────────────────────────────────────────────
          push('jellyfin', {
            sessions: [
              {
                id: '1',
                title: 'Dune: Part Two',
                subtitle: '4K HDR · Direct Play',
                user: 'samuel',
                device: 'Apple TV',
                progress: 0.45,
                isTranscoding: false,
              },
              {
                id: '2',
                title: 'The Bear — S03E08',
                subtitle: '1080p · Transcoding',
                user: 'alice',
                device: 'Chrome',
                progress: 0.78,
                isTranscoding: true,
              },
            ],
            playing: 2,
          });

          // ── Beszel (system monitoring) ────────────────────────────────
          push('beszel', {
            systems: [
              {
                id: 's1',
                name: 'pve-01',
                host: '10.0.1.10',
                status: 'up',
                cpuPercent: 14.2,
                memoryPercent: 57,
                diskPercent: 42,
                uptimeSeconds: 2592000,
                loadAvg: [0.8, 0.6, 0.5],
              },
              {
                id: 's2',
                name: 'nas-01',
                host: '10.0.1.20',
                status: 'up',
                cpuPercent: 3.1,
                memoryPercent: 28,
                diskPercent: 71,
                uptimeSeconds: 5184000,
                loadAvg: [0.2, 0.3, 0.2],
              },
              {
                id: 's3',
                name: 'rpi-dns',
                host: '10.0.1.5',
                status: 'up',
                cpuPercent: 1.5,
                memoryPercent: 42,
                diskPercent: 18,
                uptimeSeconds: 8640000,
                loadAvg: [0.1, 0.1, 0.1],
              },
            ],
            disks: [
              {
                id: 'd1',
                systemId: 's1',
                name: '/dev/nvme0n1',
                model: 'Samsung 980 Pro 1TB',
                type: 'NVMe',
                state: 'healthy',
                tempC: 38,
                capacityBytes: 1000000000000,
                usedPercent: 42,
                hours: 8760,
                reallocatedSectors: 0,
                pendingSectors: 0,
                offlineUncorrectable: 0,
                mediaErrors: 0,
                wearPercent: 3,
              },
              {
                id: 'd2',
                systemId: 's2',
                name: '/dev/sda',
                model: 'WD Red Plus 8TB',
                type: 'HDD',
                state: 'healthy',
                tempC: 32,
                capacityBytes: 8000000000000,
                usedPercent: 71,
                hours: 22000,
                reallocatedSectors: 0,
                pendingSectors: 0,
                offlineUncorrectable: 0,
                mediaErrors: 0,
                wearPercent: null,
              },
              {
                id: 'd3',
                systemId: 's2',
                name: '/dev/sdb',
                model: 'WD Red Plus 8TB',
                type: 'HDD',
                state: 'healthy',
                tempC: 34,
                capacityBytes: 8000000000000,
                usedPercent: 71,
                hours: 22000,
                reallocatedSectors: 0,
                pendingSectors: 0,
                offlineUncorrectable: 0,
                mediaErrors: 0,
                wearPercent: null,
              },
            ],
            summary: { up: 3, down: 0, paused: 0, pending: 0, unknown: 0 },
          });

          // ── Radarr ────────────────────────────────────────────────────
          push('radarr', {
            version: '5.14.0',
            queue: 1,
            missing: 3,
            upcoming: [
              { id: 'r1', title: 'Dune: Part Three', date: '2026-11-20', status: 'announced' },
              { id: 'r2', title: 'The Batman Part II', date: '2026-10-02', status: 'announced' },
              { id: 'r3', title: 'Blade Runner 2099', date: '2027-03-15', status: 'announced' },
            ],
          });

          // ── Sonarr ────────────────────────────────────────────────────
          push('sonarr', {
            version: '4.0.11',
            queue: 0,
            missing: 2,
            upcoming: [
              { id: 's1', title: 'Severance — S03E01', date: '2026-09-12', status: 'upcoming' },
              {
                id: 's2',
                title: 'The Last of Us — S03E01',
                date: '2026-08-04',
                status: 'upcoming',
              },
              { id: 's3', title: 'Arcane — S03E01', date: '2027-01-10', status: 'upcoming' },
            ],
          });

          // ── Reelward ──────────────────────────────────────────────────
          push('reelward', {
            upcoming: [
              { id: 'rw1', title: 'Nosferatu Extended', date: '2026-08-15' },
              { id: 'rw2', title: 'Mickey 17', date: '2026-07-22' },
            ],
            trackers: [
              { name: 'BHD', connected: true, ratio: 2.8 },
              { name: 'PTP', connected: true, ratio: 1.5 },
            ],
            rss: {
              status: 'ok',
              releasesFound: 48,
              releasesGrabbed: 12,
              nextRunAt: null,
            },
          });

          // ── Weather ───────────────────────────────────────────────────
          push('weather', {
            locations: {
              'city:Montreal': {
                city: 'Montreal',
                country: 'CA',
                temp: 24,
                feelsLike: 27,
                tempMin: 18,
                tempMax: 28,
                humidity: 62,
                windSpeed: 12,
                windDeg: 210,
                description: 'Partly cloudy',
                icon: '02d',
                sunrise: 1687166400,
                sunset: 1687219200,
                units: 'metric',
                forecast: [
                  { date: '2026-06-19', label: 'Tomorrow', tempMin: 19, tempMax: 29, icon: '01d' },
                  { date: '2026-06-20', label: 'Friday', tempMin: 17, tempMax: 25, icon: '10d' },
                  { date: '2026-06-21', label: 'Saturday', tempMin: 20, tempMax: 30, icon: '01d' },
                ],
              },
            },
          });

          // ── Calendar ──────────────────────────────────────────────────
          const now = Math.floor(Date.now() / 1000);
          push('calendar', {
            events: [
              {
                title: 'Team standup',
                start: now + 3600,
                end: now + 5400,
                allDay: false,
                location: 'Google Meet',
                calendar: 'Work',
              },
              {
                title: 'Dentist appointment',
                start: now + 86400,
                end: now + 90000,
                allDay: false,
                location: '123 Main St',
                calendar: 'Personal',
              },
              {
                title: 'Server maintenance window',
                start: now + 172800,
                end: now + 187200,
                allDay: true,
                calendar: 'Homelab',
              },
            ],
          });

          // ── Speedtest ─────────────────────────────────────────────────
          const baseTime = Date.now();
          push('speedtest', {
            latest: {
              id: 1,
              ping: 8,
              download: 940000000,
              upload: 520000000,
              createdAt: new Date(baseTime).toISOString(),
            },
            history: [
              {
                id: 2,
                ping: 9,
                download: 920000000,
                upload: 510000000,
                createdAt: new Date(baseTime - 3600000).toISOString(),
              },
              {
                id: 3,
                ping: 12,
                download: 880000000,
                upload: 490000000,
                createdAt: new Date(baseTime - 7200000).toISOString(),
              },
              {
                id: 4,
                ping: 8,
                download: 935000000,
                upload: 515000000,
                createdAt: new Date(baseTime - 10800000).toISOString(),
              },
              {
                id: 5,
                ping: 10,
                download: 910000000,
                upload: 500000000,
                createdAt: new Date(baseTime - 14400000).toISOString(),
              },
              {
                id: 6,
                ping: 11,
                download: 895000000,
                upload: 505000000,
                createdAt: new Date(baseTime - 18000000).toISOString(),
              },
            ],
          });
        }, 1000);
      }

      addEventListener(event: string, handler: (e: any) => void) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
      }

      close() {}
    }
    (window as any).EventSource = MockEventSource;
  });

  // ── Mock REST endpoints for reddit & hackernews feeds ─────────────
  console.log('Mocking feed endpoints...');
  await page.route('**/api/reddit/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        posts: [
          {
            title: 'Finally finished my 42U rack build — full network diagram inside',
            url: 'https://reddit.com/r/homelab/1',
            score: 2847,
            comments: 312,
            subreddit: 'r/homelab',
            createdUtc: Math.floor(Date.now() / 1000) - 7200,
          },
          {
            title: 'Moving from Proxmox to bare-metal NixOS — my experience after 6 months',
            url: 'https://reddit.com/r/homelab/2',
            score: 1523,
            comments: 189,
            subreddit: 'r/homelab',
            createdUtc: Math.floor(Date.now() / 1000) - 14400,
          },
          {
            title: 'PSA: WD Red Plus 8TB on sale at Amazon — lowest price ever',
            url: 'https://reddit.com/r/homelab/3',
            score: 892,
            comments: 67,
            subreddit: 'r/homelab',
            createdUtc: Math.floor(Date.now() / 1000) - 21600,
          },
          {
            title: 'How I automated my entire media stack with just 3 containers',
            url: 'https://reddit.com/r/homelab/4',
            score: 634,
            comments: 45,
            subreddit: 'r/homelab',
            createdUtc: Math.floor(Date.now() / 1000) - 28800,
          },
          {
            title: 'Is anyone else running Beszel for monitoring? Just switched from Uptime Kuma',
            url: 'https://reddit.com/r/homelab/5',
            score: 421,
            comments: 78,
            subreddit: 'r/homelab',
            createdUtc: Math.floor(Date.now() / 1000) - 36000,
          },
        ],
      }),
    });
  });

  await page.route('**/api/hackernews', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        posts: [
          {
            title: 'Show HN: I built a homelab dashboard that replaces 5 different tools',
            url: 'https://news.ycombinator.com/1',
            score: 547,
            comments: 203,
            author: 'labbuilder',
            createdUtc: Math.floor(Date.now() / 1000) - 3600,
          },
          {
            title: 'SQLite is not a toy database (2024)',
            url: 'https://news.ycombinator.com/2',
            score: 1284,
            comments: 412,
            author: 'sqlite_fan',
            createdUtc: Math.floor(Date.now() / 1000) - 10800,
          },
          {
            title: 'Understanding Linux networking for homelabbers',
            url: 'https://news.ycombinator.com/3',
            score: 389,
            comments: 92,
            author: 'netadmin',
            createdUtc: Math.floor(Date.now() / 1000) - 18000,
          },
          {
            title: 'The state of self-hosted alternatives in 2026',
            url: 'https://news.ycombinator.com/4',
            score: 721,
            comments: 156,
            author: 'selfhoster',
            createdUtc: Math.floor(Date.now() / 1000) - 25200,
          },
          {
            title: 'Bun 2.0 released with native SQLite improvements',
            url: 'https://news.ycombinator.com/5',
            score: 892,
            comments: 234,
            author: 'bundev',
            createdUtc: Math.floor(Date.now() / 1000) - 32400,
          },
        ],
      }),
    });
  });

  // ── Mock the /api/config to include ALL widget types ──────────────
  console.log('Mocking config endpoint...');
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Labby',
        theme: { default: 'dark', layout: 'masonry' },
        refreshSeconds: {},
        pages: [
          {
            name: 'Overview',
            columns: [
              {
                size: 'small',
                widgets: [
                  {
                    type: 'monitor',
                    title: 'Services',
                    style: 'compact',
                    sites: [
                      {
                        title: 'AdGuard',
                        url: 'https://adguard.example.com',
                        checkUrl: 'http://adguardhome:3000',
                        icon: 'di:adguard-home',
                      },
                      {
                        title: 'qBittorrent',
                        url: 'https://qb.example.com',
                        checkUrl: 'http://qbittorrent:8080',
                        icon: 'di:qbittorrent',
                      },
                      {
                        title: 'Jellyfin',
                        url: 'https://jellyfin.example.com',
                        checkUrl: 'http://jellyfin:8096/health',
                        icon: 'di:jellyfin',
                      },
                      {
                        title: 'Vaultwarden',
                        url: 'https://vault.example.com',
                        checkUrl: 'http://vaultwarden:80',
                        icon: 'di:vaultwarden',
                      },
                      {
                        title: 'Immich',
                        url: 'https://photos.example.com',
                        checkUrl: 'http://immich:2283',
                        icon: 'di:immich',
                      },
                      {
                        title: 'Gitea',
                        url: 'https://git.example.com',
                        checkUrl: 'http://gitea:3000',
                        icon: 'di:gitea',
                      },
                      {
                        title: 'Caddy',
                        url: 'https://caddy.example.com',
                        checkUrl: 'http://caddy:2019/config',
                        icon: 'di:caddy',
                      },
                      {
                        title: 'Home Assistant',
                        url: 'https://ha.example.com',
                        checkUrl: 'http://homeassistant:8123',
                        icon: 'di:home-assistant',
                      },
                    ],
                  },
                  { type: 'adguard', title: 'AdGuard Home' },
                  { type: 'speedtest', title: 'Speedtest', max: 6 },
                  { type: 'calendar', title: 'Upcoming', max: 5 },
                ],
              },
              {
                size: 'full',
                widgets: [
                  { type: 'docker', title: 'Containers', show: 'running' },
                  { type: 'jellyfin', title: 'Now Playing' },
                  { type: 'weather', title: 'Weather', city: 'Montreal' },
                  { type: 'beszel', title: 'Systems', max: 5 },
                ],
              },
              {
                size: 'small',
                widgets: [
                  { type: 'downloads', title: 'qBittorrent', client: 'qbittorrent', max: 5 },
                  { type: 'downloads', title: 'Transmission', client: 'transmission', max: 5 },
                  { type: 'radarr', title: 'Radarr', max: 5 },
                  { type: 'sonarr', title: 'Sonarr', max: 5 },
                  { type: 'reelward', title: 'Reelward', max: 5 },
                ],
              },
              {
                size: 'small',
                widgets: [
                  { type: 'reddit', title: 'r/homelab', subreddit: 'homelab', max: 5 },
                  { type: 'hackernews', title: 'Hacker News', max: 5 },
                ],
              },
            ],
          },
        ],
      }),
    });
  });

  console.log('Navigating to Labby...');
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

  // Wait for all data to render (SSE mock fires at 1s, feeds fetch immediately)
  await new Promise((r) => setTimeout(r, 3000));

  console.log('Taking screenshot...');
  // hide scrollbars for cleaner screenshot
  await page.evaluate(() => (document.body.style.overflow = 'hidden'));

  const pkg = require('../package.json');
  const version = pkg.version;
  const filename = `screenshot-v${version}.png`;
  const filepath = `docs/${filename}`;

  await page.screenshot({ path: filepath, fullPage: false });

  console.log('Updating README.md...');
  const fs = require('node:fs');
  const readmePath = 'README.md';
  let readme = fs.readFileSync(readmePath, 'utf8');
  readme = readme.replace(
    /!\[Dashboard Screenshot\]\(docs\/screenshot[^)]*\)/,
    `![Dashboard Screenshot](${filepath})`,
  );
  fs.writeFileSync(readmePath, readme);

  console.log('Cleaning up old screenshots...');
  const docs = fs.readdirSync('docs');
  for (const file of docs) {
    if (file.startsWith('screenshot-') && file.endsWith('.png') && file !== filename) {
      fs.unlinkSync(`docs/${file}`);
    }
  }

  console.log('Done!');
  await browser.close();
  server.kill();
}

main().catch(console.error);
