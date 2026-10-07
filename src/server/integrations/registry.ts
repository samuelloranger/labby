import type { RecentMediaPayload } from '../types';
import { type AdGuardConfig, getAdGuardStats, setAdGuardProtection } from './adguard';
import { type ArrConfig, getArrSummary } from './arr';
import { type BeszelConfig, getBeszelSystems } from './beszel';
import { type CalendarConfig, getCalendarEvents } from './calendar';
import { containerAction, containerLogs, type DockerConfig, listContainers } from './docker-client';
import { type EmbyConfig, getEmbySessions } from './emby';
import { getHackerNews, type HNConfig } from './hackernews';
import { getJellyfinRecent, getJellyfinSessions, type JellyfinConfig } from './jellyfin';
import { checkSites, type MonitorConfig } from './monitor';
import { getOpenWeather, type WeatherConfig } from './openweather';
import { getPlexRecent, getPlexSessions, type PlexConfig } from './plex';
import { getQBittorrentTorrents, type QbitConfig, qbittorrentAction } from './qbittorrent';
import { getRawkoonSummary, type RawkoonConfig } from './rawkoon';
import { getRedditPosts, type RedditConfig } from './reddit';
import { getSabnzbdQueue, type SabnzbdConfig, sabnzbdAction } from './sabnzbd';
import { getSpeedtestSummary, type SpeedtestConfig, triggerSpeedtestRun } from './speedtest';
import {
  getTransmissionTorrents,
  type TransmissionConfig,
  transmissionAction,
} from './transmission';

export type IntegrationType =
  | 'monitor'
  | 'docker'
  | 'qbittorrent'
  | 'transmission'
  | 'sabnzbd'
  | 'adguard'
  | 'jellyfin'
  | 'emby'
  | 'plex'
  | 'beszel'
  | 'radarr'
  | 'sonarr'
  | 'rawkoon'
  | 'reddit'
  | 'hackernews'
  | 'weather'
  | 'calendar'
  | 'speedtest'
  | 'bookmarks';

export type FieldDef = {
  key: string;
  label: string;
  secret?: boolean;
  kind?: 'text' | 'number' | 'list' | 'select';
  options?: string[];
};

export type IntegrationDef = {
  label: string;
  defaultRefreshSeconds: number;
  fields: FieldDef[];
  fetch: (config: Record<string, unknown>) => Promise<unknown>;
  actions?: Record<
    string,
    (config: Record<string, unknown>, ...args: unknown[]) => Promise<unknown>
  >;
};

// Shared "max items to show" field used by most list-style widgets.
type Sessions = { sessions: unknown[]; playing: number } | { error: string };
type Recent = RecentMediaPayload | { error: string };

// ponytail: in-memory per-config cache, never evicted; fine for a handful of media rows.
const RECENT_TTL_MS = 5 * 60_000;
const recentCache = new Map<string, { at: number; value: RecentMediaPayload }>();

// Recent additions change rarely, so refetch them every few minutes, not every session poll.
async function cachedRecent(key: string, load: () => Promise<Recent>): Promise<Recent> {
  const hit = recentCache.get(key);
  if (hit && Date.now() - hit.at < RECENT_TTL_MS) return hit.value;
  const value = await load();
  if (!('error' in value)) recentCache.set(key, { at: Date.now(), value });
  return value;
}

// Sessions and recent items fail independently; only both failing is a card-level error.
async function withRecent(sessionsP: Promise<Sessions>, recentP: Promise<Recent>) {
  const [sessions, recent] = await Promise.all([sessionsP, recentP]);
  if ('error' in sessions && 'error' in recent) return sessions;
  return {
    sessions: 'error' in sessions ? [] : sessions.sessions,
    playing: 'error' in sessions ? 0 : sessions.playing,
    sessionError: 'error' in sessions ? sessions.error : undefined,
    recent: 'error' in recent ? [] : recent.items,
    recentError: 'error' in recent ? recent.error : undefined,
  };
}

const MAX_FIELD: FieldDef = { key: 'max', label: 'Max items', kind: 'number' };

export const INTEGRATIONS: Record<IntegrationType, IntegrationDef> = {
  monitor: {
    label: 'Monitor',
    defaultRefreshSeconds: 30,
    fields: [
      { key: 'sites', label: 'Sites', kind: 'list' },
      { key: 'variant', label: 'Display', kind: 'select', options: ['rows', 'tiles'] },
      { key: 'style', label: 'Density', kind: 'select', options: ['default', 'compact'] },
    ],
    fetch: (c) => checkSites(c as MonitorConfig),
  },
  docker: {
    label: 'Docker',
    defaultRefreshSeconds: 10,
    fields: [
      { key: 'roHost', label: 'Read host' },
      { key: 'rwHost', label: 'Write host' },
      { key: 'show', label: 'Show', kind: 'select', options: ['running', 'all'] },
    ],
    fetch: (c) => listContainers(c as DockerConfig),
    actions: {
      start: (c, id) => containerAction(c as DockerConfig, id as string, 'start'),
      stop: (c, id) => containerAction(c as DockerConfig, id as string, 'stop'),
      restart: (c, id) => containerAction(c as DockerConfig, id as string, 'restart'),
      logs: (c, id, tail) =>
        containerLogs(c as DockerConfig, id as string, (tail as number) ?? 200),
    },
  },
  qbittorrent: {
    label: 'qBittorrent',
    defaultRefreshSeconds: 5,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getQBittorrentTorrents(c as QbitConfig),
    actions: {
      pause: (c, hash) => qbittorrentAction(c as QbitConfig, hash as string, 'pause'),
      resume: (c, hash) => qbittorrentAction(c as QbitConfig, hash as string, 'resume'),
    },
  },
  transmission: {
    label: 'Transmission',
    defaultRefreshSeconds: 5,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getTransmissionTorrents(c as TransmissionConfig),
    actions: {
      pause: (c, hash) => transmissionAction(c as TransmissionConfig, hash as string, 'pause'),
      resume: (c, hash) => transmissionAction(c as TransmissionConfig, hash as string, 'resume'),
    },
  },
  sabnzbd: {
    label: 'SABnzbd',
    defaultRefreshSeconds: 5,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getSabnzbdQueue(c as SabnzbdConfig),
    actions: {
      pause: (c, id) => sabnzbdAction(c as SabnzbdConfig, id as string, 'pause'),
      resume: (c, id) => sabnzbdAction(c as SabnzbdConfig, id as string, 'resume'),
    },
  },
  adguard: {
    label: 'AdGuard',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
    ],
    fetch: (c) => getAdGuardStats(c as AdGuardConfig),
    actions: {
      protection: (c, enabled, ms) =>
        setAdGuardProtection(c as AdGuardConfig, enabled as boolean, ms as number | undefined),
    },
  },
  jellyfin: {
    label: 'Jellyfin',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: (c) =>
      withRecent(
        getJellyfinSessions(c as JellyfinConfig),
        cachedRecent(`jellyfin:${JSON.stringify(c)}`, () => getJellyfinRecent(c as JellyfinConfig)),
      ),
  },
  emby: {
    label: 'Emby',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: (c) => getEmbySessions(c as EmbyConfig),
  },
  plex: {
    label: 'Plex',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'token', label: 'Token', secret: true },
    ],
    fetch: (c) =>
      withRecent(
        getPlexSessions(c as PlexConfig),
        cachedRecent(`plex:${JSON.stringify(c)}`, () => getPlexRecent(c as PlexConfig)),
      ),
  },
  beszel: {
    label: 'Beszel',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
      { key: 'token', label: 'Token', secret: true },
      { key: 'max', label: 'Max systems', kind: 'number' },
    ],
    fetch: (c) => getBeszelSystems(c as BeszelConfig),
  },
  radarr: {
    label: 'Radarr',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getArrSummary(c as ArrConfig, 'radarr'),
  },
  sonarr: {
    label: 'Sonarr',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getArrSummary(c as ArrConfig, 'sonarr'),
  },
  rawkoon: {
    label: 'Rawkoon',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
      MAX_FIELD,
    ],
    fetch: (c) => getRawkoonSummary(c as RawkoonConfig),
  },
  reddit: {
    label: 'Reddit',
    defaultRefreshSeconds: 240,
    fields: [{ key: 'subreddits', label: 'Subreddits', kind: 'list' }, MAX_FIELD],
    fetch: (c) => getRedditPosts(c as RedditConfig),
  },
  hackernews: {
    label: 'Hacker News',
    defaultRefreshSeconds: 240,
    fields: [MAX_FIELD],
    fetch: (c) => getHackerNews(c as HNConfig),
  },
  weather: {
    label: 'Weather',
    defaultRefreshSeconds: 900,
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'city', label: 'City' },
      { key: 'lat', label: 'Latitude', kind: 'number' },
      { key: 'lon', label: 'Longitude', kind: 'number' },
      { key: 'units', label: 'Units', kind: 'select', options: ['metric', 'imperial'] },
    ],
    fetch: (c) => getOpenWeather(c as WeatherConfig),
  },
  calendar: {
    label: 'Calendar',
    defaultRefreshSeconds: 600,
    fields: [
      { key: 'icsUrls', label: 'ICS URLs', kind: 'list' },
      { key: 'max', label: 'Max events', kind: 'number' },
    ],
    fetch: (c) => getCalendarEvents(c as CalendarConfig),
  },
  speedtest: {
    label: 'Speedtest',
    defaultRefreshSeconds: 1800,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiToken', label: 'API Token', secret: true },
    ],
    fetch: (c) => getSpeedtestSummary(c as SpeedtestConfig),
    actions: {
      run: (c) => triggerSpeedtestRun(c as SpeedtestConfig),
    },
  },
  bookmarks: {
    label: 'Bookmarks',
    // ponytail: static links, no polling — large interval so the no-op re-publish is rare
    defaultRefreshSeconds: 86_400,
    fields: [{ key: 'links', label: 'Links', kind: 'list' }],
    fetch: async (c) => ({
      links: Array.isArray(c.links) ? (c.links as Array<Record<string, unknown>>) : [],
    }),
  },
};

export function integrationTypes(): {
  type: IntegrationType;
  label: string;
  defaultRefreshSeconds: number;
  fields: FieldDef[];
}[] {
  return (Object.entries(INTEGRATIONS) as [IntegrationType, IntegrationDef][]).map(
    ([type, { label, defaultRefreshSeconds, fields }]) => ({
      type,
      label,
      defaultRefreshSeconds,
      fields,
    }),
  );
}
