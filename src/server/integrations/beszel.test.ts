import { describe, expect, mock, test } from 'bun:test';
import type { BeszelConfig } from './beszel';
import { getBeszelSystems } from './beszel';

describe('Beszel client', () => {
  test('reports missing config', async () => {
    expect(await getBeszelSystems({})).toEqual({ error: 'BESZEL_URL not configured' });
  });

  test('maps systems and disks with token auth', async () => {
    const config: BeszelConfig = { url: 'http://beszel.test', token: 'bearer-token' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer bearer-token');

      if (url.includes('/api/collections/systems/records')) {
        return Response.json({
          items: [
            {
              id: 'sys-1',
              name: 'nas',
              host: '10.0.0.1',
              status: 'up',
              info: { cpu: 12.5, mp: 40, dp: 55, u: 3600, la: [0.1, 0.2, 0.3] },
            },
            {
              id: 'sys-2',
              name: 'pi',
              status: 'down',
              info: { cpu: 0, mp: 0, dp: 0 },
            },
          ],
        });
      }
      if (url.includes('/api/collections/smart_devices/records')) {
        return Response.json({
          items: [
            {
              id: 'disk-1',
              system: 'sys-1',
              name: '/dev/sda',
              model: 'Samsung',
              type: 'ssd',
              state: 'PASSED',
              temp: 35,
              capacity: 1_000_000_000_000,
              hours: 1000,
              attributes: JSON.stringify([{ n: 'Reallocated_Sector_Ct', rv: 0 }]),
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getBeszelSystems(config, ['nas'], 4);
    globalThis.fetch = originalFetch;

    expect('systems' in result).toBe(true);
    if ('systems' in result) {
      expect(result.systems).toHaveLength(1);
      expect(result.systems[0].name).toBe('nas');
      expect(result.systems[0].cpuPercent).toBe(12.5);
      expect(result.summary.up).toBe(1);
      expect(result.disks).toHaveLength(1);
      expect(result.disks[0].name).toBe('/dev/sda');
    }
  });

  test('returns error on systems fetch failure', async () => {
    const config: BeszelConfig = { url: 'http://beszel.test', token: 'tok' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/systems/')) return new Response('fail', { status: 500 });
      if (url.includes('/smart_devices/')) return Response.json({ items: [] });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getBeszelSystems(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Beszel systems error: 500' });
  });

  test('returns error when fetch throws', async () => {
    const config: BeszelConfig = { url: 'http://beszel.test', token: 'tok' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('beszel down');
    }) as unknown as typeof fetch;

    const result = await getBeszelSystems(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'beszel down' });
  });
});
