import { expect, test } from 'bun:test';
import { renderShell } from './shell';
import { hub } from './sse/hub';

const TEMPLATE =
  '<!doctype html><html data-theme="__LABBY_THEME__"><head><title>Labby</title></head><body><div id="app"></div></body></html>';

test('renderShell patches the theme token and inlines the widget snapshot', () => {
  hub.publish('int:987654', { error: 'shell-test' });
  const out = renderShell(TEMPLATE);
  expect(out).not.toContain('__LABBY_THEME__');
  expect(out).toContain('id="labby-custom-css"');
  expect(out).toContain('id="labby-snapshot"');
  expect(out).toContain('shell-test');
});

test('auth screen shell carries the marker and never the widget snapshot', () => {
  hub.publish('int:987655', { error: 'must-not-leak' });
  const out = renderShell(TEMPLATE, { authScreen: { kind: 'forbidden', user: 'eve@example.com' } });
  expect(out).not.toContain('__LABBY_THEME__');
  expect(out).toContain('id="labby-custom-css"');
  expect(out).not.toContain('labby-snapshot');
  expect(out).not.toContain('must-not-leak');
  expect(out).toContain(
    '<script id="labby-auth-screen" type="application/json">{"kind":"forbidden","user":"eve@example.com"}</script>',
  );
});

test('auth screen marker escapes provider-supplied names', () => {
  const out = renderShell(TEMPLATE, {
    authScreen: { kind: 'forbidden', user: '</script><script>alert(1)</script>' },
  });
  expect(out).not.toContain('</script><script>alert(1)');
  expect(out).toContain('\\u003c/script>');
});
