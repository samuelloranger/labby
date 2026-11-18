import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import {
  decryptConfig,
  decryptWithKey,
  encryptConfig,
  encryptWithKey,
  resetMasterKeyForTests,
} from './secrets';

// Fixed master key for this file. Nothing above resolves the key at import time
// (resolution is lazy), so this assignment wins for every call below.
const TEST_KEY_HEX = 'ab'.repeat(32);
process.env.LABBY_MASTER_KEY = TEST_KEY_HEX;

test('encryptWithKey/decryptWithKey round-trip with a versioned, distinguishable encoding', () => {
  const key = randomBytes(32);
  const encoded = encryptWithKey(key, 'hunter2');
  expect(encoded).not.toBe('hunter2');
  expect(encoded.startsWith('enc:v1:')).toBe(true);
  const parts = encoded.slice('enc:v1:'.length).split(':');
  expect(parts).toHaveLength(3);
  for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decryptWithKey(key, encoded)).toBe('hunter2');
});

test('decryptWithKey passes non-prefixed values through unchanged', () => {
  const key = randomBytes(32);
  expect(decryptWithKey(key, 'plaintext')).toBe('plaintext');
  expect(decryptWithKey(key, '')).toBe('');
});

test('decryptWithKey returns malformed encrypted values as stored instead of throwing', () => {
  const key = randomBytes(32);
  expect(decryptWithKey(key, 'enc:v1:truncated')).toBe('enc:v1:truncated');
  expect(decryptWithKey(key, 'enc:v1:aa:bb:cc')).toBe('enc:v1:aa:bb:cc');
});

test('decryptWithKey with the wrong key returns the stored value, never throws', () => {
  const encoded = encryptWithKey(randomBytes(32), 'hunter2');
  expect(decryptWithKey(randomBytes(32), encoded)).toBe(encoded);
});

test('encryptConfig transforms only string values under secret fields', () => {
  const config = { url: 'http://r', apiKey: 'k', max: 5, other: ['a'], nested: { x: 1 } };
  const out = encryptConfig('radarr', config);
  expect(out.url).toBe('http://r');
  expect(out.max).toBe(5);
  expect(out.other).toEqual(['a']);
  expect(out.nested).toEqual({ x: 1 });
  expect(typeof out.apiKey).toBe('string');
  expect(String(out.apiKey).startsWith('enc:v1:')).toBe(true);
  expect(out.apiKey).not.toBe('k');
  expect(decryptConfig('radarr', out)).toEqual(config);
});

test('encryptConfig leaves non-string secret values and missing keys alone', () => {
  const config = { url: 'http://a', pass: 12345 };
  expect(encryptConfig('adguard', config)).toBe(config);
  expect(encryptConfig('radarr', {})).toEqual({});
});

test('unknown integration types pass through unchanged', () => {
  const config = { apiKey: 'k' };
  expect(encryptConfig('not-a-real-type', config)).toBe(config);
  expect(decryptConfig('not-a-real-type', { apiKey: 'enc:v1:x:y:z' })).toEqual({
    apiKey: 'enc:v1:x:y:z',
  });
});

test('encryptConfig is idempotent — no double encryption', () => {
  const once = encryptConfig('radarr', { url: 'http://r', apiKey: 'k' });
  const twice = encryptConfig('radarr', once);
  expect(twice.apiKey).toBe(once.apiKey);
});

test('decryptConfig passes plaintext values through (mixed pre-migration state)', () => {
  expect(decryptConfig('radarr', { url: 'http://r', apiKey: 'still-plain' })).toEqual({
    url: 'http://r',
    apiKey: 'still-plain',
  });
});

test('config helpers honor LABBY_MASTER_KEY set before first use', () => {
  // Another test file sharing this process may have resolved (and memoized) a
  // different key already — forget it so this file's env var is picked up.
  resetMasterKeyForTests();
  const out = encryptConfig('radarr', { apiKey: 'env-key-test' });
  expect(decryptWithKey(Buffer.from(TEST_KEY_HEX, 'hex'), String(out.apiKey))).toBe('env-key-test');
});
