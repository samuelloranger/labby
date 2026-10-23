import type {
  AdGuardPayload,
  BeszelPayload,
  CalendarPayload,
  DockerPayload,
  DownloadsPayload,
  JellyfinPayload,
  MonitorPayload,
  RecentMediaItem,
  SabnzbdPayload,
  WeatherPayload,
} from '../types';

/** Where a piece of artwork lives; resolved to image bytes at render time. */
export type ArtRef = { integrationId: number; itemId: string; kind: 'poster' | 'backdrop' };

export type Cond = 'sun' | 'cloud' | 'rain' | 'snow';

export type PanelSession = {
  title: string;
  subtitle: string;
  user: string;
  device: string;
  /** 0–100 */
  progress: number;
  poster?: ArtRef;
  backdrop?: ArtRef;
};

export type PanelDownload = { name: string; progress: number; speed: number; eta: number | null };

/** Everything the panel can show, distilled from the latest widget payloads. */
export type PanelSnapshot = {
  now: Date;
  system?: { name: string; cpu: number; mem: number; disk: number; uptimeSeconds: number | null };
  systemsDown: string[];
  disks: { name: string; usedPercent: number; capacityBytes: number }[];
  containers?: { running: number; total: number; stopped: { name: string; exitCode?: number }[] };
  sites?: { up: number; total: number; down: string[] };
  /** Present when any download client is configured, even if idle. */
  downloads?: { items: PanelDownload[]; dl: number; up: number };
  sessions: PanelSession[];
  recent: { title: string; kind: 'movie' | 'tv'; addedAt: number; poster?: ArtRef }[];
  weather?: {
    temp: number;
    feelsLike: number;
    description: string;
    cond: Cond;
    days: { label: string; min: number; max: number; cond: Cond }[];
  };
  events: { title: string; start: number; allDay: boolean }[];
  dns?: { queries: number; blockedPercent: number };
};

export type SnapshotRow = { id: number; type: string; enabled: boolean };

const isError = (v: unknown): v is { error: string } =>
  typeof v === 'object' && v !== null && 'error' in v;

/** OpenWeather icon codes ("10d") → the four shapes the panel draws. */
export function condFromIcon(icon: string): Cond {
  const code = icon.slice(0, 2);
  if (code === '01') return 'sun';
  if (code === '09' || code === '10' || code === '11') return 'rain';
  if (code === '13') return 'snow';
  return 'cloud';
}

const INACTIVE_TORRENT = /paus|stop|error|seed|upload|complete/i;

/** SABnzbd's "h:mm:ss" time left → seconds. */
function hmsToSeconds(v: string): number | null {
  const parts = v.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/**
 * Builds the panel's view of the homelab from the hub's cached payloads.
 * Rows are visited in dashboard order; when a type appears twice, list-like data
 * (sessions, downloads, containers) is merged and single-value data (system,
 * weather, DNS) comes from the first healthy row. Errored payloads are skipped,
 * so a dead integration just removes its card.
 */
export function buildSnapshot(
  rows: SnapshotRow[],
  payloads: Map<string, unknown>,
  now: Date,
): PanelSnapshot {
  const snap: PanelSnapshot = {
    now,
    systemsDown: [],
    disks: [],
    sessions: [],
    recent: [],
    events: [],
  };

  for (const row of rows) {
    if (!row.enabled) continue;
    const data = payloads.get(`int:${row.id}`);
    if (data === undefined || isError(data)) continue;

    switch (row.type) {
      case 'beszel': {
        const p = data as BeszelPayload;
        snap.systemsDown.push(...p.systems.filter((s) => s.status === 'down').map((s) => s.name));
        const sys = p.systems.find((s) => s.status === 'up') ?? p.systems[0];
        if (sys && !snap.system) {
          snap.system = {
            name: sys.name,
            cpu: sys.cpuPercent,
            mem: sys.memoryPercent,
            disk: sys.diskPercent,
            uptimeSeconds: sys.uptimeSeconds,
          };
          const disks = p.disks.filter((d) => d.systemId === sys.id && d.usedPercent !== null);
          snap.disks.push(
            ...disks.map((d) => ({
              name: d.name,
              usedPercent: d.usedPercent as number,
              capacityBytes: d.capacityBytes,
            })),
          );
        }
        break;
      }
      case 'docker': {
        const p = data as DockerPayload;
        const c = snap.containers ?? { running: 0, total: 0, stopped: [] };
        c.total += p.containers.length;
        c.running += p.containers.filter((x) => x.state === 'running').length;
        c.stopped.push(
          ...p.containers
            .filter((x) => x.state === 'exited')
            .map((x) => ({ name: x.name, exitCode: x.exitCode })),
        );
        snap.containers = c;
        break;
      }
      case 'monitor': {
        const p = data as MonitorPayload;
        const s = snap.sites ?? { up: 0, total: 0, down: [] };
        s.total += p.sites.length;
        s.up += p.summary.up;
        s.down.push(...p.sites.filter((x) => x.status === 'down').map((x) => x.title));
        snap.sites = s;
        break;
      }
      case 'qbittorrent':
      case 'transmission': {
        const p = data as DownloadsPayload;
        const d = snap.downloads ?? { items: [], dl: 0, up: 0 };
        d.items.push(
          ...p.torrents
            .filter((t) => t.progress < 100 && !INACTIVE_TORRENT.test(t.state))
            .map((t) => ({
              name: t.name,
              progress: t.progress,
              speed: t.dlSpeed,
              eta: t.eta ?? null,
            })),
        );
        d.dl += p.aggregateDlSpeed;
        d.up += p.aggregateUpSpeed;
        snap.downloads = d;
        break;
      }
      case 'sabnzbd': {
        const p = data as SabnzbdPayload;
        const d = snap.downloads ?? { items: [], dl: 0, up: 0 };
        if (!p.paused) {
          d.items.push(
            ...p.slots
              .filter((s) => !/paus/i.test(s.status))
              .map((s) => ({
                name: s.name,
                progress: s.progress,
                speed: 0,
                eta: hmsToSeconds(s.timeLeft),
              })),
          );
          d.dl += p.speedBps;
        }
        snap.downloads = d;
        break;
      }
      case 'jellyfin':
      case 'emby':
      case 'plex': {
        const p = data as JellyfinPayload;
        const art = (itemId: string | undefined, kind: ArtRef['kind']): ArtRef | undefined =>
          row.type === 'jellyfin' && itemId ? { integrationId: row.id, itemId, kind } : undefined;
        snap.sessions.push(
          ...p.sessions.map((s) => ({
            title: s.title,
            subtitle: s.subtitle,
            user: s.user,
            device: s.device,
            progress: s.progress,
            poster: art(s.posterId, 'poster'),
            backdrop: art(s.backdropId, 'backdrop'),
          })),
        );
        snap.recent.push(
          ...(p.recent ?? []).flatMap((r: RecentMediaItem) => {
            const addedAt = Date.parse(r.addedAt);
            return Number.isNaN(addedAt)
              ? []
              : [{ title: r.title, kind: r.kind, addedAt, poster: art(r.posterId, 'poster') }];
          }),
        );
        break;
      }
      case 'weather': {
        if (snap.weather) break;
        const p = data as WeatherPayload;
        const loc = Object.values(p.locations).find((l) => !('error' in l));
        if (!loc || 'error' in loc) break;
        snap.weather = {
          temp: Math.round(loc.temp),
          feelsLike: Math.round(loc.feelsLike),
          description: loc.description,
          cond: condFromIcon(loc.icon),
          days: loc.forecast.slice(0, 3).map((d) => ({
            label: d.label,
            min: Math.round(d.tempMin),
            max: Math.round(d.tempMax),
            cond: condFromIcon(d.icon),
          })),
        };
        break;
      }
      case 'calendar': {
        const p = data as CalendarPayload;
        snap.events.push(
          ...p.events
            .filter((e) => e.end > now.getTime())
            .map((e) => ({ title: e.title, start: e.start, allDay: e.allDay })),
        );
        break;
      }
      case 'adguard': {
        if (snap.dns) break;
        const p = data as AdGuardPayload;
        snap.dns = { queries: p.queries, blockedPercent: p.blockedPercent };
        break;
      }
    }
  }

  snap.recent.sort((a, b) => b.addedAt - a.addedAt);
  snap.events.sort((a, b) => a.start - b.start);
  return snap;
}
