import { describe, expect, test } from 'bun:test';
import {
  calcCpuPercent,
  demuxDockerLogs,
  dockerFetch,
  dockerHost,
  normalizeContainerName,
} from '../integrations/docker';

describe('docker helpers', () => {
  test('dockerHost strips tcp prefix', () => {
    expect(dockerHost('tcp://docker-proxy-ro:2375')).toEqual({
      base: 'http://docker-proxy-ro:2375',
    });
  });

  test('dockerHost passes http through', () => {
    expect(dockerHost('http://docker-proxy-ro:2375/')).toEqual({
      base: 'http://docker-proxy-ro:2375',
    });
  });

  test('dockerHost treats a filesystem path as a unix socket', () => {
    expect(dockerHost('/var/run/docker.sock')).toEqual({
      base: 'http://localhost',
      unix: '/var/run/docker.sock',
    });
  });

  test('dockerHost accepts unix:// scheme', () => {
    expect(dockerHost('unix:///var/run/docker.sock')).toEqual({
      base: 'http://localhost',
      unix: '/var/run/docker.sock',
    });
  });

  test('dockerHost returns null for empty input', () => {
    expect(dockerHost(undefined)).toBeNull();
    expect(dockerHost('   ')).toBeNull();
  });

  test('dockerHost trims whitespace and trailing slash on socket paths', () => {
    expect(dockerHost(' /var/run/docker.sock/ ')).toEqual({
      base: 'http://localhost',
      unix: '/var/run/docker.sock',
    });
  });

  test('dockerHost drops a unix:// authority component', () => {
    expect(dockerHost('unix://localhost/var/run/docker.sock')).toEqual({
      base: 'http://localhost',
      unix: '/var/run/docker.sock',
    });
  });

  test('dockerFetch forwards the unix socket path to fetch', async () => {
    const calls: Array<[string, string | undefined]> = [];
    const orig = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit & { unix?: string }) => {
      calls.push([url, init?.unix]);
      return Promise.resolve(new Response('[]'));
    }) as typeof fetch;
    try {
      await dockerFetch({ base: 'http://localhost', unix: '/var/run/docker.sock' }, '/info');
      await dockerFetch({ base: 'http://docker-proxy-ro:2375' }, '/info');
    } finally {
      globalThis.fetch = orig;
    }
    expect(calls).toEqual([
      ['http://localhost/info', '/var/run/docker.sock'],
      ['http://docker-proxy-ro:2375/info', undefined],
    ]);
  });

  test('normalizeContainerName strips leading slash', () => {
    expect(normalizeContainerName(['/jellyfin'])).toBe('jellyfin');
  });

  test('calcCpuPercent returns rounded percent', () => {
    const pct = calcCpuPercent({
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
    expect(pct).toBe(80);
  });

  test('demuxDockerLogs falls back to plain text', () => {
    const text = demuxDockerLogs(new TextEncoder().encode('hello').buffer);
    expect(text).toBe('hello');
  });

  test('demuxDockerLogs decodes multiplexed (non-TTY) frames', () => {
    const payload = new TextEncoder().encode('hello');
    const frame = new Uint8Array(8 + payload.length);
    frame[0] = 1; // stdout stream type, bytes 1-3 stay zero
    new DataView(frame.buffer).setUint32(4, payload.length, false);
    frame.set(payload, 8);
    expect(demuxDockerLogs(frame.buffer)).toBe('hello');
  });

  test('demuxDockerLogs treats TTY (headerless) streams as raw text', () => {
    // Real log text whose first byte (>2) is not a valid stream-type header.
    const text = demuxDockerLogs(new TextEncoder().encode('plain tty log line').buffer);
    expect(text).toBe('plain tty log line');
  });
});
