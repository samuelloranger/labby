export type AuthUser = { name: string; email: string };

type AuthWindow = {
  fetch: typeof fetch;
  location: { origin: string; reload: () => void };
};

function isLabbyApi(input: RequestInfo | URL, origin: string): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, origin);
  return url.origin === origin && url.pathname.startsWith('/api/');
}

/**
 * With OIDC login on, an expired session turns every API call into a 401.
 * Reloading hits the gated page route, which redirects to the provider and
 * back. With login off Labby never answers 401, so this never fires.
 */
export function reloadOnUnauthorized(win: AuthWindow = window): void {
  const original = win.fetch.bind(win);
  win.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    if (res.status === 401 && isLabbyApi(input, win.location.origin)) win.location.reload();
    return res;
  }) as typeof fetch;
}

/** Signed-in user, or null when login is off (404) or unavailable. */
export async function fetchAuthUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me');
    return res.ok ? ((await res.json()) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** Mirrors src/server/shell.ts — separate build roots, kept in sync by hand. */
export type AuthScreen =
  | { kind: 'forbidden'; user: string }
  | { kind: 'signed-out' }
  | { kind: 'sign-in-failed' };

/**
 * The server serves "Not allowed" / "Signed out" through the normal shell with
 * this marker instead of the widget snapshot; Root renders AuthScreen for it.
 */
export function readAuthScreen(
  doc: Pick<Document, 'getElementById'> = document,
): AuthScreen | null {
  const text = doc.getElementById('labby-auth-screen')?.textContent;
  if (!text) return null;
  try {
    const value = JSON.parse(text) as { kind?: unknown; user?: unknown };
    if (value.kind === 'signed-out') return { kind: 'signed-out' };
    if (value.kind === 'sign-in-failed') return { kind: 'sign-in-failed' };
    if (value.kind === 'forbidden') {
      return { kind: 'forbidden', user: typeof value.user === 'string' ? value.user : '' };
    }
  } catch {
    // malformed marker → treat as a normal page
  }
  return null;
}
