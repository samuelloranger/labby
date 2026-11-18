import { expect, test } from 'bun:test';
import {
  createIntegration,
  db,
  deleteIntegration,
  getIntegration,
  listIntegrations,
  reorderIntegrations,
  replaceAllIntegrations,
  runMigrations,
  updateIntegration,
} from './db';
import { encryptExistingIntegrationSecrets } from './secrets';

// Fixed master key for this file. The db import above already ran every
// migration against a fresh seeded DB — the seeds carry no secret values, so
// the master key is still unresolved here and picks up this env var on first
// use (resolution in secrets.ts is lazy).
process.env.LABBY_MASTER_KEY = 'cd'.repeat(32);

function rawConfig(id: number): string {
  const row = db.query('SELECT config FROM integrations WHERE id = $id').get({ $id: id }) as {
    config: string;
  } | null;
  return row?.config ?? '';
}

// Seeds a row the way a pre-upgrade install wrote it: plaintext config, straight
// SQL, bypassing the encryption that now happens in createIntegration.
function insertLegacyRow(name: string, type: string, config: Record<string, unknown>): number {
  const info = db
    .query(
      'INSERT INTO integrations (name, type, config, enabled, refresh_seconds) VALUES ($name,$type,$config,1,NULL)',
    )
    .run({ $name: name, $type: type, $config: JSON.stringify(config) });
  return Number(info.lastInsertRowid);
}

test('integration CRUD round-trips config as JSON', () => {
  const testNames = ['Radarr 4K', 'Radarr HD'];
  for (const leftover of listIntegrations().filter((r) => testNames.includes(r.name))) {
    deleteIntegration(leftover.id);
  }

  const row = createIntegration({
    name: 'Radarr 4K',
    type: 'radarr',
    config: { url: 'http://r', apiKey: 'k' },
    enabled: true,
    refreshSeconds: 60,
  });
  try {
    expect(row.id).toBeGreaterThan(0);
    expect(getIntegration(row.id)?.config).toEqual({ url: 'http://r', apiKey: 'k' });
    const upd = updateIntegration(row.id, { ...row, name: 'Radarr HD' });
    expect(upd?.name).toBe('Radarr HD');
    expect(listIntegrations().some((r) => r.id === row.id)).toBe(true);
  } finally {
    deleteIntegration(row.id);
  }
  expect(getIntegration(row.id)).toBeNull();
});

test('position is assigned on create and returned in order', () => {
  const tag = '__pos_test__';
  for (const r of listIntegrations().filter((r) => r.name.startsWith(tag))) deleteIntegration(r.id);
  const a = createIntegration({
    name: `${tag}a`,
    type: 'radarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });
  const b = createIntegration({
    name: `${tag}b`,
    type: 'sonarr',
    config: {},
    enabled: true,
    refreshSeconds: null,
  });
  try {
    expect(typeof a.position).toBe('number');
    expect(b.position).toBeGreaterThan(a.position);
    reorderIntegrations([b.id, a.id]);
    const ordered = listIntegrations().filter((r) => r.name.startsWith(tag));
    expect(ordered[0].id).toBe(b.id);
    expect(ordered[1].id).toBe(a.id);
  } finally {
    deleteIntegration(a.id);
    deleteIntegration(b.id);
  }
});

test('createIntegration stores secrets encrypted; reads return them decrypted', () => {
  const row = createIntegration({
    name: '__enc_test__ create',
    type: 'radarr',
    config: { url: 'http://radarr', apiKey: 'create-secret' },
    enabled: true,
    refreshSeconds: 60,
  });
  try {
    expect(getIntegration(row.id)?.config).toEqual({
      url: 'http://radarr',
      apiKey: 'create-secret',
    });
    const raw = rawConfig(row.id);
    expect(raw).toContain('enc:v1:');
    expect(raw).toContain('http://radarr'); // non-secret fields stay readable
    expect(raw).not.toContain('create-secret'); // the secret never lands in the row
  } finally {
    deleteIntegration(row.id);
  }
});

test('updateIntegration re-encrypts a new secret value', () => {
  const row = createIntegration({
    name: '__enc_test__ update',
    type: 'radarr',
    config: { url: 'http://u', apiKey: 'first-secret' },
    enabled: true,
    refreshSeconds: null,
  });
  try {
    const updated = updateIntegration(row.id, {
      name: '__enc_test__ update',
      type: 'radarr',
      config: { url: 'http://u', apiKey: 'second-secret' },
      enabled: true,
      refreshSeconds: null,
    });
    expect(updated?.config.apiKey).toBe('second-secret');
    const raw = rawConfig(row.id);
    expect(raw).toContain('enc:v1:');
    expect(raw).not.toContain('first-secret');
    expect(raw).not.toContain('second-secret');
  } finally {
    deleteIntegration(row.id);
  }
});

test('replaceAllIntegrations encrypts secrets on the backup-restore path', () => {
  const original = listIntegrations();
  try {
    replaceAllIntegrations([
      {
        id: 9101,
        name: '__enc_test__ restore',
        type: 'radarr',
        config: { url: 'http://r', apiKey: 'restore-secret' },
        enabled: true,
        refreshSeconds: 60,
      },
    ]);
    expect(rawConfig(9101)).toContain('enc:v1:');
    expect(rawConfig(9101)).not.toContain('restore-secret');
    expect(getIntegration(9101)?.config.apiKey).toBe('restore-secret');
  } finally {
    replaceAllIntegrations(original);
  }
});

test('encryptExistingIntegrationSecrets encrypts pre-upgrade rows and is idempotent', () => {
  const id = insertLegacyRow('__enc_test__ legacy', 'radarr', {
    url: 'http://legacy',
    apiKey: 'legacy-secret',
  });
  try {
    expect(rawConfig(id)).not.toContain('enc:v1:'); // sanity: seeded plaintext
    expect(encryptExistingIntegrationSecrets(db)).toBe(1);

    const raw = rawConfig(id);
    expect(raw).toContain('enc:v1:');
    expect(raw).not.toContain('legacy-secret');
    expect(getIntegration(id)?.config.apiKey).toBe('legacy-secret');

    // A second pass changes nothing.
    const encrypted = rawConfig(id);
    expect(encryptExistingIntegrationSecrets(db)).toBe(0);
    expect(rawConfig(id)).toBe(encrypted);
    expect(getIntegration(id)?.config.apiKey).toBe('legacy-secret');
  } finally {
    deleteIntegration(id);
  }
});

test('migration v6 encrypts existing plaintext rows on the first startup after updating', () => {
  const id = insertLegacyRow('__enc_test__ startup', 'qbittorrent', {
    url: 'http://qbit',
    user: 'sam',
    pass: 'legacy-pass',
  });
  try {
    // Simulate the pre-update database state: migrations through v5 applied, v6 not.
    db.query('DELETE FROM _migrations WHERE version = 6').run();
    runMigrations();

    const raw = rawConfig(id);
    expect(raw).toContain('enc:v1:');
    expect(raw).toContain('http://qbit'); // non-secret fields stay readable
    expect(raw).not.toContain('legacy-pass');
    expect(getIntegration(id)?.config.pass).toBe('legacy-pass');

    const applied = db.query('SELECT version FROM _migrations WHERE version = 6').get() as {
      version: number;
    } | null;
    expect(applied?.version).toBe(6);
  } finally {
    deleteIntegration(id);
  }
});

test('encryptExistingIntegrationSecrets leaves rows with invalid JSON untouched', () => {
  // A single corrupt legacy row must never abort the migration for every other row.
  const info = db
    .query(
      'INSERT INTO integrations (name, type, config, enabled, refresh_seconds) VALUES ($name,$type,$config,1,NULL)',
    )
    .run({ $name: '__enc_test__ corrupt', $type: 'radarr', $config: 'not json {{{' });
  const id = Number(info.lastInsertRowid);
  try {
    expect(rawConfig(id)).toBe('not json {{{');
    expect(encryptExistingIntegrationSecrets(db)).toBe(0);
    expect(rawConfig(id)).toBe('not json {{{'); // skipped, not rewritten or crashed on
  } finally {
    deleteIntegration(id);
  }
});
