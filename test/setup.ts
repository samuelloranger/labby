// Preloaded before any test (see bunfig.toml). Points the SQLite singleton at a
// throwaway temp DB so tests never touch the real config/labby.db. Must run before
// src/server/db.ts is imported — db.ts reads LABBY_DB_PATH and opens the connection
// at module load.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ponytail: no teardown — OS clears tmpdir; each run gets a fresh unique dir.
process.env.LABBY_DB_PATH = join(mkdtempSync(join(tmpdir(), 'labby-test-')), 'test.db');
