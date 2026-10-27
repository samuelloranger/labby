import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { _clearC411Cache, getC411Avatar, getC411Profile } from './c411';

const originalFetch = globalThis.fetch;
beforeEach(() => _clearC411Cache());
afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

// Representative shape from C411's published integrations guide.
const profile = {
  username: 'member',
  avatarUrl: '/uploads/avatars/member.webp',
  level: { level: 37, xp: 18420, xpIntoLevel: 310, xpToNextLevel: 239 },
  zen: { balance: 1840 },
  class: null,
  team: null,
  transfer: {
    uploaded: { actual: 5000, credit: 1000, total: 6000 },
    downloaded: { actual: 2500, credit: 500, total: 2000 },
  },
  download: { allowed: true, blockedReason: null },
  freeleech: { active: false, sources: [] },
  email: 'private@example.test',
  apiToken: 'must-not-leak',
};

function respond(body: unknown, status = 200) {
  globalThis.fetch = mock(async () => Response.json(body, { status })) as unknown as typeof fetch;
}

describe('C411 profile', () => {
  test('requires a token without making a request', async () => {
    const fetcher = mock(async () => Response.json(profile));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    expect(await getC411Profile({ apiToken: ' ' })).toEqual({
      error: 'C411 API token not configured',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('authenticates against the API profile endpoint and only publishes allowed fields', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://c411.org/api/user/profile');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.redirect).toBe('error');
      return Response.json(profile);
    }) as unknown as typeof fetch;
    expect(await getC411Profile({ apiToken: ' test-token ' })).toEqual({
      username: 'member',
      avatarUrl: 'https://c411.org/uploads/avatars/member.webp',
      level: 37,
      xpIntoLevel: 310,
      xpToNextLevel: 239,
      updatedAt: expect.any(Number),
      zen: 1840,
      uploaded: 6000,
      downloaded: 2000,
      ratio: 3,
      downloadAllowed: true,
      freeleech: false,
      class: null,
      team: null,
      transfer: profile.transfer,
      blockedReason: null,
      freeleechSources: [],
    });
  });

  test('handles zero downloads without publishing Infinity', async () => {
    respond({
      ...profile,
      transfer: {
        uploaded: { actual: 10, credit: 0, total: 10 },
        downloaded: { actual: 0, credit: 0, total: 0 },
      },
    });
    expect(await getC411Profile({ apiToken: 'key' })).toMatchObject({ ratio: null });
  });

  test('proxies the account avatar with server-side credentials and reuses the profile cache', async () => {
    const fetcher = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer avatar-key');
      expect(init?.redirect).toBe('error');
      if (String(input).endsWith('/api/user/profile')) return Response.json(profile);
      expect(String(input)).toBe('https://c411.org/uploads/avatars/member.webp');
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } });
    });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await getC411Profile({ apiToken: 'avatar-key' });
    const result = await getC411Avatar({ apiToken: 'avatar-key' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    if ('error' in result) throw Error(result.error);
    expect(result.headers.get('Content-Type')).toBe('image/webp');
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  test.each([
    null,
    'https://other.test/uploads/avatars/member.webp',
    '//other.test/uploads/avatars/member.webp',
    'https://c411.org.evil.test/avatars/member.webp',
    'https://user:password@c411.org/avatars/member.webp',
    'http://c411.org/avatars/member.webp',
    '/api/user/profile?token=private',
    '/uploads/avatars/../../api/user/profile',
  ])('rejects missing or unsafe avatar URL %s without requesting it', async (avatarUrl) => {
    const fetcher = mock(async () => Response.json({ ...profile, avatarUrl }));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    expect(await getC411Avatar({ apiToken: 'avatar-key' })).toEqual({
      error: 'C411 avatar unavailable',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('removes query parameters and rejects HTML returned instead of an avatar', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/user/profile')) {
        return Response.json({
          ...profile,
          avatarUrl: '/avatars/member.webp?token=private#tracking',
        });
      }
      expect(String(input)).toBe('https://c411.org/avatars/member.webp');
      return new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } });
    }) as unknown as typeof fetch;
    expect(await getC411Avatar({ apiToken: 'avatar-key' })).toEqual({
      error: 'C411 avatar is not a supported image',
    });
  });

  test('preserves class, grade, basis points, retained stars and inactive paths', async () => {
    const inactive = { star: false, questsCompleted: 0, questsTotal: 0 };
    const selectedClass = {
      slug: 'tanker',
      effectiveSlug: 'tanker',
      foundation: 'seed',
      treeBonusBp: 250,
      progress: {
        questsCompleted: 10,
        questsTotal: 32,
        stars: 1,
        grade: { tier: 'bronze', level: 4 },
      },
      voies: {
        seed: { star: true, questsCompleted: 7, questsTotal: 20 },
        upload: { star: false, questsCompleted: 3, questsTotal: 6 },
        specialization: inactive,
        competitivity: { star: false, questsCompleted: 0, questsTotal: 6 },
      },
    };
    const team = { name: 'Seed team', slug: 'seed-team', tag: 'SEED', role: 'member' };
    respond({
      ...profile,
      class: { ...selectedClass, passkey: 'private-class-key' },
      team: { ...team, token: 'private-team-token' },
    });
    const result = await getC411Profile({ apiToken: 'key' });
    expect(result).toMatchObject({ class: selectedClass, team });
    if ('error' in result) throw new Error(result.error);
    expect(result.class?.voies.seed.star).toBe(true);
    expect(result.class?.voies.specialization).toEqual(inactive);
    expect(result.class?.treeBonusBp).toBe(250); // UI converts basis points / 100 to 2.50%.
    expect(result.class).not.toHaveProperty('passkey');
    expect(result.team).not.toHaveProperty('token');
  });

  test('keeps measured bytes, credits and zero charged downloads separate', async () => {
    const transfer = {
      uploaded: { actual: 5000, credit: 1000, total: 6000 },
      downloaded: { actual: 2500, credit: 3000, total: 0 },
    };
    respond({ ...profile, transfer });
    expect(await getC411Profile({ apiToken: 'key' })).toMatchObject({
      transfer,
      uploaded: 6000,
      downloaded: 0,
      ratio: null,
      class: null,
      team: null,
    });
  });

  test('preserves blocked download reason and every Freeleech source', async () => {
    respond({
      ...profile,
      download: { allowed: false, blockedReason: 'insufficient_balance' },
      freeleech: { active: true, sources: ['personal', 'campaign', 'window'] },
    });
    expect(await getC411Profile({ apiToken: 'key' })).toMatchObject({
      downloadAllowed: false,
      blockedReason: 'insufficient_balance',
      freeleech: true,
      freeleechSources: ['personal', 'campaign', 'window'],
    });
  });

  test.each([
    [401, 'C411 API token is invalid or expired'],
    [403, 'C411 access denied. Create a token with profile:read scope'],
    [429, 'C411 rate limit reached. Try again in a minute'],
    [502, 'C411 error: 502'],
  ])('handles HTTP %s without echoing upstream secrets', async (status, error) => {
    respond({ token: 'secret' }, status);
    expect(await getC411Profile({ apiToken: 'key' })).toEqual({ error });
  });

  test.each([null, {}, { authenticated: false, user: null }, { ...profile, username: null }])(
    'rejects malformed profile %j',
    async (body) => {
      respond(body);
      expect(await getC411Profile({ apiToken: 'key' })).toEqual({
        error: 'C411 returned an invalid profile response',
      });
    },
  );

  test('fails softly for HTML, network errors and timeouts without leaking credentials', async () => {
    globalThis.fetch = mock(
      async () => new Response('<html>Login</html>'),
    ) as unknown as typeof fetch;
    expect(await getC411Profile({ apiToken: 'key' })).toHaveProperty('error');
    _clearC411Cache();
    globalThis.fetch = mock(async () => {
      throw new Error('secret-token');
    }) as unknown as typeof fetch;
    const result = await getC411Profile({ apiToken: 'key' });
    expect(result).toHaveProperty('error');
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  test('shares concurrent requests and reuses the result for at least 30 seconds', async () => {
    let now = 100_000;
    spyOn(Date, 'now').mockImplementation(() => now);
    const fetcher = mock(async () => Response.json(profile));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const results = await Promise.all([
      getC411Profile({ apiToken: 'shared' }),
      getC411Profile({ apiToken: ' shared ' }),
      getC411Profile({ apiToken: 'shared' }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 29_999;
    expect(await getC411Profile({ apiToken: 'shared' })).toEqual(results[0]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1;
    await getC411Profile({ apiToken: 'shared' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('different keys have independent caches and failure states', async () => {
    const fetcher = mock(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer invalid'
        ? Response.json({}, { status: 401 })
        : Response.json(profile),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    expect(await getC411Profile({ apiToken: 'invalid' })).toHaveProperty('error');
    expect(await getC411Profile({ apiToken: 'valid' })).toHaveProperty('username', 'member');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await getC411Profile({ apiToken: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test.each([
    [null, 60_000],
    ['10', 60_000],
    ['120', 120_000],
    ['Thu, 01 Jan 1970 00:03:40 GMT', 120_000],
    ['invalid', 60_000],
  ])('backs off on 429 with Retry-After %s', async (retryAfter, delay) => {
    let now = 100_000;
    spyOn(Date, 'now').mockImplementation(() => now);
    let limited = true;
    const fetcher = mock(async () =>
      limited
        ? Response.json(
            {},
            { status: 429, headers: retryAfter ? { 'Retry-After': retryAfter } : {} },
          )
        : Response.json(profile),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const first = await getC411Profile({ apiToken: 'limited' });
    expect(first).toHaveProperty('error');
    limited = false;
    now += delay - 1;
    expect(await getC411Profile({ apiToken: 'limited' })).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1;
    expect(await getC411Profile({ apiToken: 'limited' })).toHaveProperty('username', 'member');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
