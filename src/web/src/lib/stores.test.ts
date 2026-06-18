import { expect, test } from 'bun:test';
import { getStore, idFromEvent } from './stores';

test('idFromEvent parses int channel names', () => {
  expect(idFromEvent('int:1')).toBe(1);
  expect(idFromEvent('int:42')).toBe(42);
  expect(idFromEvent('monitor')).toBeNull();
  expect(idFromEvent('int:abc')).toBeNull();
});

test('getStore memoizes per integration id', () => {
  const a = getStore(7);
  const b = getStore(7);
  const c = getStore(8);
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});
