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

export type RawkoonData = {
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

/**
 * Fill any store the stream could not fill on its own.
 *
 * `/api/integrations/:id/data` runs a live upstream fetch, so this is only worth
 * doing for integrations the server has no usable cached payload for. Anything
 * seeded with real data from the inlined snapshot is skipped on the first
 * connect: the SSE replay carries that same payload, and re-fetching it live
 * made cards visibly change size mid-load — a feed that had cached posts but
 * whose upstream was refusing requests painted full, then collapsed to its error
 * and dropped the card below it 369px.
 *
 * Skipping is also the honest reading of the config: a cached payload is at most
 * `refreshSeconds` old, which is the staleness the user asked for. Fetching all
 * of them live on every page load was a burst of upstream requests that the
 * "push, don't poll" contract does not ask for.
 *
 * The skip is first-connect only. A reconnect clears the set, because after a
 * dropped stream the cached data really can be stale.
 */
async function bootstrapStores(ids: number[]) {
  const pending = ids.filter((id) => !seededFromSnapshot.has(id));
  seededFromSnapshot.clear();
  await Promise.all(
    pending.map(async (id) => {
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

/**
 * Seed every store from the snapshot the server inlined into the HTML.
 *
 * Runs at module scope, so stores already hold data before the first component
 * reads them and widgets never render the skeleton frame they would otherwise
 * resize away from. Anything not in the snapshot (an integration the scheduler
 * has not polled yet) falls through to the skeleton exactly as before.
 */
const seededFromSnapshot = new Set<number>();

function seedFromInlineSnapshot(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('labby-snapshot');
  if (!el?.textContent) return;
  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(el.textContent);
  } catch {
    return; // a malformed snapshot must never stop the stream from opening
  }
  for (const [channel, data] of Object.entries(snapshot)) {
    const id = idFromEvent(channel);
    if (id == null) continue;
    patchStore(id, data);
    // Only real data earns the bootstrap skip below. A cached *error* is worth
    // retrying live on load — it may well have cleared since the last poll, and
    // painting a stale failure is the one case where the snapshot is worse than
    // a fetch.
    if (!isError(data)) seededFromSnapshot.add(id);
  }
}

seedFromInlineSnapshot();

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
