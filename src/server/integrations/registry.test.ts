import { describe, expect, it } from 'bun:test';
import { INTEGRATIONS, type IntegrationType, integrationTypes } from './registry';

const ALL_TYPES: IntegrationType[] = [
  'monitor',
  'docker',
  'qbittorrent',
  'transmission',
  'adguard',
  'jellyfin',
  'beszel',
  'radarr',
  'sonarr',
  'reelward',
  'reddit',
  'hackernews',
  'weather',
  'calendar',
  'speedtest',
];

const TYPES_WITH_ACTIONS: IntegrationType[] = [
  'docker',
  'qbittorrent',
  'transmission',
  'adguard',
  'speedtest',
];

const TYPES_WITHOUT_ACTIONS: IntegrationType[] = ALL_TYPES.filter(
  (t) => !TYPES_WITH_ACTIONS.includes(t),
);

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

  it('docker has actions: start, stop, restart, logs', () => {
    const actions = INTEGRATIONS.docker.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.start).toBe('function');
    expect(typeof actions!.stop).toBe('function');
    expect(typeof actions!.restart).toBe('function');
    expect(typeof actions!.logs).toBe('function');
  });

  it('qbittorrent has actions: pause, resume', () => {
    const actions = INTEGRATIONS.qbittorrent.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.pause).toBe('function');
    expect(typeof actions!.resume).toBe('function');
  });

  it('transmission has actions: pause, resume', () => {
    const actions = INTEGRATIONS.transmission.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.pause).toBe('function');
    expect(typeof actions!.resume).toBe('function');
  });

  it('adguard has actions: protection', () => {
    const actions = INTEGRATIONS.adguard.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.protection).toBe('function');
  });

  it('speedtest has actions: run', () => {
    const actions = INTEGRATIONS.speedtest.actions;
    expect(typeof actions).toBe('object');
    expect(actions).not.toBeNull();
    expect(typeof actions!.run).toBe('function');
  });

  it('types without actions have no actions property', () => {
    for (const type of TYPES_WITHOUT_ACTIONS) {
      expect(INTEGRATIONS[type].actions).toBeUndefined();
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
