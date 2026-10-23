import { expect, test } from 'bun:test';
import { decide, isNight, issuesOf, type Placement, parseNightHours } from './layout';
import type { PanelSnapshot } from './snapshot';

const NOW = new Date(2026, 2, 10, 15, 0);
const NIGHT = { from: 23, to: 7 };

function snap(over: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return {
    now: NOW,
    system: { name: 'host', cpu: 10, mem: 40, disk: 30, uptimeSeconds: 1 },
    systemsDown: [],
    disks: [{ name: 'storage', usedPercent: 70, capacityBytes: 1e12 }],
    containers: { running: 10, total: 10, stopped: [] },
    downloads: { items: [{ name: 'a', progress: 50, speed: 1, eta: 60 }], dl: 1, up: 0 },
    sessions: [],
    recent: [{ title: 'Old', kind: 'movie', addedAt: NOW.getTime() - 86_400_000 }],
    weather: { temp: 5, feelsLike: 3, description: '', cond: 'sun', days: [] },
    events: [{ title: 'Later', start: NOW.getTime() + 5 * 3_600_000, allDay: false }],
    dns: { queries: 1, blockedPercent: 1 },
    ...over,
  };
}

const at = (ps: Placement[]) =>
  Object.fromEntries(ps.map((p) => [p.id, `${p.size}@${p.rect.col},${p.rect.row}`]));
const session = { title: 'Film', subtitle: '', user: 'u', device: 'd', progress: 30 };

test('a calm day fills the grid with small cards in home order', () => {
  const d = decide(snap(), NIGHT);
  expect(d.mode).toBe('grid');
  expect(d.placements.map((p) => p.id)).toEqual([
    'server',
    'storage',
    'containers',
    'downloads',
    'weather',
    'event',
  ]);
  expect(d.placements.every((p) => p.size === 'small')).toBe(true);
});

test('playing media takes the tall left column', () => {
  const d = decide(snap({ sessions: [session] }), NIGHT);
  expect(at(d.placements).playing).toBe('tall@0,0');
  expect(d.placements).toHaveLength(5);
});

test('an incident takes the wide top-right strip beside what is playing', () => {
  const d = decide(
    snap({
      sessions: [session],
      containers: { running: 9, total: 10, stopped: [{ name: 'db', exitCode: 1 }] },
    }),
    NIGHT,
  );
  expect(at(d.placements)).toMatchObject({ alert: 'wide@1,0', playing: 'tall@0,0' });
  expect(d.placements).toHaveLength(4);
  expect(d.issues).toEqual([{ severity: 'down', title: 'db', detail: 'exited (1)' }]);
});

test('three downloads grow into a tall list, and shrink back when there is no room', () => {
  const items = ['a', 'b', 'c'].map((name) => ({ name, progress: 10, speed: 1, eta: 60 }));
  const busy = decide(snap({ downloads: { items, dl: 3, up: 0 } }), NIGHT);
  expect(at(busy.placements).downloads).toBe('tall@2,0');

  const crowded = decide(
    snap({
      downloads: { items, dl: 3, up: 0 },
      sessions: [session],
      sites: { up: 0, total: 1, down: ['web'] },
    }),
    NIGHT,
  );
  const dl = crowded.placements.find((p) => p.id === 'downloads');
  expect(dl?.size).toBe('small');
  expect(dl?.why).toContain('no room to grow');
});

test('an event within the hour and a fresh addition jump to the first cells', () => {
  const d = decide(
    snap({
      events: [{ title: 'Soon', start: NOW.getTime() + 25 * 60_000, allDay: false }],
      recent: [{ title: 'New', kind: 'movie', addedAt: NOW.getTime() - 60_000 }],
    }),
    NIGHT,
  );
  expect(d.placements.slice(0, 2).map((p) => p.id)).toEqual(['event', 'recent']);
  expect(at(d.placements).event).toBe('small@0,0');
});

test('all-day events never count as "coming up"', () => {
  const d = decide(
    snap({ events: [{ title: 'Holiday', start: NOW.getTime() + 60_000, allDay: true }] }),
    NIGHT,
  );
  expect(d.placements.find((p) => p.id === 'event')?.score).toBe(25);
});

test('cards with no data are left out instead of shown empty', () => {
  const d = decide(
    snap({
      system: undefined,
      disks: [],
      containers: undefined,
      downloads: undefined,
      weather: undefined,
      dns: undefined,
    }),
    NIGHT,
  );
  expect(d.placements.map((p) => p.id)).toEqual(['event', 'recent']);
});

test('a nearly full disk is a warning and promotes the storage card', () => {
  const s = snap({ disks: [{ name: 'storage', usedPercent: 95, capacityBytes: 1 }] });
  expect(issuesOf(s)).toEqual([{ severity: 'warn', title: 'storage disk', detail: '95% full' }]);
  expect(decide(s, NIGHT).placements.find((p) => p.id === 'storage')?.score).toBe(95);
});

test('the same problem reported by two widgets is listed once', () => {
  const s = snap({ sites: { up: 0, total: 2, down: ['web', 'web'] } });
  expect(issuesOf(s)).toEqual([{ severity: 'down', title: 'web', detail: 'not responding' }]);
});

test('night mode replaces the grid but keeps the issues', () => {
  const late = new Date(2026, 2, 10, 1, 30);
  const d = decide(snap({ now: late, systemsDown: ['nas'] }), NIGHT);
  expect(d.mode).toBe('night');
  expect(d.issues).toHaveLength(1);
});

test('parseNightHours and isNight handle wrap-around, same-day ranges and "off"', () => {
  expect(parseNightHours(undefined)).toEqual({ from: 23, to: 7 });
  expect(parseNightHours('off')).toBeNull();
  expect(parseNightHours('7-7')).toBeNull();
  expect(parseNightHours('1-6')).toEqual({ from: 1, to: 6 });
  const h = (hour: number) => new Date(2026, 0, 1, hour);
  expect(isNight(h(23), { from: 23, to: 7 })).toBe(true);
  expect(isNight(h(6), { from: 23, to: 7 })).toBe(true);
  expect(isNight(h(7), { from: 23, to: 7 })).toBe(false);
  expect(isNight(h(3), { from: 1, to: 6 })).toBe(true);
  expect(isNight(h(0), { from: 1, to: 6 })).toBe(false);
  expect(isNight(h(3), null)).toBe(false);
});
