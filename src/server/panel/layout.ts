import type { PanelSnapshot } from './snapshot';

/**
 * The panel is a 3x2 grid of cards. Every card scores its own relevance from
 * the snapshot; high scorers claim bigger slots (a tall column for what's
 * playing, a wide strip for incidents, a tall list for busy downloads) and the
 * remaining cells go to the best small cards. Small cards keep a fixed "home"
 * order so they don't shuffle when only numbers change, except promoted ones
 * (something just happened), which take the first cells so they catch the eye.
 */

export type CardId =
  | 'alert'
  | 'playing'
  | 'downloads'
  | 'event'
  | 'recent'
  | 'server'
  | 'storage'
  | 'containers'
  | 'sites'
  | 'weather'
  | 'dns';
export type Size = 'small' | 'tall' | 'wide';
export type Rect = { col: number; row: number; w: number; h: number };
export type Placement = { id: CardId; score: number; size: Size; why: string; rect: Rect };
export type Issue = { severity: 'down' | 'warn'; title: string; detail: string };
export type Decision =
  | { mode: 'grid'; issues: Issue[]; placements: Placement[] }
  | { mode: 'night'; issues: Issue[]; placements: [] };

export const COLS = 3;
export const ROWS = 2;
const PROMOTED = 75;
const DISK_WARN = 90;
const EVENT_SOON_MIN = 60;
const RECENT_FRESH_MS = 15 * 60_000;

type Candidate = { id: CardId; score: number; size: Size; home: number; why: string };

export function issuesOf(s: PanelSnapshot): Issue[] {
  const out: Issue[] = [];
  for (const name of s.systemsDown)
    out.push({ severity: 'down', title: name, detail: 'system offline' });
  for (const c of s.containers?.stopped ?? [])
    out.push({
      severity: 'down',
      title: c.name,
      detail: c.exitCode !== undefined ? `exited (${c.exitCode})` : 'stopped',
    });
  for (const t of s.sites?.down ?? [])
    out.push({ severity: 'down', title: t, detail: 'not responding' });
  for (const d of s.disks)
    if (d.usedPercent >= DISK_WARN)
      out.push({
        severity: 'warn',
        title: `${d.name} disk`,
        detail: `${Math.round(d.usedPercent)}% full`,
      });
  // Two monitor widgets watching the same site would otherwise report it twice.
  const seen = new Set<string>();
  return out.filter((i) => {
    const key = `${i.title}\n${i.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Minutes until the next timed event, or null when none is within the hour. */
export function minutesToNextEvent(s: PanelSnapshot): number | null {
  const next = s.events.find((e) => !e.allDay && e.start > s.now.getTime());
  if (!next) return null;
  const min = Math.ceil((next.start - s.now.getTime()) / 60_000);
  return min <= EVENT_SOON_MIN ? min : null;
}

export function candidates(s: PanelSnapshot, issues: Issue[]): Candidate[] {
  const out: Candidate[] = [];
  if (issues.length)
    out.push({ id: 'alert', score: 100, size: 'wide', home: -1, why: `${issues.length} issue(s)` });
  if (s.sessions.length)
    out.push({
      id: 'playing',
      score: 90,
      size: 'tall',
      home: 3,
      why: `${s.sessions.length} stream(s)`,
    });
  if (s.downloads) {
    const n = s.downloads.items.length;
    if (n >= 3) out.push({ id: 'downloads', score: 70, size: 'tall', home: 3, why: `${n} active` });
    else if (n > 0)
      out.push({ id: 'downloads', score: 55, size: 'small', home: 3, why: `${n} active` });
  }
  if (s.events.length) {
    const soon = minutesToNextEvent(s);
    out.push({
      id: 'event',
      score: soon !== null ? 85 : 25,
      size: 'small',
      home: 5,
      why: soon !== null ? `starts in ${soon} min` : 'filler',
    });
  }
  if (s.recent.length) {
    const fresh = s.now.getTime() - s.recent[0].addedAt <= RECENT_FRESH_MS;
    out.push({
      id: 'recent',
      score: fresh ? 80 : 22,
      size: 'small',
      home: 6,
      why: fresh ? 'just added' : 'filler',
    });
  }
  if (s.system) {
    const hot = s.system.cpu > 85;
    out.push({
      id: 'server',
      score: hot ? 88 : 50,
      size: 'small',
      home: 0,
      why: hot ? 'CPU hot' : 'baseline',
    });
  }
  if (s.disks.length) {
    const full = s.disks.some((d) => d.usedPercent >= DISK_WARN);
    out.push({
      id: 'storage',
      score: full ? 95 : 45,
      size: 'small',
      home: 1,
      why: full ? 'disk nearly full' : 'baseline',
    });
  }
  // The alert card already names what broke, so the counters step back.
  if (s.containers)
    out.push({
      id: 'containers',
      score: issues.length ? 30 : 40,
      size: 'small',
      home: 2,
      why: 'baseline',
    });
  if (s.sites && !s.containers)
    out.push({
      id: 'sites',
      score: issues.length ? 30 : 40,
      size: 'small',
      home: 2,
      why: 'baseline',
    });
  if (s.weather) out.push({ id: 'weather', score: 42, size: 'small', home: 4, why: 'baseline' });
  if (s.dns) out.push({ id: 'dns', score: 15, size: 'small', home: 8, why: 'filler' });
  return out.sort((a, b) => b.score - a.score);
}

/** Preferred slots per big card, tried in order. */
const BIG_SLOTS: Partial<Record<CardId, Rect[]>> = {
  alert: [
    { col: 1, row: 0, w: 2, h: 1 },
    { col: 0, row: 0, w: 2, h: 1 },
    { col: 1, row: 1, w: 2, h: 1 },
  ],
  playing: [
    { col: 0, row: 0, w: 1, h: 2 },
    { col: 2, row: 0, w: 1, h: 2 },
  ],
  downloads: [
    { col: 2, row: 0, w: 1, h: 2 },
    { col: 1, row: 0, w: 1, h: 2 },
    { col: 0, row: 0, w: 1, h: 2 },
  ],
};

export function plan(list: Candidate[]): Placement[] {
  const used = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const fits = (r: Rect) => {
    for (let y = r.row; y < r.row + r.h; y++)
      for (let x = r.col; x < r.col + r.w; x++) if (used[y]?.[x] !== false) return false;
    return true;
  };
  const take = (r: Rect) => {
    for (let y = r.row; y < r.row + r.h; y++)
      for (let x = r.col; x < r.col + r.w; x++) used[y][x] = true;
  };

  const placed: Placement[] = [];
  const small: Candidate[] = [];
  for (const c of list) {
    if (c.size === 'small') {
      small.push(c);
      continue;
    }
    const slot = BIG_SLOTS[c.id]?.find(fits);
    if (slot) {
      take(slot);
      placed.push({ id: c.id, score: c.score, size: c.size, why: c.why, rect: slot });
    } else {
      // No room to grow: compete as a small card instead of disappearing.
      small.push({ ...c, size: 'small', why: `${c.why}; no room to grow` });
    }
  }

  const free: Rect[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) if (!used[y][x]) free.push({ col: x, row: y, w: 1, h: 1 });
  const chosen = [...small].sort((a, b) => b.score - a.score).slice(0, free.length);
  const ordered = [
    ...chosen.filter((c) => c.score >= PROMOTED),
    ...chosen.filter((c) => c.score < PROMOTED).sort((a, b) => a.home - b.home),
  ];
  ordered.forEach((c, i) => {
    placed.push({ id: c.id, score: c.score, size: 'small', why: c.why, rect: free[i] });
  });
  return placed;
}

/** "23-7" → night from 23:00 to 06:59. "off" (or anything unparsable) disables it. */
export function parseNightHours(raw: string | undefined): { from: number; to: number } | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((raw ?? '23-7').trim());
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from > 23 || to > 23 || from === to) return null;
  return { from, to };
}

export function isNight(now: Date, hours: { from: number; to: number } | null): boolean {
  if (!hours) return false;
  const h = now.getHours();
  return hours.from > hours.to ? h >= hours.from || h < hours.to : h >= hours.from && h < hours.to;
}

export function decide(s: PanelSnapshot, night: { from: number; to: number } | null): Decision {
  const issues = issuesOf(s);
  if (isNight(s.now, night)) return { mode: 'night', issues, placements: [] };
  return { mode: 'grid', issues, placements: plan(candidates(s, issues)) };
}
