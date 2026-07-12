export type Mode = 'system' | 'light' | 'dark';

export const PALETTES = [
  ['amber', 'Amber'],
  ['slate', 'Slate'],
  ['mint', 'Mint'],
  ['rose', 'Rose'],
  ['nord', 'Nord'],
  ['peach', 'Peach'],
  ['graphite', 'Graphite'],
  ['ocean', 'Ocean'],
  ['forest', 'Forest'],
  ['dracula', 'Dracula'],
  ['cyberpunk', 'Cyberpunk'],
] as const;

export type Palette = (typeof PALETTES)[number][0];

const PALETTE_KEYS = new Set<string>(PALETTES.map(([key]) => key));

export function isPalette(value: string): value is Palette {
  return PALETTE_KEYS.has(value);
}

export function decomposeTheme(id: string): { mode: Mode; palette: Palette } {
  if (id === 'system') return { mode: 'system', palette: 'amber' };
  if (id.startsWith('system-')) {
    const p = id.slice('system-'.length);
    return { mode: 'system', palette: isPalette(p) ? p : 'amber' };
  }
  if (id === 'light' || id === 'dark') return { mode: id, palette: 'amber' };
  const dash = id.indexOf('-');
  if (dash === -1) return { mode: 'light', palette: 'amber' };
  const mode: Mode = id.slice(0, dash) === 'dark' ? 'dark' : 'light';
  const palette = id.slice(dash + 1);
  return { mode, palette: isPalette(palette) ? palette : 'amber' };
}

export function composeTheme(mode: Mode, palette: Palette): string {
  if (mode === 'system') return palette === 'amber' ? 'system' : `system-${palette}`;
  return palette === 'amber' ? mode : `${mode}-${palette}`;
}

export function resolveConcreteTheme(mode: Mode, palette: Palette, systemIsDark: boolean): string {
  const resolvedMode = mode === 'system' ? (systemIsDark ? 'dark' : 'light') : mode;
  return palette === 'amber' ? resolvedMode : `${resolvedMode}-${palette}`;
}
