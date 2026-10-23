import { getConfig } from '../config/loader';
import { listIntegrations } from '../db';
import { hub } from '../sse/hub';
import { artKey, resolveArt } from './art';
import { designWidth, Panel } from './cards';
import { type Decision, decide, parseNightHours } from './layout';
import { type Frame, renderFrame, type Screen } from './render';
import { type ArtRef, buildSnapshot, type PanelSnapshot } from './snapshot';

export type { Frame } from './render';

/** The panel's current input: the hub's cached payloads for every enabled row. */
export function currentPanel(now = new Date()): { snapshot: PanelSnapshot; decision: Decision } {
  const snapshot = buildSnapshot(
    listIntegrations(),
    hub.getSnapshot() as Map<string, unknown>,
    now,
  );
  return { snapshot, decision: decide(snapshot, parseNightHours(process.env.LABBY_PANEL_NIGHT)) };
}

/** Artwork the chosen layout will actually show; nothing else is fetched. */
function artNeeded(s: PanelSnapshot, d: Decision): ArtRef[] {
  const refs: (ArtRef | undefined)[] = [];
  for (const p of d.placements) {
    if (p.id === 'playing') {
      const main = s.sessions[0];
      refs.push(p.size === 'tall' ? (main?.backdrop ?? main?.poster) : main?.poster);
      if (p.size === 'tall' && main?.backdrop) refs.push(main.poster);
    }
    if (p.id === 'recent' && p.score >= 75) refs.push(s.recent[0]?.poster);
  }
  return refs.filter((r): r is ArtRef => r !== undefined);
}

type Rendered = { frame: Frame; decision: Decision };

// Nothing on the panel changes faster than this, so devices (or a device and a
// browser tab) polling at the same time share one render instead of each
// paying for Satori and the rasteriser.
const REUSE_MS = 1000;
let latest: { at: number; size: string; result: Promise<Rendered> } | null = null;

const screenSize = () => getConfig()?.panel ?? { width: 800, height: 480 };

export function renderPanel(): Promise<Rendered> {
  const screen = screenSize();
  // A size change in settings must show up on the very next request.
  const size = `${screen.width}x${screen.height}`;
  if (latest && latest.size === size && Date.now() - latest.at < REUSE_MS) return latest.result;
  const result = render(new Date(), screen);
  latest = { at: Date.now(), size, result };
  // A failed render must not be served to the next caller.
  result.catch(() => {
    if (latest?.result === result) latest = null;
  });
  return result;
}

async function render(now: Date, screen: Screen): Promise<Rendered> {
  const { snapshot, decision } = currentPanel(now);
  const rows = new Map(listIntegrations().map((r) => [r.id, r]));
  const art = await resolveArt(artNeeded(snapshot, decision), rows);
  const frame = await renderFrame(
    Panel(
      snapshot,
      decision,
      (ref) => (ref ? art.get(artKey(ref)) : undefined),
      designWidth(screen),
    ),
    screen,
  );
  return { frame, decision };
}
