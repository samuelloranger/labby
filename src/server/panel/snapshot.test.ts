import { expect, test } from 'bun:test';
import { buildSnapshot, condFromIcon } from './snapshot';

const NOW = new Date('2026-03-10T15:00:00Z');

const row = (id: number, type: string, enabled = true) => ({ id, type, enabled });

test('an empty homelab gives an empty snapshot', () => {
  const s = buildSnapshot([], new Map(), NOW);
  expect(s.system).toBeUndefined();
  expect(s.sessions).toEqual([]);
  expect(s.downloads).toBeUndefined();
});

test('errored payloads and disabled rows are skipped', () => {
  const s = buildSnapshot(
    [row(1, 'docker'), row(2, 'docker', false)],
    new Map<string, unknown>([
      ['int:1', { error: 'docker unreachable' }],
      [
        'int:2',
        {
          containers: [
            { id: 'a', name: 'a', image: 'x', state: 'running', status: '', cpuPercent: 0 },
          ],
        },
      ],
    ]),
    NOW,
  );
  expect(s.containers).toBeUndefined();
});

test('docker rows merge, and exited containers become stopped entries', () => {
  const s = buildSnapshot(
    [row(1, 'docker'), row(2, 'docker')],
    new Map<string, unknown>([
      [
        'int:1',
        {
          containers: [
            { id: 'a', name: 'web', image: 'x', state: 'running', status: '', cpuPercent: 1 },
          ],
        },
      ],
      [
        'int:2',
        {
          containers: [
            { id: 'b', name: 'db', image: 'x', state: 'running', status: '', cpuPercent: 1 },
            {
              id: 'c',
              name: 'worker',
              image: 'x',
              state: 'exited',
              status: '',
              cpuPercent: null,
              exitCode: 137,
            },
          ],
        },
      ],
    ]),
    NOW,
  );
  expect(s.containers).toEqual({
    running: 2,
    total: 3,
    stopped: [{ name: 'worker', exitCode: 137 }],
  });
});

test('beszel picks the first up system and its disks; down systems are listed', () => {
  const disk = (id: string, systemId: string, usedPercent: number | null) => ({
    id,
    systemId,
    name: id,
    model: '',
    type: 'hdd',
    state: 'ok',
    tempC: null,
    capacityBytes: 4e12,
    usedPercent,
    hours: null,
    reallocatedSectors: null,
    pendingSectors: null,
    offlineUncorrectable: null,
    mediaErrors: null,
    wearPercent: null,
  });
  const s = buildSnapshot(
    [row(1, 'beszel')],
    new Map<string, unknown>([
      [
        'int:1',
        {
          systems: [
            {
              id: 'n1',
              name: 'nas',
              status: 'down',
              cpuPercent: 0,
              memoryPercent: 0,
              diskPercent: 0,
              uptimeSeconds: null,
            },
            {
              id: 'h1',
              name: 'host',
              status: 'up',
              cpuPercent: 12,
              memoryPercent: 50,
              diskPercent: 40,
              uptimeSeconds: 99,
            },
          ],
          disks: [disk('sda', 'h1', 70), disk('sdb', 'h1', null), disk('sdc', 'n1', 99)],
          summary: { up: 1, down: 1, paused: 0, pending: 0, unknown: 0 },
        },
      ],
    ]),
    NOW,
  );
  expect(s.system).toEqual({ name: 'host', cpu: 12, mem: 50, disk: 40, uptimeSeconds: 99 });
  expect(s.systemsDown).toEqual(['nas']);
  expect(s.disks).toEqual([{ name: 'sda', usedPercent: 70, capacityBytes: 4e12 }]);
});

test('downloads keep only active transfers and merge clients', () => {
  const torrent = (name: string, progress: number, state: string) => ({
    name,
    progress,
    dlSpeed: 1000,
    upSpeed: 0,
    state,
    hash: name,
    eta: 60,
  });
  const s = buildSnapshot(
    [row(1, 'qbittorrent'), row(2, 'sabnzbd')],
    new Map<string, unknown>([
      [
        'int:1',
        {
          torrents: [
            torrent('a', 40, 'downloading'),
            torrent('b', 100, 'uploading'),
            torrent('c', 10, 'pausedDL'),
          ],
          aggregateDlSpeed: 1000,
          aggregateUpSpeed: 500,
        },
      ],
      [
        'int:2',
        {
          paused: false,
          speedBps: 2000,
          sizeLeftMb: 1,
          timeLeft: '0:10:00',
          slots: [
            {
              id: 'n',
              name: 'nzb',
              progress: 20,
              sizeLeftMb: 1,
              timeLeft: '1:02:03',
              status: 'Downloading',
            },
          ],
        },
      ],
    ]),
    NOW,
  );
  expect(s.downloads?.items.map((d) => d.name)).toEqual(['a', 'nzb']);
  expect(s.downloads?.items[1].eta).toBe(3723);
  expect(s.downloads?.dl).toBe(3000);
  expect(s.downloads?.up).toBe(500);
});

test('an idle download client still yields an (empty) downloads entry', () => {
  const s = buildSnapshot(
    [row(1, 'transmission')],
    new Map<string, unknown>([
      ['int:1', { torrents: [], aggregateDlSpeed: 0, aggregateUpSpeed: 0 }],
    ]),
    NOW,
  );
  expect(s.downloads).toEqual({ items: [], dl: 0, up: 0 });
});

test('jellyfin sessions and recent items carry artwork refs; plex ones do not', () => {
  const session = {
    id: 's',
    title: 'Film',
    subtitle: '',
    user: 'u',
    device: 'd',
    progress: 10,
    isTranscoding: false,
  };
  const s = buildSnapshot(
    [row(4, 'jellyfin'), row(5, 'plex')],
    new Map<string, unknown>([
      [
        'int:4',
        {
          sessions: [{ ...session, posterId: 'p1', backdropId: 'b1' }],
          playing: 1,
          recent: [
            {
              id: 'r',
              kind: 'movie',
              title: 'New',
              subtitle: '',
              addedAt: '2026-03-10T14:55:00Z',
              posterId: 'p2',
            },
          ],
        },
      ],
      ['int:5', { sessions: [{ ...session, title: 'Other' }], playing: 1, recent: [] }],
    ]),
    NOW,
  );
  expect(s.sessions[0].poster).toEqual({ integrationId: 4, itemId: 'p1', kind: 'poster' });
  expect(s.sessions[0].backdrop).toEqual({ integrationId: 4, itemId: 'b1', kind: 'backdrop' });
  expect(s.sessions[1].poster).toBeUndefined();
  expect(s.recent[0]).toEqual({
    title: 'New',
    kind: 'movie',
    addedAt: Date.parse('2026-03-10T14:55:00Z'),
    poster: { integrationId: 4, itemId: 'p2', kind: 'poster' },
  });
});

test('calendar keeps events that have not ended, soonest first', () => {
  const at = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, '0')}:00:00Z`).getTime();
  const s = buildSnapshot(
    [row(1, 'calendar')],
    new Map<string, unknown>([
      [
        'int:1',
        {
          events: [
            { title: 'later', start: at(18), end: at(19), allDay: false, calendar: 'c' },
            { title: 'past', start: at(9), end: at(10), allDay: false, calendar: 'c' },
            { title: 'now', start: at(14), end: at(16), allDay: false, calendar: 'c' },
          ],
        },
      ],
    ]),
    NOW,
  );
  expect(s.events.map((e) => e.title)).toEqual(['now', 'later']);
});

test('weather uses the first healthy location', () => {
  const s = buildSnapshot(
    [row(1, 'weather')],
    new Map<string, unknown>([
      [
        'int:1',
        {
          locations: {
            a: { error: 'bad key' },
            b: {
              city: 'X',
              temp: 6.6,
              feelsLike: 3.2,
              tempMin: 1,
              tempMax: 8,
              humidity: 1,
              windSpeed: 1,
              windDeg: 1,
              description: 'light rain',
              icon: '10d',
              sunrise: 0,
              sunset: 0,
              units: 'metric',
              forecast: [{ date: '', label: 'Wed', tempMin: 0.4, tempMax: 5.6, icon: '13d' }],
            },
          },
        },
      ],
    ]),
    NOW,
  );
  expect(s.weather).toEqual({
    temp: 7,
    feelsLike: 3,
    description: 'light rain',
    cond: 'rain',
    days: [{ label: 'Wed', min: 0, max: 6, cond: 'snow' }],
  });
});

test('condFromIcon maps OpenWeather codes to panel shapes', () => {
  expect(condFromIcon('01n')).toBe('sun');
  expect(condFromIcon('03d')).toBe('cloud');
  expect(condFromIcon('50d')).toBe('cloud');
  expect(condFromIcon('11d')).toBe('rain');
  expect(condFromIcon('13d')).toBe('snow');
});
