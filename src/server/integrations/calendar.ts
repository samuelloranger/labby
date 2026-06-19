import type { CalendarEvent, CalendarPayload } from '../types';
import { TIMEOUT_MS } from './http';

type IcsDate = { epoch: number; allDay: boolean };
type IcsSource = { name: string; url: string };

// RFC5545 line folding: a line beginning with space/tab continues the previous.
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (lines.length && (line.startsWith(' ') || line.startsWith('\t'))) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(
  line: string,
): { name: string; params: Record<string, string>; value: string } | null {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const [name, ...paramParts] = line.slice(0, idx).split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(idx + 1) };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

// VALUE=DATE → all-day; trailing Z → UTC; otherwise (floating / TZID) parsed as
// server-local wall time.
// TZID treated as server-local — a feed in another tz shifts hours;
// add a tz lib (luxon/Temporal) if cross-tz accuracy ever matters.
export function parseIcsDate(value: string, params: Record<string, string> = {}): IcsDate | null {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    // All-day is date-only: anchor at UTC midnight so the client reads the same
    // calendar date regardless of server or viewer timezone.
    return { epoch: Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)), allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const epoch = z
    ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    : new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return { epoch, allDay: false };
}

// expands FREQ DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL.
// Ignores BYDAY/BYMONTHDAY/EXDATE — occurrences follow DTSTART. Add BY*/EXDATE
// handling if real feeds rely on them. 2000-iteration cap guards malformed rules.
export function expandRecurrence(start: IcsDate, rrule: string, windowEnd: number): number[] {
  const rule: Record<string, string> = {};
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  const freq = rule.FREQ;
  if (!freq) return [start.epoch];
  const interval = Math.max(1, parseInt(rule.INTERVAL ?? '1', 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
  const until = rule.UNTIL ? (parseIcsDate(rule.UNTIL)?.epoch ?? null) : null;

  const out: number[] = [];
  const d = new Date(start.epoch);
  for (let i = 0; i < 2000; i++) {
    const t = d.getTime();
    if (until != null && t > until) break;
    if (count != null && out.length >= count) break;
    if (t > windowEnd) break;
    out.push(t);
    if (freq === 'DAILY') d.setDate(d.getDate() + interval);
    else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + interval);
    else if (freq === 'YEARLY') d.setFullYear(d.getFullYear() + interval);
    else break;
  }
  return out;
}

export function parseICS(
  text: string,
  calendar: string,
  now: number,
  windowEnd: number,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let cur: {
    start?: IcsDate;
    end?: IcsDate;
    summary?: string;
    location?: string;
    rrule?: string;
  } | null = null;

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur?.start && cur.summary) {
        const durationMs = cur.end
          ? Math.max(0, cur.end.epoch - cur.start.epoch)
          : cur.start.allDay
            ? 86_400_000
            : 0;
        const starts = cur.rrule
          ? expandRecurrence(cur.start, cur.rrule, windowEnd)
          : [cur.start.epoch];
        for (const s of starts) {
          const end = s + durationMs;
          if (end < now - 36 * 3_600_000 || s > windowEnd) continue; // drop fully-past / beyond-window
          events.push({
            title: cur.summary,
            start: s,
            end,
            allDay: cur.start.allDay,
            location: cur.location,
            calendar,
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const parsed = parseLine(line);
    if (!parsed) continue;
    switch (parsed.name) {
      case 'DTSTART':
        cur.start = parseIcsDate(parsed.value, parsed.params) ?? undefined;
        break;
      case 'DTEND':
        cur.end = parseIcsDate(parsed.value, parsed.params) ?? undefined;
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(parsed.value);
        break;
      case 'LOCATION':
        cur.location = unescapeText(parsed.value);
        break;
      case 'RRULE':
        cur.rrule = parsed.value.trim();
        break;
    }
  }
  return events;
}

export type CalendarConfig = { icsUrls?: string[] };

// Each entry is `Name|https://…` or a bare URL.
function parseSources(icsUrls: string[]): IcsSource[] {
  return icsUrls
    .map((entry) => {
      const e = entry.trim();
      const pipe = e.indexOf('|');
      return pipe !== -1
        ? { name: e.slice(0, pipe).trim(), url: e.slice(pipe + 1).trim() }
        : { name: '', url: e };
    })
    .filter((s) => s.url);
}

const LOOKAHEAD_DAYS = 30;
const MAX_EVENTS = 50;

export async function getCalendarEvents(
  config: CalendarConfig,
): Promise<CalendarPayload | { error: string }> {
  const srcs = parseSources(config.icsUrls ?? []);
  if (srcs.length === 0) return { error: 'CALENDAR_ICS_URLS not configured' };

  const now = Date.now();
  const windowEnd = now + LOOKAHEAD_DAYS * 86_400_000;

  // One bad feed must never blank the widget: each fetch fails soft to [].
  const lists = await Promise.all(
    srcs.map(async (src) => {
      try {
        const res = await fetch(src.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return [];
        return parseICS(await res.text(), src.name, now, windowEnd);
      } catch {
        return [];
      }
    }),
  );

  const events = lists
    .flat()
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_EVENTS);
  return { events };
}
