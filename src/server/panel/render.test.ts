import { afterEach, expect, mock, test } from 'bun:test';
import type { IntegrationRow } from '../db';
import { resolveArt } from './art';
import { Panel } from './cards';
import { decide } from './layout';
import { renderFrame } from './render';
import type { PanelSnapshot } from './snapshot';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function snap(minute: number): PanelSnapshot {
  return {
    now: new Date(2026, 2, 10, 15, minute),
    system: { name: 'host', cpu: 10, mem: 40, disk: 30, uptimeSeconds: 1 },
    systemsDown: [],
    disks: [],
    sessions: [{ title: 'Film', subtitle: '2024', user: 'u', device: 'TV', progress: 30 }],
    recent: [],
    events: [],
  };
}

const frameOf = (s: PanelSnapshot) => renderFrame(Panel(s, decide(s, null), () => undefined));

test('renders an 800x480 JPEG with a stable ETag for identical frames', async () => {
  const a = await frameOf(snap(0));
  expect([a.jpeg[0], a.jpeg[1]]).toEqual([0xff, 0xd8]);
  // SOF0 marker carries the dimensions: height then width, big-endian.
  const sof = a.jpeg.findIndex((b, i) => b === 0xff && a.jpeg[i + 1] === 0xc0);
  const view = new DataView(a.jpeg.buffer, a.jpeg.byteOffset + sof);
  expect([view.getUint16(7), view.getUint16(5)]).toEqual([800, 480]);

  const again = await frameOf(snap(0));
  expect(again.etag).toBe(a.etag);
  const later = await frameOf(snap(1));
  expect(later.etag).not.toBe(a.etag);
});

test('renders the night clock and an empty grid without throwing', async () => {
  const empty: PanelSnapshot = { ...snap(0), system: undefined, sessions: [] };
  expect(
    (await renderFrame(Panel(empty, decide(empty, null), () => undefined))).jpeg.length,
  ).toBeGreaterThan(0);
  const late = { ...snap(0), now: new Date(2026, 2, 10, 2, 0) };
  const night = decide(late, { from: 23, to: 7 });
  expect(night.mode).toBe('night');
  expect((await renderFrame(Panel(late, night, () => undefined))).jpeg.length).toBeGreaterThan(0);
});

test('resolveArt fetches jellyfin artwork once and caches misses', async () => {
  const calls: string[] = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/Backdrop')) return new Response('nope', { status: 404 });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
  }) as unknown as typeof fetch;
  const rows = new Map<number, IntegrationRow>([
    [
      7,
      {
        id: 7,
        name: 'jf',
        type: 'jellyfin',
        config: { url: 'http://jf.test', apiKey: 'k' },
        enabled: true,
        refreshSeconds: null,
        position: 0,
      },
    ],
  ]);
  const refs = [
    { integrationId: 7, itemId: 'art-test-p', kind: 'poster' as const },
    { integrationId: 7, itemId: 'art-test-b', kind: 'backdrop' as const },
    { integrationId: 99, itemId: 'x', kind: 'poster' as const },
  ];

  const first = await resolveArt(refs, rows);
  expect(first.get('7:art-test-p:poster')).toBe('data:image/jpeg;base64,AQID');
  expect(first.has('7:art-test-b:backdrop')).toBe(false);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain('/Items/art-test-p/Images/Primary?fillWidth=200&fillHeight=300');

  await resolveArt(refs, rows);
  expect(calls).toHaveLength(2);
});

test('concurrent renders share one artwork fetch', async () => {
  let calls = 0;
  globalThis.fetch = mock(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/jpeg' } });
  }) as unknown as typeof fetch;
  const rows = new Map<number, IntegrationRow>([
    [
      8,
      {
        id: 8,
        name: 'jf',
        type: 'jellyfin',
        config: { url: 'http://jf.test', apiKey: 'k' },
        enabled: true,
        refreshSeconds: null,
        position: 0,
      },
    ],
  ]);
  const refs = [{ integrationId: 8, itemId: 'shared-art', kind: 'poster' as const }];
  const [a, b] = await Promise.all([resolveArt(refs, rows), resolveArt(refs, rows)]);
  expect(calls).toBe(1);
  expect(a.get('8:shared-art:poster')).toBe(b.get('8:shared-art:poster'));
});
