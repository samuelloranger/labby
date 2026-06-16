import type { Site } from '../config/schema';
import type { MonitorPayload, MonitorSiteResult } from '../types';

const DEFAULT_OK_CODES = [200, 301, 302, 401, 403];

export async function checkSites(sites: Site[]): Promise<MonitorPayload> {
  const results = await Promise.all(sites.map(checkSite));
  const summary = { up: 0, warn: 0, down: 0 };
  for (const r of results) {
    if (r.status === 'up') summary.up++;
    else if (r.status === 'warn') summary.warn++;
    else summary.down++;
  }
  return { sites: results, summary };
}

async function checkSite(site: Site): Promise<MonitorSiteResult> {
  const okCodes = site.okCodes ?? DEFAULT_OK_CODES;
  const start = performance.now();

  try {
    const res = await fetch(site.checkUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Math.round(performance.now() - start);
    const status = okCodes.includes(res.status) ? 'up' : res.status >= 500 ? 'down' : 'warn';
    return {
      title: site.title,
      checkUrl: site.checkUrl,
      url: site.url,
      icon: site.icon,
      status,
      latencyMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    // A timeout means the host is reachable but unresponsive (degraded → warn);
    // a refused/DNS/TLS failure means it is genuinely unreachable (down).
    const isTimeout =
      (err instanceof Error && err.name === 'TimeoutError') ||
      message.includes('timed out') ||
      message.includes('timeout');
    return {
      title: site.title,
      checkUrl: site.checkUrl,
      url: site.url,
      icon: site.icon,
      status: isTimeout ? 'warn' : 'down',
      latencyMs: null,
    };
  }
}
