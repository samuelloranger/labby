import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const swPath = join(dirname(fileURLToPath(import.meta.url)), 'sw.js');
const sw = readFileSync(swPath, 'utf8');

describe('sw.js', () => {
  test('is valid JavaScript (no TypeScript annotations)', () => {
    // Browser and node --check both reject `: any` / `as any` in a .js file.
    expect(sw).not.toMatch(/:\s*any\b/);
    expect(sw).not.toMatch(/\bas any\b/);
    // Parse as a script body — throws SyntaxError if invalid.
    new Function(sw);
  });

  test('CACHE_NAME is stamped per build via __BUILD__ placeholder', () => {
    expect(sw).toMatch(/CACHE_NAME\s*=\s*['"]labby-cache-__BUILD__['"]/);
  });

  test('navigations / HTML shell are network-first', () => {
    // Deploy safety: must not serve a stale index.html before trying the network.
    expect(sw).toMatch(/mode\s*===\s*['"]navigate['"]/);
    const navigateIdx = sw.search(/mode\s*===\s*['"]navigate['"]/);
    const navigateBlock = sw.slice(navigateIdx, navigateIdx + 600);
    const fetchIdx = navigateBlock.indexOf('fetch(');
    const cachesMatchIdx = navigateBlock.indexOf('caches.match');
    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(cachesMatchIdx).toBeGreaterThan(fetchIdx);
  });
});
