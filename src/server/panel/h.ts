/**
 * Minimal JSX factory for the panel cards. Satori consumes plain
 * `{ type, props: { children } }` nodes, so React itself isn't needed.
 * Function components are called eagerly.
 */
export type Node = { type: string; props: Record<string, unknown> };
type Component = (props: Record<string, unknown>) => Node;

export function h(
  type: string | Component,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node {
  const flat = children
    .flat(Number.POSITIVE_INFINITY)
    .filter((c) => c !== null && c !== undefined && c !== false);
  const merged = { ...props, children: flat.length === 1 ? flat[0] : flat };
  return typeof type === 'function' ? type(merged) : { type, props: merged };
}

export const Fragment = 'div';

declare global {
  namespace JSX {
    type Element = Node;
    interface IntrinsicElements {
      // Satori takes a CSS subset as inline style objects.
      [tag: string]: { style?: Record<string, unknown>; [attr: string]: unknown };
    }
    interface ElementChildrenAttribute {
      children: unknown;
    }
  }
}
