export type IconSpec = string | undefined;

const DI_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg';

export function resolveIconSrc(
  icon: IconSpec,
  fallbackLucide = 'box',
): {
  type: 'img' | 'lucide';
  src?: string;
  lucide: string;
} {
  if (!icon) return { type: 'lucide', lucide: fallbackLucide };

  if (icon.startsWith('lucide:')) {
    return { type: 'lucide', lucide: icon.slice(7) };
  }

  if (icon.startsWith('di:')) {
    const slug = icon.slice(3);
    return { type: 'img', src: `/icons/di/${slug}.svg`, lucide: fallbackLucide };
  }

  if (icon.startsWith('sh:')) {
    const slug = icon.slice(3);
    return { type: 'img', src: `https://cdn.selfh.st/icons/${slug}.svg`, lucide: fallbackLucide };
  }

  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/')) {
    return { type: 'img', src: icon, lucide: fallbackLucide };
  }

  return { type: 'lucide', lucide: fallbackLucide };
}

export function diCdnFallback(slug: string): string {
  return `${DI_CDN}/${slug}.svg`;
}

export function formatBytesPerSec(bytes: number): string {
  if (bytes <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || Number.isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0 || seconds === 8640000) return '—';
  if (seconds < 60) return `eta ${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `eta ${m}m`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '—';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
}

/** Clamp a possibly-out-of-range or non-finite value to a 0–100 CSS percentage. */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function timeAgo(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const s = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function windLabel(deg: number): string {
  if (!Number.isFinite(deg)) return '';
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return WIND_DIRS[idx];
}

export function weatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

export function tempUnit(units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? '°F' : '°C';
}

export function windUnit(units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? 'mph' : 'm/s';
}

export function isSeedingTorrent(state: string, progress: number): boolean {
  return progress >= 100 || state.includes('seed') || state === 'uploading';
}

type TorrentLike = { progress: number; dlSpeed: number; upSpeed: number; state: string };

/**
 * A torrent client can hold hundreds of (mostly idle, seeding) torrents — far
 * too many to dump into a dashboard card. Surface the ones that matter:
 * actively transferring first (by combined speed), then in-progress, then the
 * rest; cap the list and report what was hidden.
 */
export function prepareDownloads<T extends TorrentLike>(
  torrents: T[],
  max: number,
): { visible: T[]; hidden: number; seeding: number; downloading: number } {
  const active = (t: TorrentLike) => t.dlSpeed > 0 || t.upSpeed > 0;
  const sorted = [...torrents].sort((a, b) => {
    const aa = active(a) ? 1 : 0;
    const bb = active(b) ? 1 : 0;
    if (aa !== bb) return bb - aa; // transferring torrents first
    const speedDelta = b.dlSpeed + b.upSpeed - (a.dlSpeed + a.upSpeed);
    if (speedDelta !== 0) return speedDelta;
    return a.progress - b.progress; // then in-progress before complete
  });
  const seeding = torrents.filter((t) => isSeedingTorrent(t.state, t.progress)).length;
  const downloading = torrents.filter(
    (t) => !isSeedingTorrent(t.state, t.progress) && (t.dlSpeed > 0 || t.progress < 100),
  ).length;
  const cap = Math.max(0, max);
  const visible = sorted.slice(0, cap);
  return { visible, hidden: sorted.length - visible.length, seeding, downloading };
}
