import { writable } from 'svelte/store';

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

export type WeatherData = {
  locations: Record<string, WeatherLocationData | { error: string }>;
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

export const monitorStore = writable<WidgetState<MonitorData>>(emptyState());
export const dockerStore = writable<WidgetState<DockerData>>(emptyState());
export const qbStore = writable<WidgetState<DownloadsData>>(emptyState());
export const trStore = writable<WidgetState<DownloadsData>>(emptyState());
export const adguardStore = writable<WidgetState<AdGuardData>>(emptyState());
export const jellyfinStore = writable<WidgetState<JellyfinData>>(emptyState());
export const beszelStore = writable<WidgetState<BeszelData>>(emptyState());
export const weatherStore = writable<WidgetState<WeatherData>>(emptyState());
export const streamConnected = writable(true);

/** Global search across services + containers + torrents (header search pill). */
export const searchQuery = writable('');

function isError(data: unknown): data is { error: string } {
  return typeof data === 'object' && data !== null && 'error' in data;
}

function patchStore<T>(store: typeof monitorStore, data: unknown) {
  if (isError(data)) {
    store.update((s) => ({ ...s, loading: false, error: data.error, stale: false }));
    return;
  }
  store.set({ loading: false, error: null, stale: false, data: data as T });
}

export function markStale() {
  for (const store of [
    monitorStore,
    dockerStore,
    qbStore,
    trStore,
    adguardStore,
    jellyfinStore,
    beszelStore,
    weatherStore,
  ]) {
    store.update((s) => ({ ...s, stale: true }));
  }
}

export function initStream() {
  const es = new EventSource('/api/stream');

  es.onopen = () => {
    streamConnected.set(true);
    for (const store of [
      monitorStore,
      dockerStore,
      qbStore,
      trStore,
      adguardStore,
      jellyfinStore,
      beszelStore,
      weatherStore,
    ]) {
      store.update((s) => ({ ...s, loading: s.data ? false : s.loading }));
    }
  };

  es.onerror = () => {
    streamConnected.set(false);
    markStale();
  };

  const handlers: Record<string, (data: unknown) => void> = {
    monitor: (d) => patchStore(monitorStore, d),
    docker: (d) => patchStore(dockerStore, d),
    'downloads:qbittorrent': (d) => patchStore(qbStore, d),
    'downloads:transmission': (d) => patchStore(trStore, d),
    adguard: (d) => patchStore(adguardStore, d),
    jellyfin: (d) => patchStore(jellyfinStore, d),
    beszel: (d) => patchStore(beszelStore, d),
    weather: (d) => patchStore(weatherStore, d),
  };

  for (const [event, handler] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => {
      try {
        handler(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    });
  }

  return () => es.close();
}
