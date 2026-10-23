import { listIntegrations } from '../db';
import { hub } from '../sse/hub';
import { artKey, resolveArt } from './art';
import { Panel } from './cards';
import { type Decision, decide, parseNightHours } from './layout';
import { renderFrame } from './render';
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

export async function renderPanel(now = new Date()) {
  const { snapshot, decision } = currentPanel(now);
  const rows = new Map(listIntegrations().map((r) => [r.id, r]));
  const art = await resolveArt(artNeeded(snapshot, decision), rows);
  const frame = await renderFrame(
    Panel(snapshot, decision, (ref) => (ref ? art.get(artKey(ref)) : undefined)),
  );
  return { frame, decision };
}
