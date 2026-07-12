import { describe, expect, test } from 'bun:test';
import {
  composeTheme,
  decomposeTheme,
  isPalette,
  PALETTES,
  resolveConcreteTheme,
} from './theme';

describe('PALETTES', () => {
  test('has 11 entries starting with amber', () => {
    expect(PALETTES.length).toBe(11);
    expect(PALETTES[0][0]).toBe('amber');
  });
});

describe('isPalette', () => {
  test('accepts known palette keys, rejects unknown', () => {
    expect(isPalette('nord')).toBe(true);
    expect(isPalette('amber')).toBe(true);
    expect(isPalette('not-a-palette')).toBe(false);
  });
});

describe('decomposeTheme', () => {
  test('bare system', () => {
    expect(decomposeTheme('system')).toEqual({ mode: 'system', palette: 'amber' });
  });
  test('system with a palette', () => {
    expect(decomposeTheme('system-nord')).toEqual({ mode: 'system', palette: 'nord' });
  });
  test('bare light and dark are the amber palette', () => {
    expect(decomposeTheme('light')).toEqual({ mode: 'light', palette: 'amber' });
    expect(decomposeTheme('dark')).toEqual({ mode: 'dark', palette: 'amber' });
  });
  test('light/dark with a palette suffix', () => {
    expect(decomposeTheme('light-ocean')).toEqual({ mode: 'light', palette: 'ocean' });
    expect(decomposeTheme('dark-dracula')).toEqual({ mode: 'dark', palette: 'dracula' });
  });
  test('an unrecognized palette suffix falls back to amber', () => {
    expect(decomposeTheme('dark-nonsense')).toEqual({ mode: 'dark', palette: 'amber' });
  });
});

describe('composeTheme', () => {
  test('round-trips every mode x palette combination through decomposeTheme', () => {
    const modes = ['system', 'light', 'dark'] as const;
    for (const mode of modes) {
      for (const [palette] of PALETTES) {
        const id = composeTheme(mode, palette as any);
        expect(decomposeTheme(id)).toEqual({ mode, palette });
      }
    }
  });
  test('amber palette omits the suffix', () => {
    expect(composeTheme('light', 'amber')).toBe('light');
    expect(composeTheme('dark', 'amber')).toBe('dark');
    expect(composeTheme('system', 'amber')).toBe('system');
  });
});

describe('resolveConcreteTheme', () => {
  test('system resolves to the OS preference', () => {
    expect(resolveConcreteTheme('system', 'nord', true)).toBe('dark-nord');
    expect(resolveConcreteTheme('system', 'nord', false)).toBe('light-nord');
  });
  test('explicit light/dark ignore the OS preference flag', () => {
    expect(resolveConcreteTheme('light', 'ocean', true)).toBe('light-ocean');
    expect(resolveConcreteTheme('dark', 'ocean', false)).toBe('dark-ocean');
  });
  test('amber palette produces the bare mode name', () => {
    expect(resolveConcreteTheme('dark', 'amber', false)).toBe('dark');
  });
});
