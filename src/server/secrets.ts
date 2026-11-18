import type { Database } from 'bun:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { INTEGRATIONS, type IntegrationType } from './integrations/registry';

// Integration secrets (API keys, tokens, passwords) are encrypted at rest with
// AES-256-GCM before they land in the `integrations.config` column. Encoded
// values look like `enc:v1:<iv>:<tag>:<ciphertext>` (base64url parts). The
// versioned prefix doubles as the "already encrypted" marker: no legitimate
// plaintext secret starts with it, so encryption stays idempotent, and values
// written before this scheme decrypt to themselves (mixed states are safe).

const ENC_PREFIX = 'enc:v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;

// Mirrors DB_PATH resolution in ./db — this module must not import db.ts
// (db.ts imports this one), so the key file path is derived the same way and the
// master key lands beside the database, in the same config volume.
const DB_PATH = process.env.LABBY_DB_PATH ?? path.join(process.cwd(), 'config', 'labby.db');
const KEY_PATH = path.join(path.dirname(DB_PATH), 'master.key');

// --- Pure crypto core ---

export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString('base64url')}:${cipher
    .getAuthTag()
    .toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptWithKey(key: Buffer, value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const parts = value.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) return value;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or damaged value: hand back the stored string untouched — never
    // throw, never log the value.
    return value;
  }
}

// --- Master key resolution ---

function decodeKeyMaterial(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (trimmed.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  // The base64 decoder also accepts the URL-safe alphabet; only an exact
  // 32-byte result is a usable AES-256 key.
  const decoded = Buffer.from(trimmed, 'base64');
  return decoded.length === KEY_BYTES ? decoded : null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function resolveMasterKey(): Buffer | null {
  const envKey = process.env.LABBY_MASTER_KEY?.trim();
  if (envKey) {
    const key = decodeKeyMaterial(envKey);
    if (!key) {
      fail(
        'LABBY_MASTER_KEY is set but does not encode a 32-byte key (expected 64 hex characters, ' +
          'or base64 of 32 bytes). Refusing to start with an unusable key — fix the value, or unset ' +
          'it to fall back to the key file beside the database.',
      );
    }
    return key;
  }

  if (existsSync(KEY_PATH)) {
    let raw = '';
    try {
      raw = readFileSync(KEY_PATH, 'utf8');
    } catch (e) {
      fail(
        `Could not read the master key file ${KEY_PATH} (${e instanceof Error ? e.message : String(e)}). ` +
          'Restore it from your backup — refusing to generate a new key, which would make existing ' +
          'encrypted secrets unreadable.',
      );
    }
    const key = decodeKeyMaterial(raw);
    if (!key) {
      fail(
        `${KEY_PATH} does not contain a valid 32-byte master key (expected 64 hex characters, or ` +
          'base64 of 32 bytes). Restore the original file from your backup — a newly generated key ' +
          'would make existing encrypted secrets unreadable.',
      );
    }
    return key;
  }

  try {
    const key = randomBytes(KEY_BYTES);
    writeFileSync(KEY_PATH, `${key.toString('hex')}\n`, { mode: 0o600 });
    console.log(
      `Generated ${KEY_PATH} (mode 600) to encrypt integration secrets at rest — back it up with ` +
        'your config volume. Losing it means re-entering your credentials.',
    );
    return key;
  } catch (e) {
    // Fail-soft like the rest of the repo: the dashboard keeps working and
    // secrets stay plaintext, exactly as before this change. With a read-only
    // config directory the database itself is read-only anyway.
    console.error(
      `Could not create ${KEY_PATH} (${e instanceof Error ? e.message : String(e)}). Integration ` +
        'secrets will stay stored in plain text — nothing is lost, but the database file remains the ' +
        'only protection for them.',
    );
    return null;
  }
}

let masterKey: Buffer | null | undefined;

// Resolved on first use, then memoized — db.ts opens and migrates the database
// at module load, and callers (tests included) need to be able to set
// LABBY_MASTER_KEY after their imports but before the first secret is touched.
function getMasterKey(): Buffer | null {
  if (masterKey === undefined) masterKey = resolveMasterKey();
  return masterKey;
}

/** @internal Test hook: forget the memoized key so the next use re-resolves it. */
export function resetMasterKeyForTests(): void {
  masterKey = undefined;
}

// --- Config-level helpers ---

export function encryptConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const def = INTEGRATIONS[type as IntegrationType];
  if (!def) return config;
  let out: Record<string, unknown> | null = null;
  for (const field of def.fields) {
    if (!field.secret) continue;
    const value = config[field.key];
    if (typeof value !== 'string' || value.startsWith(ENC_PREFIX)) continue;
    const key = getMasterKey();
    if (!key) continue; // no usable master key — the value stays plaintext
    if (out === null) out = { ...config };
    out[field.key] = encryptWithKey(key, value);
  }
  return out ?? config;
}

export function decryptConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const def = INTEGRATIONS[type as IntegrationType];
  if (!def) return config;
  let out: Record<string, unknown> | null = null;
  for (const field of def.fields) {
    if (!field.secret) continue;
    const value = config[field.key];
    if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) continue;
    const key = getMasterKey();
    if (!key) continue; // no usable master key — the stored value stays as-is
    const plaintext = decryptWithKey(key, value);
    if (plaintext === value) continue;
    if (out === null) out = { ...config };
    out[field.key] = plaintext;
  }
  return out ?? config;
}

// --- Migration step ---
//
// Applied by db.ts as migration v6: rewrites every stored integration secret
// that is still plaintext, so an existing install is encrypted automatically on
// the first startup after updating. Safe to call repeatedly — already encrypted
// values are left byte-identical. Returns the number of secret values encrypted.

export function encryptExistingIntegrationSecrets(db: Database): number {
  const rows = db.query('SELECT id, type, config FROM integrations').all() as Array<{
    id: number;
    type: string;
    config: string;
  }>;
  const update = db.query('UPDATE integrations SET config = $config WHERE id = $id');
  let encrypted = 0;
  for (const row of rows) {
    let config: unknown;
    try {
      config = JSON.parse(row.config);
    } catch {
      console.warn(
        `Integration row ${row.id}: stored config is not valid JSON — leaving it untouched`,
      );
      continue;
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) continue;
    const stored = config as Record<string, unknown>;
    const out = encryptConfig(row.type, stored);
    if (out === stored) continue; // nothing to encrypt
    for (const field of INTEGRATIONS[row.type as IntegrationType]?.fields ?? []) {
      if (field.secret && out[field.key] !== stored[field.key]) encrypted++;
    }
    update.run({ $id: row.id, $config: JSON.stringify(out) });
  }
  if (encrypted > 0) {
    console.log(`Encrypted ${encrypted} stored integration secret${encrypted === 1 ? '' : 's'}`);
  }
  return encrypted;
}
