export type IntegrationType =
  | 'monitor'
  | 'docker'
  | 'qbittorrent'
  | 'transmission'
  | 'adguard'
  | 'jellyfin'
  | 'beszel'
  | 'radarr'
  | 'sonarr'
  | 'reelward'
  | 'reddit'
  | 'hackernews'
  | 'weather'
  | 'calendar'
  | 'speedtest';

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
  actions?: Record<string, (config: Record<string, unknown>, ...args: any[]) => Promise<unknown>>;
};

const stub = async (_config: Record<string, unknown>): Promise<unknown> => ({
  error: 'not wired yet',
});

export const INTEGRATIONS: Record<IntegrationType, IntegrationDef> = {
  monitor: {
    label: 'Monitor',
    defaultRefreshSeconds: 30,
    fields: [{ key: 'sites', label: 'Sites', kind: 'list' }],
    fetch: stub,
  },
  docker: {
    label: 'Docker',
    defaultRefreshSeconds: 10,
    fields: [
      { key: 'roHost', label: 'Read host' },
      { key: 'rwHost', label: 'Write host' },
      { key: 'show', label: 'Show', kind: 'select', options: ['running', 'all'] },
    ],
    fetch: stub,
  },
  qbittorrent: {
    label: 'qBittorrent',
    defaultRefreshSeconds: 5,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
    ],
    fetch: stub,
  },
  transmission: {
    label: 'Transmission',
    defaultRefreshSeconds: 5,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
    ],
    fetch: stub,
  },
  adguard: {
    label: 'AdGuard',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
    ],
    fetch: stub,
  },
  jellyfin: {
    label: 'Jellyfin',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: stub,
  },
  beszel: {
    label: 'Beszel',
    defaultRefreshSeconds: 15,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'user', label: 'User' },
      { key: 'pass', label: 'Password', secret: true },
      { key: 'token', label: 'Token', secret: true },
    ],
    fetch: stub,
  },
  radarr: {
    label: 'Radarr',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: stub,
  },
  sonarr: {
    label: 'Sonarr',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: stub,
  },
  reelward: {
    label: 'Reelward',
    defaultRefreshSeconds: 60,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiKey', label: 'API Key', secret: true },
    ],
    fetch: stub,
  },
  reddit: {
    label: 'Reddit',
    defaultRefreshSeconds: 240,
    fields: [{ key: 'subreddits', label: 'Subreddits', kind: 'list' }],
    fetch: stub,
  },
  hackernews: {
    label: 'Hacker News',
    defaultRefreshSeconds: 240,
    fields: [],
    fetch: stub,
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
    fetch: stub,
  },
  calendar: {
    label: 'Calendar',
    defaultRefreshSeconds: 600,
    fields: [{ key: 'icsUrls', label: 'ICS URLs', kind: 'list' }],
    fetch: stub,
  },
  speedtest: {
    label: 'Speedtest',
    defaultRefreshSeconds: 1800,
    fields: [
      { key: 'url', label: 'URL' },
      { key: 'apiToken', label: 'API Token', secret: true },
    ],
    fetch: stub,
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
