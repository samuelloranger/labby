import { describe, expect, mock, test } from 'bun:test';
import type { DockerConfig } from './docker-client';
import { containerAction, containerLogs, listContainers } from './docker-client';

describe('Docker client', () => {
  test('reports missing config', async () => {
    expect(await listContainers({})).toEqual({ error: 'DOCKER_RO_HOST not configured' });
    expect(await containerAction({}, 'cid', 'start')).toEqual({
      error: 'DOCKER_RW_HOST not configured',
    });
    expect(await containerLogs({}, 'cid')).toEqual({ error: 'DOCKER_RO_HOST not configured' });
  });

  test('lists running containers with stats', async () => {
    const config: DockerConfig = { roHost: 'tcp://docker.test:2375', show: 'running' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/containers/json')) {
        return Response.json([
          {
            Id: 'abc123',
            Names: ['/jellyfin'],
            Image: 'jellyfin/jellyfin',
            State: 'running',
            Status: 'Up 1 hour',
          },
          {
            Id: 'def456',
            Names: ['/old'],
            Image: 'alpine',
            State: 'exited',
            Status: 'Exited (1) 2 hours ago',
          },
        ]);
      }
      if (url.includes('/abc123/stats')) {
        return Response.json({
          cpu_stats: {
            cpu_usage: { total_usage: 200 },
            system_cpu_usage: 1000,
            online_cpus: 4,
          },
          precpu_stats: {
            cpu_usage: { total_usage: 100 },
            system_cpu_usage: 500,
          },
        });
      }
      if (url.includes('/def456/json')) {
        return Response.json({ State: { ExitCode: 1 } });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await listContainers(config);
    globalThis.fetch = originalFetch;

    expect('containers' in result).toBe(true);
    if ('containers' in result) {
      expect(result.containers).toHaveLength(2);
      expect(result.containers[0].name).toBe('jellyfin');
      expect(result.containers[0].cpuPercent).toBe(80);
      expect(result.containers[1].state).toBe('exited');
      expect(result.containers[1].exitCode).toBe(1);
    }
  });

  test('returns error on list failure', async () => {
    const config: DockerConfig = { roHost: 'tcp://docker.test:2375' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('fail', { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await listContainers(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'Docker API error: 500' });
  });

  test('returns error when fetch throws', async () => {
    const config: DockerConfig = { roHost: 'tcp://docker.test:2375' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('docker down');
    }) as unknown as typeof fetch;

    const result = await listContainers(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'docker down' });
  });

  test('starts a container', async () => {
    const config: DockerConfig = { rwHost: 'tcp://docker.test:2375' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain('/containers/cid/start');
      expect(init?.method).toBe('POST');
      return new Response('', { status: 204 });
    }) as unknown as typeof fetch;

    const result = await containerAction(config, 'cid', 'start');
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ ok: true });
  });

  test('fetches container logs', async () => {
    const config: DockerConfig = { roHost: 'tcp://docker.test:2375' };
    const payload = new TextEncoder().encode('hello');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('/containers/cid/logs');
      return new Response(payload);
    }) as unknown as typeof fetch;

    const result = await containerLogs(config, 'cid', 50);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ logs: 'hello' });
  });
});
