import { getConfig, onConfigChange } from '../config/loader';
import {
  collectDownloadClients,
  collectMonitorSites,
  collectWeatherLocations,
  getDockerShow,
  hasWidgetType,
} from '../config/schema';
import { getAdGuardStats } from '../integrations/adguard';
import { getArrSummary } from '../integrations/arr';
import { getBeszelSystems } from '../integrations/beszel';
import { getCalendarEvents } from '../integrations/calendar';
import { listContainers } from '../integrations/docker-client';
import { getJellyfinSessions } from '../integrations/jellyfin';
import { checkSites } from '../integrations/monitor';
import { getOpenWeather } from '../integrations/openweather';
import { getQBittorrentTorrents } from '../integrations/qbittorrent';
import { getReelwardSummary } from '../integrations/reelward';
import { getSpeedtestSummary } from '../integrations/speedtest';
import { getTransmissionTorrents } from '../integrations/transmission';
import type { Channel } from '../types';
import { hub } from './hub';

const timers = new Map<Channel, ReturnType<typeof setInterval>>();

async function refreshMonitor(): Promise<void> {
  const config = getConfig();
  if (!config) return;
  const sites = collectMonitorSites(config);
  if (sites.length === 0) {
    hub.publish('monitor', { sites: [], summary: { up: 0, warn: 0, down: 0 } });
    return;
  }
  const data = await checkSites(sites);
  hub.publish('monitor', data);
}

async function refreshDocker(): Promise<void> {
  const config = getConfig();
  const show = config ? getDockerShow(config) : 'running';
  const data = await listContainers(show);
  hub.publish('docker', data);
}

async function refreshDownloads(client: 'qbittorrent' | 'transmission'): Promise<void> {
  const channel = `downloads:${client}` as Channel;
  const data =
    client === 'qbittorrent' ? await getQBittorrentTorrents() : await getTransmissionTorrents();
  hub.publish(channel, data);
}

async function refreshAdGuard(): Promise<void> {
  const data = await getAdGuardStats();
  hub.publish('adguard', data);
}

async function refreshJellyfin(): Promise<void> {
  const data = await getJellyfinSessions();
  hub.publish('jellyfin', data);
}

async function refreshBeszel(): Promise<void> {
  const data = await getBeszelSystems();
  hub.publish('beszel', data);
}

async function refreshRadarr(): Promise<void> {
  const data = await getArrSummary('radarr');
  hub.publish('radarr', data);
}

async function refreshSonarr(): Promise<void> {
  const data = await getArrSummary('sonarr');
  hub.publish('sonarr', data);
}

async function refreshReelward(): Promise<void> {
  const data = await getReelwardSummary();
  hub.publish('reelward', data);
}

async function refreshWeather(): Promise<void> {
  const config = getConfig();
  if (!config) return;
  const locations = collectWeatherLocations(config);
  if (locations.length === 0) {
    hub.publish('weather', { locations: {} });
    return;
  }
  const entries = await Promise.all(
    locations.map(async (loc) => [loc.key, await getOpenWeather(loc)] as const),
  );
  hub.publish('weather', { locations: Object.fromEntries(entries) });
}

async function refreshCalendar(): Promise<void> {
  const data = await getCalendarEvents();
  hub.publish('calendar', data);
}

async function refreshSpeedtest(): Promise<void> {
  const config = getConfig();
  let max = 10;
  if (config) {
    outer: for (const page of config.pages) {
      for (const col of page.columns) {
        for (const widget of col.widgets) {
          if (widget.type === 'speedtest') {
            max = widget.max ?? 10;
            break outer;
          }
        }
      }
    }
  }
  const data = await getSpeedtestSummary(max);
  hub.publish('speedtest', data);
}

const refreshers: Record<Channel, () => Promise<void>> = {
  monitor: refreshMonitor,
  docker: refreshDocker,
  'downloads:qbittorrent': () => refreshDownloads('qbittorrent'),
  'downloads:transmission': () => refreshDownloads('transmission'),
  adguard: refreshAdGuard,
  jellyfin: refreshJellyfin,
  beszel: refreshBeszel,
  radarr: refreshRadarr,
  sonarr: refreshSonarr,
  reelward: refreshReelward,
  weather: refreshWeather,
  calendar: refreshCalendar,
  speedtest: refreshSpeedtest,
};

function clearTimers(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}

function scheduleChannel(channel: Channel, seconds: number): void {
  const existing = timers.get(channel);
  if (existing) clearInterval(existing);

  const run = () =>
    void refreshers[channel]().catch((err) =>
      console.error(`[scheduler] ${channel} refresh failed:`, err),
    );
  run();
  timers.set(channel, setInterval(run, seconds * 1000));
}

export function startScheduler(): void {
  clearTimers();
  const config = getConfig();
  if (!config) return;

  const rs = config.refreshSeconds;
  if (collectMonitorSites(config).length > 0) scheduleChannel('monitor', rs.monitor);
  if (hasWidgetType(config, 'docker')) scheduleChannel('docker', rs.docker);
  for (const client of collectDownloadClients(config)) {
    scheduleChannel(`downloads:${client}`, rs.downloads);
  }
  if (hasWidgetType(config, 'adguard')) scheduleChannel('adguard', rs.adguard);
  if (hasWidgetType(config, 'jellyfin')) scheduleChannel('jellyfin', rs.jellyfin);
  if (hasWidgetType(config, 'beszel')) scheduleChannel('beszel', rs.beszel);
  if (hasWidgetType(config, 'radarr')) scheduleChannel('radarr', rs.radarr);
  if (hasWidgetType(config, 'sonarr')) scheduleChannel('sonarr', rs.sonarr);
  if (hasWidgetType(config, 'reelward')) scheduleChannel('reelward', rs.reelward);
  if (hasWidgetType(config, 'weather')) scheduleChannel('weather', rs.weather);
  if (hasWidgetType(config, 'calendar')) scheduleChannel('calendar', rs.calendar);
  if (hasWidgetType(config, 'speedtest')) scheduleChannel('speedtest', rs.speedtest);
}

export async function refreshChannel(channel: Channel): Promise<void> {
  // Never throw into POST action handlers: the action already succeeded, so a
  // failed post-action refresh should be logged, not surfaced as a 500.
  try {
    await refreshers[channel]();
  } catch (err) {
    console.error(`[scheduler] ${channel} refresh failed:`, err);
  }
}

export function initScheduler(): void {
  startScheduler();
  onConfigChange(() => startScheduler());
}
