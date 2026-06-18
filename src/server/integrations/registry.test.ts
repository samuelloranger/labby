import { describe, it, expect } from 'bun:test';
import { INTEGRATIONS, integrationTypes, type IntegrationType } from './registry';

const ALL_TYPES: IntegrationType[] = [
  'monitor', 'docker', 'qbittorrent', 'transmission', 'adguard',
  'jellyfin', 'beszel', 'radarr', 'sonarr', 'reelward',
  'reddit', 'hackernews', 'weather', 'calendar', 'speedtest',
];

describe('INTEGRATIONS registry', () => {
  it('has exactly 15 entries', () => {
    expect(Object.keys(INTEGRATIONS).length).toBe(15);
  });

  it('every type has a truthy label', () => {
    for (const type of ALL_TYPES) {
      expect(INTEGRATIONS[type].label).toBeTruthy();
    }
  });

  it('every type has a fetch function', () => {
    for (const type of ALL_TYPES) {
      expect(typeof INTEGRATIONS[type].fetch).toBe('function');
    }
  });

  it('fetch stubs return an error shape', async () => {
    for (const type of ALL_TYPES) {
      const result = await INTEGRATIONS[type].fetch({});
      expect((result as any).error).toBeTruthy();
    }
  });

  it('every type has a defaultRefreshSeconds > 0', () => {
    for (const type of ALL_TYPES) {
      expect(INTEGRATIONS[type].defaultRefreshSeconds).toBeGreaterThan(0);
    }
  });

  it('every type has a fields array', () => {
    for (const type of ALL_TYPES) {
      expect(Array.isArray(INTEGRATIONS[type].fields)).toBe(true);
    }
  });
});

describe('integrationTypes()', () => {
  it('returns an array of 15 entries', () => {
    expect(integrationTypes().length).toBe(15);
  });

  it('omits fetch and actions from entries', () => {
    for (const entry of integrationTypes()) {
      expect((entry as any).fetch).toBeUndefined();
      expect((entry as any).actions).toBeUndefined();
    }
  });

  it('includes type, label, defaultRefreshSeconds, fields', () => {
    for (const entry of integrationTypes()) {
      expect(entry.type).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.defaultRefreshSeconds).toBeGreaterThan(0);
      expect(Array.isArray(entry.fields)).toBe(true);
    }
  });
});
