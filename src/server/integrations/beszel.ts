import type { BeszelDisk, BeszelPayload, BeszelSystem } from '../types';

export type BeszelConfig = { url?: string; user?: string; pass?: string; token?: string };

type BeszelInfo = {
  h?: string;
  u?: number;
  cpu?: number;
  mp?: number;
  dp?: number;
  la?: unknown;
  efs?: Record<string, { d?: number; du?: number } | number>;
};

type BeszelRecord = {
  id?: string;
  name?: string;
  host?: string;
  status?: string;
  info?: BeszelInfo;
};

type SmartAttribute = {
  n?: string;
  rv?: number | string;
  rs?: string;
};

type SmartDeviceRecord = {
  id?: string;
  system?: string;
  name?: string;
  model?: string;
  type?: string;
  state?: string;
  temp?: number;
  capacity?: number;
  hours?: number;
  attributes?: SmartAttribute[] | string;
};

type PocketBaseList<T> = {
  items?: T[];
};

let cachedToken: string | null = null;

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

function normalizeStatus(status: string | undefined): BeszelSystem['status'] {
  if (status === 'up' || status === 'down' || status === 'paused' || status === 'pending') {
    return status;
  }
  return 'unknown';
}

function normalizeLoadAvg(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const load = value.slice(0, 3).map((v) => Number(v));
  if (load.some((v) => !Number.isFinite(v))) return undefined;
  return [load[0], load[1], load[2]];
}

function parseAttributes(value: SmartDeviceRecord['attributes']): SmartAttribute[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function smartValue(attrs: SmartAttribute[], names: string[]): number | null {
  const found = attrs.find((attr) => attr.n && names.includes(attr.n));
  if (!found) return null;
  const n = Number(found.rv ?? found.rs ?? 0);
  return Number.isFinite(n) ? n : null;
}

function efsKeyForDevice(name: string): string {
  return name.replace(/^\/dev\//, '').replace(/p?\d+$/, '');
}

function usedPercentForDevice(
  deviceName: string,
  system: BeszelSystem | undefined,
  rawSystem: BeszelRecord | undefined,
): number | null {
  const efs = rawSystem?.info?.efs;
  if (!efs || !system) return null;

  const diskName = efsKeyForDevice(deviceName);
  const match = Object.entries(efs).find(
    ([key]) => key === diskName || key.startsWith(`${diskName}`),
  );
  if (!match) return null;

  const value = match[1];
  if (typeof value === 'number') return clampPercent(value);
  const capacity = Number(value.d ?? 0);
  const used = Number(value.du ?? 0);
  if (capacity > 0 && Number.isFinite(used)) return clampPercent((used / capacity) * 100);
  return null;
}

async function authenticate(config: BeszelConfig): Promise<string | null> {
  const base = config.url?.replace(/\/$/, '') || null;
  if (!base) return null;
  const identity = config.user ?? '';
  const password = config.pass ?? '';
  if (!identity || !password) return null;

  const res = await fetch(`${base}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Beszel auth error: ${res.status}`);

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('Beszel auth did not return a token');
  cachedToken = data.token;
  return cachedToken;
}

async function beszelFetch(config: BeszelConfig, path: string, retry = true): Promise<Response> {
  const base = config.url?.replace(/\/$/, '') || null;
  if (!base) throw new Error('BESZEL_URL not configured');

  const configToken = config.token || null;
  const token = configToken ?? cachedToken ?? (await authenticate(config));
  if (!token) throw new Error('BESZEL_TOKEN or BESZEL_USER/BESZEL_PASS not configured');

  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401 && cachedToken && retry && !configToken) {
    cachedToken = null;
    return beszelFetch(config, path, false);
  }

  return res;
}

function systemFromRecord(record: BeszelRecord): BeszelSystem {
  const info = record.info ?? {};
  return {
    id: String(record.id ?? record.name ?? crypto.randomUUID()),
    name: String(record.name ?? info.h ?? record.host ?? 'Unknown'),
    host: record.host ?? info.h,
    status: normalizeStatus(record.status),
    cpuPercent: clampPercent(Number(info.cpu ?? 0)),
    memoryPercent: clampPercent(Number(info.mp ?? 0)),
    diskPercent: clampPercent(Number(info.dp ?? 0)),
    uptimeSeconds: Number.isFinite(Number(info.u)) ? Number(info.u) : null,
    loadAvg: normalizeLoadAvg(info.la),
  };
}

function diskFromRecord(
  record: SmartDeviceRecord,
  systems: BeszelSystem[],
  rawSystems: BeszelRecord[],
): BeszelDisk {
  const attrs = parseAttributes(record.attributes);
  const system = systems.find((s) => s.id === record.system);
  const rawSystem = rawSystems.find((s) => s.id === record.system);
  return {
    id: String(record.id ?? `${record.system}:${record.name}`),
    systemId: String(record.system ?? ''),
    name: String(record.name ?? 'Unknown disk'),
    model: String(record.model ?? ''),
    type: String(record.type ?? ''),
    state: String(record.state ?? 'unknown'),
    tempC: Number.isFinite(Number(record.temp)) ? Number(record.temp) : null,
    capacityBytes: Number(record.capacity ?? 0),
    usedPercent: usedPercentForDevice(String(record.name ?? ''), system, rawSystem),
    hours: Number.isFinite(Number(record.hours)) ? Number(record.hours) : null,
    reallocatedSectors: smartValue(attrs, ['Reallocated_Sector_Ct', 'Reallocated_Event_Count']),
    pendingSectors: smartValue(attrs, ['Current_Pending_Sector']),
    offlineUncorrectable: smartValue(attrs, ['Offline_Uncorrectable']),
    mediaErrors: smartValue(attrs, ['MediaErrors']),
    wearPercent: smartValue(attrs, ['PercentageUsed']),
  };
}

export async function getBeszelSystems(
  config: BeszelConfig,
  names?: string[],
  max?: number,
): Promise<BeszelPayload | { error: string }> {
  const base = config.url?.replace(/\/$/, '') || null;
  if (!base) return { error: 'BESZEL_URL not configured' };

  try {
    const systemFields = encodeURIComponent('id,name,host,status,info');
    const diskFields = encodeURIComponent(
      'id,system,name,model,type,state,temp,capacity,hours,attributes',
    );
    const [systemsRes, disksRes] = await Promise.all([
      beszelFetch(config, `/api/collections/systems/records?perPage=200&fields=${systemFields}`),
      beszelFetch(config, `/api/collections/smart_devices/records?perPage=200&fields=${diskFields}`),
    ]);
    if (!systemsRes.ok) return { error: `Beszel systems error: ${systemsRes.status}` };
    if (!disksRes.ok) return { error: `Beszel disks error: ${disksRes.status}` };

    const data = (await systemsRes.json()) as PocketBaseList<BeszelRecord>;
    const diskData = (await disksRes.json()) as PocketBaseList<SmartDeviceRecord>;
    const wanted = new Set((names ?? []).map((name) => name.toLowerCase()));
    const rawSystems = data.items ?? [];
    const systems = rawSystems
      .map(systemFromRecord)
      .filter((system) => wanted.size === 0 || wanted.has(system.name.toLowerCase()))
      .sort((a, b) => {
        const statusDelta = Number(a.status !== 'up') - Number(b.status !== 'up');
        return statusDelta || b.cpuPercent - a.cpuPercent || a.name.localeCompare(b.name);
      })
      .slice(0, max ?? 8);

    const summary = { up: 0, down: 0, paused: 0, pending: 0, unknown: 0 };
    for (const system of systems) summary[system.status] += 1;

    const visibleSystemIds = new Set(systems.map((system) => system.id));
    const disks = (diskData.items ?? [])
      .filter((disk) => visibleSystemIds.has(String(disk.system ?? '')))
      .map((disk) => diskFromRecord(disk, systems, rawSystems))
      .sort((a, b) => {
        const stateDelta = Number(a.state !== 'PASSED') - Number(b.state !== 'PASSED');
        return stateDelta || a.name.localeCompare(b.name);
      });

    return { systems, disks, summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Beszel unreachable' };
  }
}
