export type DockerConfig = { roHost?: string; rwHost?: string; show?: 'all' | 'running' };

export function dockerHost(host: string | undefined): string | null {
  if (!host) return null;
  return host.replace(/^tcp:\/\//, 'http://').replace(/\/$/, '');
}

export async function dockerFetch(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${base}${path}`;
  return fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) });
}

export function demuxDockerLogs(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let offset = 0;
  while (offset + 8 <= view.byteLength) {
    // Multiplexed (non-TTY) frames begin with an 8-byte header: a stream-type
    // byte (0=stdin, 1=stdout, 2=stderr) followed by three zero bytes, then a
    // big-endian uint32 length. A TTY-enabled container emits a raw, headerless
    // stream — detect that and decode the whole buffer as plain text instead of
    // misreading log bytes as frame sizes.
    const streamType = bytes[offset];
    if (
      streamType > 2 ||
      bytes[offset + 1] !== 0 ||
      bytes[offset + 2] !== 0 ||
      bytes[offset + 3] !== 0
    ) {
      return decoder.decode(buffer);
    }
    const size = view.getUint32(offset + 4, false);
    offset += 8;
    if (offset + size > view.byteLength) break;
    chunks.push(decoder.decode(new Uint8Array(buffer, offset, size)));
    offset += size;
  }
  if (chunks.length === 0) {
    return decoder.decode(buffer);
  }
  return chunks.join('');
}

export type RawDockerContainer = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
};

export type DockerContainerStats = {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
  };
};

export function calcCpuPercent(stats: DockerContainerStats): number | null {
  const cpu = stats.cpu_stats;
  const pre = stats.precpu_stats;
  if (!cpu?.cpu_usage?.total_usage || !pre?.cpu_usage?.total_usage) return null;
  const cpuDelta = cpu.cpu_usage.total_usage - pre.cpu_usage.total_usage;
  const sysDelta = (cpu.system_cpu_usage ?? 0) - (pre.system_cpu_usage ?? 0);
  if (sysDelta <= 0 || cpuDelta < 0) return null;
  const cpus = cpu.online_cpus ?? 1;
  return Math.round((cpuDelta / sysDelta) * cpus * 1000) / 10;
}

export function normalizeContainerName(names: string[]): string {
  const name = names[0] ?? 'unknown';
  return name.replace(/^\//, '');
}
