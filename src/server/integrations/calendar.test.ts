import { describe, expect, test } from 'bun:test';
import { expandRecurrence, parseICS, parseIcsDate } from './calendar';

const DAY = 86_400_000;

describe('parseIcsDate', () => {
  test('VALUE=DATE is all-day', () => {
    const d = parseIcsDate('20260616', { VALUE: 'DATE' });
    expect(d?.allDay).toBe(true);
  });

  test('Z suffix is UTC', () => {
    expect(parseIcsDate('20260616T120000Z')?.epoch).toBe(Date.UTC(2026, 5, 16, 12, 0, 0));
  });

  test('junk returns null', () => {
    expect(parseIcsDate('not-a-date')).toBeNull();
  });
});

describe('expandRecurrence', () => {
  test('WEEKLY with COUNT yields N occurrences a week apart', () => {
    const start = { epoch: Date.UTC(2026, 0, 1, 9, 0, 0), allDay: false };
    const occ = expandRecurrence(start, 'FREQ=WEEKLY;COUNT=3', start.epoch + 365 * DAY);
    expect(occ.length).toBe(3);
    expect(occ[1] - occ[0]).toBe(7 * DAY);
  });

  test('stops at windowEnd', () => {
    const start = { epoch: Date.UTC(2026, 0, 1), allDay: true };
    const occ = expandRecurrence(start, 'FREQ=DAILY', start.epoch + 2 * DAY);
    expect(occ.length).toBe(3); // days 0, 1, 2
  });
});

describe('parseICS', () => {
  const now = Date.UTC(2026, 5, 16, 0, 0, 0);
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Team sync\\, weekly
DTSTART:20260617T140000Z
DTEND:20260617T150000Z
LOCATION:Room 1
END:VEVENT
BEGIN:VEVENT
SUMMARY:Old event
DTSTART:20200101T100000Z
DTEND:20200101T110000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Standup
DTSTART:20260616T130000Z
DTEND:20260616T131500Z
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT
END:VCALENDAR`;

  test('parses upcoming events, unescapes text, drops past', () => {
    const events = parseICS(ics, 'Work', now, now + 30 * DAY);
    const titles = events.map((e) => e.title);
    expect(titles).toContain('Team sync, weekly');
    expect(titles).not.toContain('Old event');
    expect(events[0].calendar).toBe('Work');
  });

  test('expands a recurring event into multiple occurrences', () => {
    const events = parseICS(ics, 'Work', now, now + 30 * DAY);
    expect(events.filter((e) => e.title === 'Standup').length).toBe(5);
  });
});
