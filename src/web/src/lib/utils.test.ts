import { describe, expect, test } from 'bun:test';
import { formatEta, prepareDownloads, resolveIconSrc } from './utils';

describe('resolveIconSrc', () => {
  test('di: resolves local-first with a CDN fallback', () => {
    const r = resolveIconSrc('di:jellyfin');
    expect(r).toEqual({
      type: 'img',
      src: '/icons/di/jellyfin.svg',
      srcFallback: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/jellyfin.svg',
      lucide: 'box',
    });
  });

  test('lucide:, sh:, url, path, empty, and unknown each map correctly', () => {
    expect(resolveIconSrc('lucide:server')).toEqual({ type: 'lucide', lucide: 'server' });
    expect(resolveIconSrc('sh:plex').src).toBe(
      'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/plex.svg',
    );
    expect(resolveIconSrc('https://x/y.png').src).toBe('https://x/y.png');
    expect(resolveIconSrc('/local.svg').src).toBe('/local.svg');
    expect(resolveIconSrc(undefined, 'globe')).toEqual({ type: 'lucide', lucide: 'globe' });
    expect(resolveIconSrc('garbage', 'globe')).toEqual({ type: 'lucide', lucide: 'globe' });
  });
});

describe('formatEta', () => {
  test('returns em-dash for missing, negative, sentinel, and NaN', () => {
    expect(formatEta(null)).toBe('—');
    expect(formatEta(-1)).toBe('—');
    expect(formatEta(8640000)).toBe('—');
    expect(formatEta(NaN)).toBe('—');
  });
});

describe('prepareDownloads', () => {
  const make = (
    over: Partial<{ progress: number; dlSpeed: number; upSpeed: number; state: string }>,
  ) => ({
    name: 'x',
    progress: 100,
    dlSpeed: 0,
    upSpeed: 0,
    state: 'seeding',
    ...over,
  });

  test('caps a huge list and reports the hidden count', () => {
    const torrents = Array.from({ length: 670 }, () => make({}));
    const { visible, hidden } = prepareDownloads(torrents, 8);
    expect(visible.length).toBe(8);
    expect(hidden).toBe(662);
  });

  test('surfaces actively-transferring torrents first, fastest first', () => {
    const torrents = [
      make({ state: 'seeding' }),
      make({ progress: 10, state: 'downloading', dlSpeed: 500 }),
      make({ progress: 40, state: 'downloading', dlSpeed: 9000 }),
    ];
    const { visible } = prepareDownloads(torrents, 8);
    expect(visible[0].dlSpeed).toBe(9000);
    expect(visible[1].dlSpeed).toBe(500);
    expect(visible[2].state).toBe('seeding');
  });

  test('counts seeding vs downloading', () => {
    const torrents = [
      make({ state: 'seeding', progress: 100 }),
      make({ state: 'uploading', progress: 100 }),
      make({ state: 'downloading', progress: 30, dlSpeed: 100 }),
    ];
    const { seeding, downloading } = prepareDownloads(torrents, 8);
    expect(seeding).toBe(2);
    expect(downloading).toBe(1);
  });
});
