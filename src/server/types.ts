export type MonitorSiteResult = {
  title: string;
  checkUrl: string;
  url?: string;
  icon?: string;
  status: 'up' | 'down' | 'warn';
  latencyMs: number | null;
};

export type MonitorPayload = {
  sites: MonitorSiteResult[];
  summary: { up: number; warn: number; down: number };
};

export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'other';
  status: string;
  cpuPercent: number | null;
  exitCode?: number;
  icon?: string;
};

export type DockerPayload = {
  containers: DockerContainer[];
};

export type Torrent = {
  name: string;
  progress: number;
  dlSpeed: number;
  upSpeed: number;
  state: string;
  hash: string;
  eta?: number | null;
  ratio?: number | null;
};

export type DownloadsPayload = {
  torrents: Torrent[];
  aggregateDlSpeed: number;
  aggregateUpSpeed: number;
};

export type AdGuardPayload = {
  queries: number;
  blockedPercent: number;
  avgLatencyMs: number;
  rulesCount: number;
  protectionEnabled: boolean;
};

export type JellyfinSession = {
  id: string;
  title: string;
  subtitle: string;
  user: string;
  device: string;
  progress: number;
  posterUrl?: string;
  isTranscoding: boolean;
};

export type JellyfinPayload = {
  sessions: JellyfinSession[];
  playing: number;
};

export type BeszelSystem = {
  id: string;
  name: string;
  host?: string;
  status: 'up' | 'down' | 'paused' | 'pending' | 'unknown';
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  uptimeSeconds: number | null;
  loadAvg?: [number, number, number];
};

export type BeszelDisk = {
  id: string;
  systemId: string;
  name: string;
  model: string;
  type: string;
  state: string;
  tempC: number | null;
  capacityBytes: number;
  usedPercent: number | null;
  hours: number | null;
  reallocatedSectors: number | null;
  pendingSectors: number | null;
  offlineUncorrectable: number | null;
  mediaErrors: number | null;
  wearPercent: number | null;
};

export type BeszelPayload = {
  systems: BeszelSystem[];
  disks: BeszelDisk[];
  summary: { up: number; down: number; paused: number; pending: number; unknown: number };
};

export type WeatherForecastDay = {
  date: string;
  label: string;
  tempMin: number;
  tempMax: number;
  icon: string;
};

export type WeatherLocationData = {
  city: string;
  country?: string;
  temp: number;
  feelsLike: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  windSpeed: number;
  windDeg: number;
  description: string;
  icon: string;
  sunrise: number;
  sunset: number;
  units: 'metric' | 'imperial';
  forecast: WeatherForecastDay[];
};

export type WeatherLocationResult = WeatherLocationData | { error: string };

export type WeatherPayload = {
  locations: Record<string, WeatherLocationResult>;
};

export type CalendarEvent = {
  title: string;
  start: number; // epoch ms
  end: number; // epoch ms
  allDay: boolean;
  location?: string;
  calendar: string;
};

export type CalendarPayload = {
  events: CalendarEvent[];
};

export type ArrItem = {
  id: string;
  title: string;
  date: string | null;
  status?: string;
  posterUrl?: string;
};

export type ArrPayload = {
  version: string | null;
  queue: number;
  missing: number | null;
  upcoming: ArrItem[];
};

export type ReelwardPayload = {
  upcoming: ArrItem[];
  trackers: Array<{
    name: string;
    connected: boolean;
    ratio: number | null;
    error?: string;
  }>;
  rss: {
    status: 'ok' | 'error' | 'unknown';
    releasesFound: number | null;
    releasesGrabbed: number | null;
    nextRunAt: string | null;
  };
};

export type Channel =
  | 'monitor'
  | 'docker'
  | 'downloads:qbittorrent'
  | 'downloads:transmission'
  | 'adguard'
  | 'jellyfin'
  | 'beszel'
  | 'radarr'
  | 'sonarr'
  | 'reelward'
  | 'weather'
  | 'calendar';

export type ChannelPayload =
  | MonitorPayload
  | DockerPayload
  | DownloadsPayload
  | AdGuardPayload
  | JellyfinPayload
  | BeszelPayload
  | ArrPayload
  | ReelwardPayload
  | WeatherPayload
  | CalendarPayload;

export type ApiError = { error: string };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}
