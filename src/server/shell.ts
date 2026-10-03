import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from './config/loader';
import { hub } from './sse/hub';

const INDEX_PATH = path.join(process.cwd(), 'src', 'web', 'dist', 'index.html');

/** What the web app renders instead of the dashboard (see Root.svelte). */
export type AuthScreen =
  | { kind: 'forbidden'; user: string }
  | { kind: 'signed-out' }
  | { kind: 'sign-in-failed' };

function themeFromConfig(): string {
  const config = getConfig();
  const def = config?.theme.default ?? 'system';
  if (def !== 'system') return def;
  return '';
}

function customCssFromConfig(): string {
  const config = getConfig();
  return config?.theme.customCss ?? '';
}

/**
 * Inline the hub's cached payloads into the HTML so the first paint already has
 * data.
 *
 * Without this every widget renders a fixed-height skeleton and then snaps to
 * its real height once the stream fills it ~200ms later. The board is
 * `column-count` masonry, so each of those resizes reflows a whole column —
 * measured on a live board, one feed card grew 234px and shoved the two cards
 * below it down with it.
 *
 * This is the cheap half of SSR: the server ships state, not markup. No second
 * render path, no hydration, no separate build — the scheduler has already
 * polled this data and the hub is already caching it per stream key.
 */
// Per-channel budget for the inlined snapshot. A download client with a few
// hundred torrents serialises to ~100KB, and the card shows two numbers until
// someone opens the modal — inlining that on every uncached page load costs far
// more than the reflow it saves. Oversized channels are simply left out: the
// widget renders its skeleton and fills from the stream exactly as before, which
// is the behaviour those cards already had without visible jump.
const SNAPSHOT_CHANNEL_BUDGET = 32 * 1024;

function snapshotScript(): string {
  const snapshot: Record<string, unknown> = {};
  for (const [channel, data] of hub.getSnapshot()) {
    const encoded = JSON.stringify(data);
    if (encoded && encoded.length <= SNAPSHOT_CHANNEL_BUDGET) snapshot[channel] = data;
  }
  // Payloads carry upstream strings — torrent names, feed titles, container
  // names. Escaping `<` is what stops any of them closing this script tag.
  const json = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
  return `<script id="labby-snapshot" type="application/json">${json}</script>`;
}

export function readShell(): Promise<string | null> {
  return readFile(INDEX_PATH, 'utf-8').catch(() => null);
}

function authScreenScript(screen: AuthScreen): string {
  // Same escaping as the snapshot: `<` can't close the script tag.
  const json = JSON.stringify(screen).replaceAll('<', '\\u003c');
  return `<script id="labby-auth-screen" type="application/json">${json}</script>`;
}

/**
 * The one place index.html is patched. Auth screens get the same theme and
 * custom CSS as the dashboard but never the widget snapshot — the viewer is
 * not allowed to see that data.
 */
export function renderShell(html: string, opts: { authScreen?: AuthScreen } = {}): string {
  const patched = html.replaceAll('__LABBY_THEME__', themeFromConfig());
  const data = opts.authScreen ? authScreenScript(opts.authScreen) : snapshotScript();
  // A replacer function, not a replacement string: a provider display name or
  // custom CSS containing `$&`, `` $` ``, `$'` would otherwise be expanded by
  // String.replace's special pattern syntax and splice the page into the marker.
  return patched.replace(
    '</head>',
    () => `<style id="labby-custom-css">${customCssFromConfig()}</style>${data}</head>`,
  );
}
