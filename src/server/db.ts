import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH = process.env.LABBY_DB_PATH ?? path.join(process.cwd(), 'config', 'labby.db');

export const db = new Database(DB_PATH, { create: true });

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
