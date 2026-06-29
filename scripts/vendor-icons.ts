import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg';
const OUT = path.join(import.meta.dir, '../src/web/public/icons/di');

const SLUGS = [
  'adguard-home',
  'qbittorrent',
  'transmission',
  'sabnzbd',
  'jellyfin',
  'emby',
  'immich',
  'gitea',
  'arcane',
  'audiobookshelf',
  'beszel',
  'uptime-kuma',
  'kopia',
  'ntfy',
  'vaultwarden',
  'home-assistant',
  'caddy',
  'glance',
  'kan',
  'jackett',
  'reddit',
  'hacker-news',
  'docker',
  'radarr',
  'sonarr',
];

await mkdir(OUT, { recursive: true });

for (const slug of SLUGS) {
  const url = `${CDN}/${slug}.svg`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Skip ${slug}: ${res.status}`);
    continue;
  }
  const svg = await res.text();
  await Bun.write(path.join(OUT, `${slug}.svg`), svg);
  console.log(`Vendored ${slug}.svg`);
}
