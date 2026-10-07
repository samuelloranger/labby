import { describe, expect, it, mock } from 'bun:test';
import { INTEGRATIONS, type IntegrationType, integrationTypes } from './registry';

const ALL_TYPES: IntegrationType[] = [
  'monitor',
  'docker',
  'qbittorrent',
  'transmission',
  'sabnzbd',
  'adguard',
  'jellyfin',
  'emby',
  'plex',
  'beszel',
  'radarr',
  'sonarr',
  'rawkoon',
  'reddit',
  'hackernews',
  'weather',
  'calendar',
  'speedtest',
  'bookmarks',
];

const TYPES_WITH_ACTIONS: IntegrationType[] = [
  'docker',
  'qbittorrent',
  'transmission',
  'sabnzbd',
  'adguard',
  'speedtest',
];

const TYPES_WITHOUT_ACTIONS: IntegrationType[] = ALL_TYPES.filter(
  (t) => !TYPES_WITH_ACTIONS.includes(t),
);

describe('INTEGRATIONS registry', () => {
  it('has exactly 19 entries', () => {
    expect(Object.keys(INTEGRATIONS).length).toBe(19);
  });

  it('every type has a truthy label', () => {
    for (const type of ALL_TYPES) {
      expect(INTEGRATIONS[type].label).toBeTruthy();
    }
  });

  it('every type has a fetch function', () => {
    for (const type of ALL_TYPES) {
      expect(typeof INTEGRATIONS[type].fetch).toBe('function');
    }
  });

  it('every type has a defaultRefreshSeconds > 0', () => {
    for (const type of ALL_TYPES) {
      expect(INTEGRATIONS[type].defaultRefreshSeconds).toBeGreaterThan(0);
    }
  });

  it('every type has a fields array', () => {
    for (const type of ALL_TYPES) {
      expect(Array.isArray(INTEGRATIONS[type].fields)).toBe(true);
    }
  });

  it('docker has actions: start, stop, restart, logs', () => {
    const actions = INTEGRATIONS.docker.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.start).toBe('function');
    expect(typeof actions!.stop).toBe('function');
    expect(typeof actions!.restart).toBe('function');
    expect(typeof actions!.logs).toBe('function');
  });

  it('qbittorrent has actions: pause, resume', () => {
    const actions = INTEGRATIONS.qbittorrent.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.pause).toBe('function');
    expect(typeof actions!.resume).toBe('function');
  });

  it('transmission has actions: pause, resume', () => {
    const actions = INTEGRATIONS.transmission.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.pause).toBe('function');
    expect(typeof actions!.resume).toBe('function');
  });

  it('sabnzbd has actions: pause, resume', () => {
    const actions = INTEGRATIONS.sabnzbd.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.pause).toBe('function');
    expect(typeof actions!.resume).toBe('function');
  });

  it('adguard has actions: protection', () => {
    const actions = INTEGRATIONS.adguard.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.protection).toBe('function');
  });

  it('speedtest has actions: run', () => {
    const actions = INTEGRATIONS.speedtest.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.run).toBe('function');
  });

  it('types without actions have no actions property', () => {
    for (const type of TYPES_WITHOUT_ACTIONS) {
      expect(INTEGRATIONS[type].actions).toBeUndefined();
    }
  });

  it('bookmarks.fetch returns links from config', async () => {
    const out = (await INTEGRATIONS.bookmarks.fetch({
      links: [{ title: 'Router', url: 'http://192.168.1.1' }],
    })) as { links: unknown[] };
    expect(out.links.length).toBe(1);
    const empty = (await INTEGRATIONS.bookmarks.fetch({})) as { links: unknown[] };
    expect(empty.links).toEqual([]);
  });

  it('keeps Jellyfin sessions when the recent query fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) =>
      String(input).includes('/Sessions')
        ? Response.json([{ Id: 'session', NowPlayingItem: { Id: 'movie', Name: 'Film' } }])
        : new Response('unavailable', { status: 503 }),
    ) as unknown as typeof fetch;
    try {
      const result = (await INTEGRATIONS.jellyfin.fetch({
        url: 'http://jellyfin.test',
        apiKey: 'key',
      })) as { sessions: unknown[]; playing: number; recent: unknown[]; recentError: string };
      expect(result.playing).toBe(1);
      expect(result.sessions).toHaveLength(1);
      expect(result.recent).toEqual([]);
      expect(result.recentError).toBe('Jellyfin error: 503');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reuses recent media across polls while sessions refresh', async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      return path === '/Sessions' ? Response.json([]) : Response.json({ Items: [] });
    }) as unknown as typeof fetch;
    try {
      const config = { url: 'http://jellyfin-cache.test', apiKey: 'key' };
      await INTEGRATIONS.jellyfin.fetch(config);
      await INTEGRATIONS.jellyfin.fetch(config);
      expect(calls.filter((p) => p === '/Sessions')).toHaveLength(2);
      expect(calls.filter((p) => p === '/Items')).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('display-option fields', () => {
  it('monitor exposes variant and style display fields', () => {
    const keys = INTEGRATIONS.monitor.fields.map((f) => f.key);
    expect(keys).toContain('variant');
    expect(keys).toContain('style');
  });

  it('feed/arr/calendar/download/beszel types expose a max field', () => {
    for (const t of [
      'qbittorrent',
      'transmission',
      'sabnzbd',
      'beszel',
      'radarr',
      'sonarr',
      'rawkoon',
      'reddit',
      'hackernews',
      'calendar',
    ] as const) {
      expect(INTEGRATIONS[t].fields.map((f) => f.key)).toContain('max');
    }
  });
});

describe('integrationTypes()', () => {
  it('returns an array of 19 entries', () => {
    expect(integrationTypes().length).toBe(19);
  });

  it('omits fetch and actions from entries', () => {
    for (const entry of integrationTypes()) {
      expect((entry as any).fetch).toBeUndefined();
      expect((entry as any).actions).toBeUndefined();
    }
  });

  it('includes type, label, defaultRefreshSeconds, fields', () => {
    for (const entry of integrationTypes()) {
      expect(entry.type).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.defaultRefreshSeconds).toBeGreaterThan(0);
      expect(Array.isArray(entry.fields)).toBe(true);
    }
  });
});
