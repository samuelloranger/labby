import { expect, test } from 'bun:test';
import { motionMs, pulseOnChange } from './motion';

function fakeDot() {
  const classes = new Set<string>();
  const classList = {
    add: (c: string) => classes.add(c),
    remove: (c: string) => classes.delete(c),
  };
  return {
    node: { classList, offsetWidth: 0 } as unknown as HTMLElement,
    classes,
  };
}

test('pulseOnChange treats the mount value as the baseline', () => {
  const { node, classes } = fakeDot();
  const action = pulseOnChange(node, 'up');
  // Re-running with the value the board already had must stay silent, or every
  // dot fires at once on first paint.
  action.update('up');
  expect(classes.has('dot-changed')).toBe(false);
});

test('pulseOnChange fires once per distinct status', () => {
  const { node, classes } = fakeDot();
  const action = pulseOnChange(node, 'up');

  action.update('down');
  expect(classes.has('dot-changed')).toBe(true);

  classes.delete('dot-changed');
  action.update('down');
  expect(classes.has('dot-changed')).toBe(false);

  action.update('up');
  expect(classes.has('dot-changed')).toBe(true);
});

test('motionMs passes the duration through when motion is allowed', () => {
  // bun has no matchMedia, so the module resolves to "motion allowed".
  expect(motionMs(180)).toBe(180);
});
