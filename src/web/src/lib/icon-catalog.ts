// Client-side icon catalogs for the visual picker. Everything is fetched from the
// same CDNs the app already renders icons from — no server or build involvement.
import { LUCIDE_NAMES } from './lucide-set';

export type CatalogIcon = {
  spec: string; // the exact value saved to config, e.g. "di:jellyfin"
  label: string; // display/search label
  keywords: string; // lowercased haystack for search
  previewSrc?: string; // CDN url for grid rendering (di/sh); absent for inline lucide
};

const DI_META = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/metadata.json';
const DI_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg';
const SH_CDN = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg';
const SH_TREE = 'https://api.github.com/repos/selfhst/icons/git/trees/main?recursive=1';
const SH_LS_KEY = 'labby.iconpicker.selfhst.v1';
const SH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // refetch the listing monthly

let diCache: CatalogIcon[] | null = null;
let shCache: CatalogIcon[] | null = null;
let lucideCache: CatalogIcon[] | null = null;

type DiMeta = Record<string, { base?: string; aliases?: string[]; categories?: string[] }>;

export async function loadDashboardIcons(): Promise<CatalogIcon[]> {
  if (diCache) return diCache;
  const res = await fetch(DI_META);
  if (!res.ok) throw new Error(`Dashboard Icons index unavailable (${res.status})`);
  const meta = (await res.json()) as DiMeta;
  diCache = Object.entries(meta)
    // The app renders di: icons as SVG; png/webp-only entries have no /svg/*.svg.
    .filter(([, m]) => m.base === 'svg')
    .map(([slug, m]) => ({
      spec: `di:${slug}`,
      label: slug,
      keywords: [slug, ...(m.aliases ?? []), ...(m.categories ?? [])].join(' ').toLowerCase(),
      previewSrc: `${DI_CDN}/${slug}.svg`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return diCache;
}

export async function loadSelfhstIcons(): Promise<CatalogIcon[]> {
  if (shCache) return shCache;

  const cachedSlugs = readCachedSlugs();
  if (cachedSlugs) {
    shCache = cachedSlugs.map(toSelfhstIcon);
    return shCache;
  }

  // GitHub's git-trees API returns the whole repo in one CORS-enabled request.
  // Rate-limited to 60/hr per IP, which is why the result is cached in localStorage.
  const res = await fetch(SH_TREE);
  if (!res.ok) throw new Error(`selfh.st listing unavailable (${res.status})`);
  const data = (await res.json()) as { tree?: { path: string; type: string }[] };
  const slugs = (data.tree ?? [])
    .filter((t) => t.type === 'blob' && t.path.startsWith('svg/') && t.path.endsWith('.svg'))
    .map((t) => t.path.slice(4, -4))
    .sort((a, b) => a.localeCompare(b));
  if (!slugs.length) throw new Error('selfh.st listing was empty');
  writeCachedSlugs(slugs);
  shCache = slugs.map(toSelfhstIcon);
  return shCache;
}

export function loadLucideIcons(): CatalogIcon[] {
  if (lucideCache) return lucideCache;
  lucideCache = LUCIDE_NAMES.map((name) => ({
    spec: `lucide:${name}`,
    label: name,
    keywords: name.replace(/-/g, ' '),
  }));
  return lucideCache;
}

/** Case-insensitive substring match; empty query returns everything. */
export function filterIcons(icons: CatalogIcon[], query: string): CatalogIcon[] {
  const q = query.trim().toLowerCase();
  if (!q) return icons;
  return icons.filter((i) => i.keywords.includes(q));
}

function toSelfhstIcon(slug: string): CatalogIcon {
  return {
    spec: `sh:${slug}`,
    label: slug,
    keywords: slug.toLowerCase(),
    previewSrc: `${SH_CDN}/${slug}.svg`,
  };
}

function readCachedSlugs(): string[] | null {
  try {
    const raw = localStorage.getItem(SH_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; slugs: string[] };
    if (!parsed?.slugs?.length || Date.now() - parsed.ts > SH_MAX_AGE) return null;
    return parsed.slugs;
  } catch {
    return null;
  }
}

function writeCachedSlugs(slugs: string[]): void {
  try {
    localStorage.setItem(SH_LS_KEY, JSON.stringify({ ts: Date.now(), slugs }));
  } catch {
    /* localStorage full/blocked — the in-memory cache still covers this session */
  }
}
