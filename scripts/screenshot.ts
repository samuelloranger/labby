import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 8099;

async function main() {
  console.log('Starting Labby server...');
  const server = spawn('bun', ['run', 'dist/index.js'], {
    env: { ...process.env, LABBY_PORT: String(PORT), LABBY_DB_PATH: ':memory:' },
    stdio: 'ignore'
  });

  await new Promise(r => setTimeout(r, 2000));

  console.log('Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark'
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

          // Mock Data
          push('monitor', {
            sites: [
              { title: 'AdGuard', url: 'https://adguard.example.com', icon: 'di:adguard-home', status: 'up', latencyMs: 12 },
              { title: 'qBittorrent', url: 'https://qb.example.com', icon: 'di:qbittorrent', status: 'up', latencyMs: 5 },
              { title: 'Jellyfin', url: 'https://jellyfin.example.com', icon: 'di:jellyfin', status: 'up', latencyMs: 25 }
            ],
            summary: { up: 3, warn: 0, down: 0 }
          });

          push('docker', {
            containers: [
              { id: '1', name: 'jellyfin', image: 'jellyfin/jellyfin', state: 'running', status: 'Up 3 days', cpuPercent: 1.2 },
              { id: '2', name: 'caddy', image: 'caddy:latest', state: 'running', status: 'Up 10 days', cpuPercent: 0.1 },
              { id: '3', name: 'adguard', image: 'adguard/adguardhome', state: 'running', status: 'Up 3 days', cpuPercent: 0.5 }
            ]
          });

          push('adguard', { queries: 25430, blockedPercent: 14.2, avgLatencyMs: 12, rulesCount: 105000, protectionEnabled: true });
          
          push('weather', {
            locations: {
              "London,GB": {
                city: "London", temp: 18, feelsLike: 17, tempMin: 12, tempMax: 20, humidity: 55, windSpeed: 4, description: "Partly cloudy", icon: "02d",
                forecast: [
                  { date: "2026-06-18", label: "Tomorrow", tempMin: 14, tempMax: 22, icon: "01d" },
                  { date: "2026-06-19", label: "Friday", tempMin: 15, tempMax: 24, icon: "01d" }
                ]
              }
            }
          });

          push('speedtest', {
            latest: { id: 1, ping: 12, download: 850000000, upload: 920000000, createdAt: new Date().toISOString() },
            history: []
          });
          
          push('jellyfin', {
            sessions: [
              { id: '1', title: 'Dune: Part Two', subtitle: '4K HDR', user: 'samuel', device: 'Apple TV', progress: 0.45, isTranscoding: false }
            ],
            playing: 1
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

  console.log('Navigating to Labby...');
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

  // Wait for data to render
  await new Promise(r => setTimeout(r, 2000));

  console.log('Taking screenshot...');
  // hide scrollbars for cleaner screenshot
  await page.evaluate(() => document.body.style.overflow = 'hidden');
  
  const pkg = require('../package.json');
  const version = pkg.version;
  const filename = `screenshot-v${version}.png`;
  const filepath = `docs/${filename}`;
  
  await page.screenshot({ path: filepath, fullPage: true });

  console.log('Updating README.md...');
  const fs = require('node:fs');
  const readmePath = 'README.md';
  let readme = fs.readFileSync(readmePath, 'utf8');
  readme = readme.replace(/!\[Dashboard Screenshot\]\(docs\/screenshot[^\)]*\)/, `![Dashboard Screenshot](${filepath})`);
  fs.writeFileSync(readmePath, readme);

  console.log('Cleaning up old screenshots...');
  const docs = fs.readdirSync('docs');
  for (const file of docs) {
    if (file.startsWith('screenshot-') && file.endsWith('.png') && file !== filename) {
      fs.unlinkSync(`docs/${file}`);
    }
  }
  if (fs.existsSync('docs/screenshot.png')) {
    fs.unlinkSync('docs/screenshot.png');
  }

  console.log('Done!');
  await browser.close();
  server.kill();
}

main().catch(console.error);
