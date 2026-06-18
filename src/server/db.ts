import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH = process.env.LABBY_DB_PATH ?? path.join(process.cwd(), 'config', 'labby.db');

export const db = new Database(DB_PATH, { create: true });

const DEFAULT_DASHBOARD = JSON.stringify({
  title: 'Labby',
  theme: { default: 'system' },
  pages: [
    {
      name: 'Overview',
      columns: [
        {
          size: 'small',
          widgets: [
            {
              type: 'monitor',
              title: 'Core',
              integrationId: 1,
              style: 'compact',
            },
          ],
        },
        {
          size: 'full',
          widgets: [
            { type: 'docker', title: 'Containers', integrationId: 2 },
            {
              type: 'monitor',
              title: 'Launcher',
              integrationId: 3,
              variant: 'tiles',
            },
          ],
        },
      ],
    },
  ],
});

// --- Migrations System ---
const migrations = [
  {
    version: 1,
    name: 'initial_settings_table',
    up: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
  {
    version: 2,
    name: 'seed_dashboard',
    up: `
      INSERT INTO settings (key, value)
      VALUES ('dashboard', json('${DEFAULT_DASHBOARD}'))
      ON CONFLICT(key) DO NOTHING;
    `,
  },
  {
    version: 3,
    name: 'integrations_table',
    up: `
      CREATE TABLE IF NOT EXISTS integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        refresh_seconds INTEGER
      );
    `,
  },
];

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = db.query('SELECT version FROM _migrations').all() as { version: number }[];
  const appliedMigrations = new Set(appliedRows.map((m) => m.version));

  const transaction = db.transaction(() => {
    for (const migration of migrations) {
      if (!appliedMigrations.has(migration.version)) {
        console.log(`Running migration: ${migration.version}_${migration.name}`);
        db.exec(migration.up);
        db.query('INSERT INTO _migrations (version, name) VALUES ($version, $name)').run({
          $version: migration.version,
          $name: migration.name,
        });
      }
    }
  });

  transaction();
}

// Run migrations immediately on module load to ensure schema is ready
runMigrations();
// --- End Migrations System ---

export function getSetting(key: string): string | null {
  const query = db.query('SELECT value FROM settings WHERE key = $key');
  const row = query.get({ $key: key }) as { value: string } | null;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  const query = db.query(
    'INSERT INTO settings (key, value) VALUES ($key, $val) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  );
  query.run({ $key: key, $val: value });
}

export function deleteSetting(key: string) {
  db.query('DELETE FROM settings WHERE key = $key').run({ $key: key });
}

export function getAllSettings(): Record<string, string> {
  const query = db.query('SELECT key, value FROM settings');
  const rows = query.all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// --- Integrations CRUD ---

export type IntegrationRow = {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  refreshSeconds: number | null;
};

type Raw = { id: number; name: string; type: string; config: string; enabled: number; refresh_seconds: number | null };
const toRow = (r: Raw): IntegrationRow => ({
  id: r.id, name: r.name, type: r.type,
  config: JSON.parse(r.config), enabled: !!r.enabled, refreshSeconds: r.refresh_seconds,
});

export function listIntegrations(): IntegrationRow[] {
  return (db.query('SELECT * FROM integrations ORDER BY id').all() as Raw[]).map(toRow);
}

export function getIntegration(id: number): IntegrationRow | null {
  const r = db.query('SELECT * FROM integrations WHERE id = $id').get({ $id: id }) as Raw | null;
  return r ? toRow(r) : null;
}

export function createIntegration(input: Omit<IntegrationRow, 'id'>): IntegrationRow {
  const info = db.query(
    'INSERT INTO integrations (name, type, config, enabled, refresh_seconds) VALUES ($name,$type,$config,$enabled,$rs)',
  ).run({ $name: input.name, $type: input.type, $config: JSON.stringify(input.config), $enabled: input.enabled ? 1 : 0, $rs: input.refreshSeconds });
  return getIntegration(Number(info.lastInsertRowid)) as IntegrationRow;
}

export function updateIntegration(id: number, input: Omit<IntegrationRow, 'id'>): IntegrationRow | null {
  db.query('UPDATE integrations SET name=$name, type=$type, config=$config, enabled=$enabled, refresh_seconds=$rs WHERE id=$id')
    .run({ $id: id, $name: input.name, $type: input.type, $config: JSON.stringify(input.config), $enabled: input.enabled ? 1 : 0, $rs: input.refreshSeconds });
  return getIntegration(id);
}

export function deleteIntegration(id: number): void {
  db.query('DELETE FROM integrations WHERE id = $id').run({ $id: id });
}
