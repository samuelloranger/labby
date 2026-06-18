import { writable, type Writable } from 'svelte/store';

export type MonitorData = {
  sites: Array<{
    title: string;
    checkUrl: string;
    url?: string;
    icon?: string;
    status: 'up' | 'down' | 'warn';
    latencyMs: number | null;
  }>;
  summary: { up: number; warn: number; down: number };
};

export type DockerData = {
  containers: Array<{
    id: string;
    name: string;
    image: string;
    state: 'running' | 'exited' | 'other';
    status: string;
    cpuPercent: number | null;
    exitCode?: number;
    icon?: string;
  }>;
};

export type DownloadsData = {
  torrents: Array<{
    name: string;
    progress: number;
    dlSpeed: number;
    upSpeed: number;
    state: string;
    hash: string;
    eta?: number | null;
    ratio?: number | null;
  }>;
  aggregateDlSpeed: number;
  aggregateUpSpeed: number;
};

export type AdGuardData = {
  queries: number;
  blockedPercent: number;
  avgLatencyMs: number;
  rulesCount: number;
  protectionEnabled: boolean;
};

export type JellyfinData = {
  sessions: Array<{
    id: string;
    title: string;
    subtitle: string;
    user: string;
    device: string;
    progress: number;
    posterUrl?: string;
    isTranscoding: boolean;
  }>;
  playing: number;
};

export type BeszelData = {
  systems: Array<{
    id: string;
    name: string;
    host?: string;
    status: 'up' | 'down' | 'paused' | 'pending' | 'unknown';
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
    uptimeSeconds: number | null;
    loadAvg?: [number, number, number];
  }>;
  disks: Array<{
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
  }>;
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

export type CalendarEvent = {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  calendar: string;
};

export type CalendarData = {
  events: CalendarEvent[];
};

export type ArrData = {
  version: string | null;
  queue: number;
  missing: number | null;
  upcoming: Array<{
    id: string;
    title: string;
    date: string | null;
    status?: string;
    posterUrl?: string;
  }>;
};

export type ReelwardData = {
  upcoming: ArrData['upcoming'];
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

export type SpeedtestResult = {
  id: number;
  ping: number;
  download: number;
  upload: number;
  createdAt: string;
};

export type SpeedtestData = {
  latest: SpeedtestResult | null;
  history: SpeedtestResult[];
};

export type FeedPost = {
  title: string;
  url: string;
  score: number;
  comments: number;
  author?: string;
  subreddit?: string;
  domain?: string;
  createdUtc: number;
};

export type FeedData = {
  posts: FeedPost[];
  subreddit?: string;
};

export type WidgetState<T> = {
  loading: boolean;
  error: string | null;
  stale: boolean;
  data: T | null;
};

function emptyState<T>(): WidgetState<T> {
  return { loading: true, error: null, stale: false, data: null };
}

const stores = new Map<number, Writable<WidgetState<unknown>>>();
let es: EventSource | null = null;
const eventListeners = new Map<number, (e: Event) => void>();

export const streamConnected = writable(true);

/** Global search across services + containers + torrents (header search pill). */
export const searchQuery = writable('');

export function idFromEvent(name: string): number | null {
  const m = /^int:(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

export function getStore(id: number): Writable<WidgetState<unknown>> {
  let s = stores.get(id);
  if (!s) {
    s = writable<WidgetState<unknown>>(emptyState());
    stores.set(id, s);
  }
  return s;
}

function isError(data: unknown): data is { error: string } {
  return typeof data === 'object' && data !== null && 'error' in data;
}

function patchStore(id: number, data: unknown) {
  const store = getStore(id);
  if (isError(data)) {
    store.update((s) => ({ ...s, loading: false, error: data.error, stale: false }));
    return;
  }
  store.set({ loading: false, error: null, stale: false, data });
}

function detachIntegrationListeners(source: EventSource) {
  for (const [id, handler] of eventListeners) {
    source.removeEventListener(`int:${id}`, handler);
  }
  eventListeners.clear();
}

async function attachIntegrationListeners(source: EventSource) {
  detachIntegrationListeners(source);
  try {
    const res = await fetch('/api/integrations');
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{ id: number }>;
    for (const row of rows) {
      const handler = (e: Event) => {
        try {
          patchStore(row.id, JSON.parse((e as MessageEvent).data));
        } catch {
          /* ignore malformed */
        }
      };
      source.addEventListener(`int:${row.id}`, handler);
      eventListeners.set(row.id, handler);
    }
  } catch {
    /* offline — reconnect will retry */
  }
}

export function markStale() {
  for (const store of stores.values()) {
    store.update((s) => ({ ...s, stale: true }));
  }
}

export async function refreshStreamSubscriptions() {
  if (es) await attachIntegrationListeners(es);
}

export function initStream() {
  es = new EventSource('/api/stream');

  es.onopen = () => {
    streamConnected.set(true);
    void attachIntegrationListeners(es!);
    for (const store of stores.values()) {
      store.update((s) => ({ ...s, loading: s.data ? false : s.loading }));
    }
  };

  es.onerror = () => {
    streamConnected.set(false);
    markStale();
  };

  return () => {
    if (es) {
      detachIntegrationListeners(es);
      es.close();
      es = null;
    }
  };
}
