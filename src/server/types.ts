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
  sessionError?: string;
  recent?: RecentMediaItem[];
  recentError?: string;
};

export type RecentMediaItem = {
  id: string;
  kind: 'movie' | 'tv';
  title: string;
  subtitle: string;
  addedAt: string;
  posterUrl?: string;
};

export type RecentMediaPayload = { items: RecentMediaItem[] };

export type EmbySession = {
  id: string;
  title: string;
  subtitle: string;
  user: string;
  device: string;
  progress: number;
  posterUrl?: string;
  isTranscoding: boolean;
};

export type EmbyPayload = {
  sessions: EmbySession[];
  playing: number;
};

export type PlexSession = {
  id: string;
  title: string;
  subtitle: string;
  user: string;
  device: string;
  progress: number;
  posterUrl?: string;
  isTranscoding: boolean;
};

export type PlexPayload = {
  sessions: PlexSession[];
  playing: number;
  sessionError?: string;
  recent?: RecentMediaItem[];
  recentError?: string;
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

export type RawkoonPayload = {
  upcoming: ArrItem[];
  rss: {
    status: 'ok' | 'error' | 'unknown';
    releasesFound: number | null;
    releasesGrabbed: number | null;
    nextRunAt: string | null;
  };
};

export type C411Path = {
  star: boolean;
  questsCompleted: number;
  questsTotal: number;
};

export type C411Class = {
  slug: string;
  effectiveSlug: string;
  foundation: string;
  treeBonusBp: number;
  progress: {
    questsCompleted: number;
    questsTotal: number;
    stars: number;
    grade: { tier: 'bronze' | 'argent' | 'or'; level: number } | null;
  };
  voies: Record<'seed' | 'upload' | 'specialization' | 'competitivity', C411Path>;
};

export type C411Volume = { actual: number; credit: number; total: number };

export type C411Payload = {
  username: string;
  avatarUrl: string | null;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  updatedAt: number;
  zen: number;
  uploaded: number;
  downloaded: number;
  ratio: number | null;
  downloadAllowed: boolean;
  freeleech: boolean;
  class: C411Class | null;
  team: { name: string; slug: string; tag: string; role: string } | null;
  transfer: { uploaded: C411Volume; downloaded: C411Volume };
  blockedReason: string | null;
  freeleechSources: Array<'personal' | 'campaign' | 'window'>;
};

export type SpeedtestResult = {
  id: number;
  ping: number;
  download: number;
  upload: number;
  createdAt: string;
};

export type SpeedtestPayload = {
  latest: SpeedtestResult | null;
  history: SpeedtestResult[];
};

export type SabnzbdSlot = {
  id: string;
  name: string;
  progress: number;
  sizeLeftMb: number;
  timeLeft: string;
  status: string;
};

export type SabnzbdPayload = {
  paused: boolean;
  speedBps: number;
  sizeLeftMb: number;
  timeLeft: string;
  slots: SabnzbdSlot[];
};

export type Channel = string;

export type IntegrationConfig = Record<string, unknown>;

export type ChannelPayload =
  | MonitorPayload
  | DockerPayload
  | DownloadsPayload
  | SabnzbdPayload
  | AdGuardPayload
  | JellyfinPayload
  | EmbyPayload
  | PlexPayload
  | BeszelPayload
  | ArrPayload
  | RawkoonPayload
  | C411Payload
  | WeatherPayload
  | CalendarPayload
  | SpeedtestPayload;

export type ApiError = { error: string };

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}
