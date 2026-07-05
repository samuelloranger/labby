import { type Writable, writable } from 'svelte/store';

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

export type SabnzbdData = {
  paused: boolean;
  speedBps: number;
  sizeLeftMb: number;
  timeLeft: string;
  slots: Array<{
    id: string;
    name: string;
    progress: number;
    sizeLeftMb: number;
    timeLeft: string;
    status: string;
  }>;
};

export type EmbyData = {
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

export type PlexData = {
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

export type BookmarkLink = { title: string; url: string; icon?: string };
export type BookmarksData = { links: BookmarkLink[] };

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
let knownIntegrationIds: number[] = [];

export const streamConnected = writable(true);

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

async function fetchIntegrationIds(): Promise<number[]> {
  try {
    const res = await fetch('/api/integrations');
    if (!res.ok) return knownIntegrationIds;
    const rows = (await res.json()) as Array<{ id: number }>;
    knownIntegrationIds = rows.map((r) => r.id);
    return knownIntegrationIds;
  } catch {
    return knownIntegrationIds;
  }
}

function attachIntegrationListeners(source: EventSource, ids: number[]) {
  detachIntegrationListeners(source);
  for (const id of ids) {
    const handler = (e: Event) => {
      try {
        patchStore(id, JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    };
    source.addEventListener(`int:${id}`, handler);
    eventListeners.set(id, handler);
  }
}

async function bootstrapStores(ids: number[]) {
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`/api/integrations/${id}/data`);
        if (res.ok) patchStore(id, await res.json());
      } catch {
        /* offline */
      }
    }),
  );
}

async function syncStreamSubscriptions() {
  if (!es) return;
  const ids = await fetchIntegrationIds();
  attachIntegrationListeners(es, ids);
  await bootstrapStores(ids);
  for (const store of stores.values()) {
    store.update((s) => ({ ...s, loading: s.data ? false : s.loading }));
  }
}

export function markStale() {
  for (const store of stores.values()) {
    store.update((s) => ({ ...s, stale: true }));
  }
}

export function initStream() {
  void fetchIntegrationIds().then(() => {
    es = new EventSource('/api/stream');

    es.onopen = () => {
      streamConnected.set(true);
      void syncStreamSubscriptions();
    };

    es.onerror = () => {
      streamConnected.set(false);
      markStale();
    };
  });

  return () => {
    if (es) {
      detachIntegrationListeners(es);
      es.close();
      es = null;
    }
  };
}
