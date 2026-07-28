// Contrast is the one design property that breaks silently: a palette gets
// hand-tuned, a token drifts, and nothing looks wrong until someone on a light
// theme cannot read a status line. This parses app.css and does the WCAG maths
// on every theme, so a regression fails the suite instead of shipping.
//
// It approximates each card's real background — the glass layer composited over
// the wall gradient — rather than testing against the raw gradient, because no
// text in the app sits directly on the wall.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(import.meta.dir, '..', 'app.css'), 'utf8');

type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: RGB): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function composite(fg: RGB, alpha: number, bg: RGB): RGB {
  return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as RGB;
}

/** The four status tokens live outside the theme blocks — one set per mode. */
function readGlobalTokens(prefix: 'dark' | 'light') {
  if (prefix === 'light') {
    const block = CSS.match(/:root\[data-theme\^="light"\]\s*\{([^}]*)\}/)?.[1] ?? '';
    return Object.fromEntries(
      [...block.matchAll(/--(\w[\w-]*):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
    );
  }
  const root = CSS.match(/^:root\s*\{([\s\S]*?)\n\}/m)?.[1] ?? '';
  return Object.fromEntries(
    [...root.matchAll(/--(\w[\w-]*):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
  );
}

interface Theme {
  name: string;
  card: RGB;
  tokens: Record<string, string>;
}

function parseThemes(): Theme[] {
  const themes: Theme[] = [];
  for (const match of CSS.matchAll(/:root\[data-theme="([^"]+)"\]\s*\{([\s\S]*?)\n\}/g)) {
    const [, name, body] = match;
    const gradient = body.match(
      /linear-gradient\(160deg,\s*(#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/,
    );
    const glass = body.match(/--glass:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (!gradient || !glass) throw new Error(`theme ${name} is missing a wall gradient or glass`);

    const stops: RGB[] = [parseHex(gradient[1]), parseHex(gradient[2])];
    const isDark = name.startsWith('dark');
    // Worst case for the text: the lightest stop under a light theme, the
    // darkest under a dark one.
    const wall = stops.reduce((a, b) =>
      isDark
        ? relativeLuminance(a) < relativeLuminance(b)
          ? a
          : b
        : relativeLuminance(a) > relativeLuminance(b)
          ? a
          : b,
    );
    const glassRGB: RGB = [Number(glass[1]), Number(glass[2]), Number(glass[3])];

    const tokens = Object.fromEntries(
      [...body.matchAll(/--(\w[\w-]*):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
    );
    const globals = readGlobalTokens(isDark ? 'dark' : 'light');

    const resolved = { ...globals, ...tokens };
    // --accent-ink is declared as `var(--accent)` in the base :root and only
    // overridden with a literal where the accent misses 4.5:1. Mirror that
    // fallback here rather than parsing var() chains.
    if (!resolved['accent-ink']) resolved['accent-ink'] = resolved.accent;

    themes.push({
      name,
      card: composite(glassRGB, Number(glass[4]), wall),
      tokens: resolved,
    });
  }
  return themes;
}

const THEMES = parseThemes();

// Tokens that are painted as text somewhere in the app, so all of them owe 4.5:1.
// --accent is deliberately absent: it is a fill colour, and --accent-ink is the
// variant used wherever it has to be read.
const TEXT_TOKENS = ['ink', 'ink-dim', 'ink-faint', 'accent-ink', 'ok', 'warn', 'down'];

describe('theme contrast', () => {
  test('every theme is discovered', () => {
    expect(THEMES.length).toBe(22);
    expect(THEMES.filter((t) => t.name.startsWith('light')).length).toBe(11);
    expect(THEMES.filter((t) => t.name.startsWith('dark')).length).toBe(11);
  });

  test('every text token clears WCAG AA (4.5:1) on its own card background', () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const token of TEXT_TOKENS) {
        const value = theme.tokens[token];
        expect(value, `${theme.name} is missing --${token}`).toBeDefined();
        const ratio = contrast(parseHex(value), theme.card);
        if (ratio < 4.5) failures.push(`${theme.name} --${token} ${value} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('--idle clears the 3:1 required of a non-text indicator', () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const ratio = contrast(parseHex(theme.tokens.idle), theme.card);
      if (ratio < 3) failures.push(`${theme.name} --idle = ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  test('status tokens are defined once per mode, not left to the base :root alone', () => {
    // The bug this guards: --ok/--warn/--down/--idle sat in :root and were never
    // retuned, so all eleven light themes rendered them at 1.7-3.0:1.
    const lightBlock = CSS.match(/:root\[data-theme\^="light"\]\s*\{([^}]*)\}/)?.[1];
    expect(lightBlock).toBeDefined();
    for (const token of ['--ok', '--warn', '--down', '--idle']) {
      expect(lightBlock).toContain(token);
    }
  });
});
