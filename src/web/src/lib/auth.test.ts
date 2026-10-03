import { expect, mock, test } from 'bun:test';
import { readAuthScreen, reloadOnUnauthorized } from './auth';

function fakeWindow(status: number) {
  const reload = mock(() => {});
  const win = {
    fetch: mock(async () => new Response(null, { status })) as unknown as typeof fetch,
    location: { origin: 'https://labby.example.com', reload },
  };
  reloadOnUnauthorized(win);
  return { win, reload };
}

test('401 from an /api request reloads into the login redirect', async () => {
  const { win, reload } = fakeWindow(401);
  const res = await win.fetch('/api/integrations');
  expect(res.status).toBe(401);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('401 from a non-api URL or a non-401 api response does not reload', async () => {
  const other = fakeWindow(401);
  await other.win.fetch('https://upstream.example.net/api/x');
  await other.win.fetch(new URL('https://labby.example.com/icons/a.svg'));
  expect(other.reload).not.toHaveBeenCalled();

  const ok = fakeWindow(403);
  await ok.win.fetch(new Request('https://labby.example.com/api/x'));
  expect(ok.reload).not.toHaveBeenCalled();
});

const docWith = (text: string | null) => ({
  getElementById: (id: string) =>
    id === 'labby-auth-screen' && text !== null
      ? ({ textContent: text } as unknown as HTMLElement)
      : null,
});

test('readAuthScreen parses the shell marker', () => {
  expect(readAuthScreen(docWith('{"kind":"forbidden","user":"eve@example.com"}'))).toEqual({
    kind: 'forbidden',
    user: 'eve@example.com',
  });
  expect(readAuthScreen(docWith('{"kind":"signed-out"}'))).toEqual({ kind: 'signed-out' });
  expect(readAuthScreen(docWith('{"kind":"sign-in-failed"}'))).toEqual({ kind: 'sign-in-failed' });
});

test('readAuthScreen returns null for a normal dashboard page or a bad marker', () => {
  expect(readAuthScreen(docWith(null))).toBeNull();
  expect(readAuthScreen(docWith('not json'))).toBeNull();
  expect(readAuthScreen(docWith('{"kind":"something-else"}'))).toBeNull();
});
