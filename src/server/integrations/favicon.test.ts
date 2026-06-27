import { afterEach, describe, expect, it } from 'bun:test';
import { resolveFavicon } from './favicon';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockHtml(html: string) {
  globalThis.fetch = (async () =>
    new Response(html, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
}

describe('resolveFavicon', () => {
  it('parses <link rel="icon"> and resolves to an absolute URL', async () => {
    mockHtml('<html><head><link rel="icon" href="/assets/fav.png"></head></html>');
    const out = await resolveFavicon('https://example.com/dashboard');
    expect(out.icon).toBe('https://example.com/assets/fav.png');
  });

  it('falls back to /favicon.ico when no link tag is present', async () => {
    mockHtml('<html><head></head></html>');
    const out = await resolveFavicon('https://example.com/x/y');
    expect(out.icon).toBe('https://example.com/favicon.ico');
  });

  it('returns null icon when the URL is invalid', async () => {
    const out = await resolveFavicon('not a url');
    expect(out.icon).toBeNull();
  });

  it('returns fallback icon when the fetch throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    const out = await resolveFavicon('https://example.com');
    expect(out.icon).toBe('https://example.com/favicon.ico');
  });
});
