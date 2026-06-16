import type { DockerContainer, DockerPayload } from '../types';
import {
  calcCpuPercent,
  demuxDockerLogs,
  dockerFetch,
  dockerHost,
  normalizeContainerName,
  type RawDockerContainer,
} from './docker';

const RO = () => dockerHost(process.env.DOCKER_RO_HOST);
const RW = () => dockerHost(process.env.DOCKER_RW_HOST);

export async function listContainers(
  show: 'all' | 'running' = 'running',
): Promise<DockerPayload | { error: string }> {
  const base = RO();
  if (!base) return { error: 'DOCKER_RO_HOST not configured' };

  try {
    const all = show === 'all';
    const res = await dockerFetch(base, `/containers/json?all=${all}`);
    if (!res.ok) return { error: `Docker API error: ${res.status}` };
    const raw = (await res.json()) as RawDockerContainer[];

    // Fetch per-container stats/inspect in parallel — serial awaits over dozens
    // of containers made the whole payload take seconds to load.
    const containers: DockerContainer[] = await Promise.all(
      raw.map(async (item) => {
        let cpuPercent: number | null = null;
        let exitCode: number | undefined;

        if (item.State === 'running') {
          try {
            const statsRes = await dockerFetch(base, `/containers/${item.Id}/stats?stream=false`);
            if (statsRes.ok) cpuPercent = calcCpuPercent(await statsRes.json());
          } catch {
            cpuPercent = null;
          }
        } else if (item.State === 'exited') {
          try {
            const inspectRes = await dockerFetch(base, `/containers/${item.Id}/json`);
            if (inspectRes.ok) exitCode = (await inspectRes.json())?.State?.ExitCode;
          } catch {
            exitCode = undefined;
          }
        }

        return {
          id: item.Id,
          name: normalizeContainerName(item.Names),
          image: item.Image,
          state:
            item.State === 'running' ? 'running' : item.State === 'exited' ? 'exited' : 'other',
          status: item.Status,
          cpuPercent,
          exitCode,
        } satisfies DockerContainer;
      }),
    );

    return { containers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Docker unreachable' };
  }
}

export async function containerAction(
  id: string,
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: true } | { error: string }> {
  const base = RW();
  if (!base) return { error: 'DOCKER_RW_HOST not configured' };

  try {
    const res = await dockerFetch(base, `/containers/${id}/${action}`, { method: 'POST' });
    if (!res.ok && res.status !== 304) {
      const text = await res.text().catch(() => '');
      return { error: `Docker ${action} failed: ${res.status} ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `Docker ${action} failed` };
  }
}

export async function containerLogs(
  id: string,
  tail = 200,
): Promise<{ logs: string } | { error: string }> {
  const base = RO();
  if (!base) return { error: 'DOCKER_RO_HOST not configured' };

  try {
    const res = await dockerFetch(
      base,
      `/containers/${id}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=true`,
    );
    if (!res.ok) return { error: `Docker logs error: ${res.status}` };
    const buffer = await res.arrayBuffer();
    return { logs: demuxDockerLogs(buffer) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Docker logs failed' };
  }
}
