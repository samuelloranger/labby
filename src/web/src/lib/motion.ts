/**
 * Motion helpers for the places CSS cannot reach.
 *
 * `app.css` has a `prefers-reduced-motion` guard that strips spatial motion
 * app-wide, but it only governs CSS. Anything driven from JS — `svelte/transition`,
 * `svelte/animate`, or an imperatively applied class — runs straight past it.
 * Everything in this file exists so those paths honour the same preference.
 */

const query =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

let reduced = query?.matches ?? false;
query?.addEventListener('change', (e) => {
  reduced = e.matches;
});

/** Read at call time, not import time, so toggling the OS setting takes effect live. */
export function prefersReducedMotion(): boolean {
  return reduced;
}

/** Duration for a JS-driven transition: the real value, or 0 under reduced motion. */
export function motionMs(ms: number): number {
  return reduced ? 0 : ms;
}

/**
 * Svelte action: flash a one-shot class on the node whenever `value` changes.
 *
 * The value at mount is the baseline and never pulses — otherwise every dot on
 * the board would fire at once on first paint, which is noise, not signal.
 */
export function pulseOnChange(node: HTMLElement, value: unknown) {
  let previous = value;

  return {
    update(next: unknown) {
      if (next === previous) return;
      previous = next;
      if (reduced) return;
      node.classList.remove('dot-changed');
      // Reading layout restarts the animation when the value changes twice in
      // quick succession; without it the class is removed and re-added inside
      // one frame and the browser never sees a change.
      void node.offsetWidth;
      node.classList.add('dot-changed');
    },
  };
}
