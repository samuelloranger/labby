import { resolve } from 'node:path';
import fontRegular from '@fontsource/manrope/files/manrope-latin-400-normal.woff' with {
  type: 'file',
};
import fontSemi from '@fontsource/manrope/files/manrope-latin-600-normal.woff' with {
  type: 'file',
};
import fontBold from '@fontsource/manrope/files/manrope-latin-700-normal.woff' with {
  type: 'file',
};
import fontHeavy from '@fontsource/manrope/files/manrope-latin-800-normal.woff' with {
  type: 'file',
};
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm' with { type: 'file' };
import jpeg from 'jpeg-js';
import satori from 'satori';
import { designWidth, HEIGHT } from './cards';
import type { Node } from './h';

// The server is bundled into dist/index.js with these files copied beside it;
// their import paths are relative to the bundle, not to the working directory.
const asset = (path: string) => Bun.file(resolve(import.meta.dir, path)).arrayBuffer();

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: 'normal' };
let ready: Promise<Font[]> | null = null;

function init(): Promise<Font[]> {
  ready ??= (async () => {
    // A `with { type: 'file' }` import is a path string at runtime; bun-types models *.wasm as a module.
    await initWasm(await asset(resvgWasm as unknown as string));
    const weights = [
      [400, fontRegular],
      [600, fontSemi],
      [700, fontBold],
      [800, fontHeavy],
    ] as const;
    return Promise.all(
      weights.map(async ([weight, path]) => ({
        name: 'Manrope',
        data: await asset(path),
        weight,
        style: 'normal' as const,
      })),
    );
  })();
  return ready;
}

export type Frame = { jpeg: Uint8Array<ArrayBuffer>; etag: string };

const JPEG_QUALITY = 85;
let last: { key: number | bigint; frame: Frame } | null = null;

export type Screen = { width: number; height: number };

/**
 * Renders a panel tree (built for {@link designWidth}(screen) x 480) to a JPEG
 * of exactly `screen` size. Consecutive identical frames reuse the previous
 * bytes and ETag, so a device polling every few seconds mostly gets 304s and
 * the server skips rasterising.
 */
export async function renderFrame(
  tree: Node,
  screen: Screen = { width: 800, height: 480 },
): Promise<Frame> {
  const fonts = await init();
  // biome-ignore lint/suspicious/noExplicitAny: Satori's types want a ReactNode; h() builds the same shape.
  const svg = await satori(tree as any, { width: designWidth(screen), height: HEIGHT, fonts });
  const key = Bun.hash(`${screen.width}x${screen.height}\n${svg}`);
  if (last?.key === key) return last.frame;
  // Render at exactly the screen size: the root keeps its 480 px-tall viewBox
  // and stretches to fit. Scaling with resvg's zoom instead rounds the width a
  // second time and lands a pixel off for many sizes; the stretch here is
  // under a pixel across the whole frame.
  const sized = svg.replace(
    /^<svg width="[^"]*" height="[^"]*"/,
    `<svg width="${screen.width}" height="${screen.height}" preserveAspectRatio="none"`,
  );
  // Satori already converted text to paths, so resvg needs no fonts of its own.
  const image = new Resvg(sized, { font: { loadSystemFonts: false } }).render();
  const encoded = jpeg.encode(
    { data: image.pixels, width: image.width, height: image.height },
    JPEG_QUALITY,
  );
  image.free();
  const frame = { jpeg: new Uint8Array(encoded.data), etag: `"${key.toString(36)}"` };
  last = { key, frame };
  return frame;
}
