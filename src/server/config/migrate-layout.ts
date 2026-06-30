import {
  db,
  getSetting,
  listIntegrations,
  reorderIntegrations,
  setSetting,
  updateIntegration,
} from '../db';

const DISPLAY_KEYS = ['max', 'variant', 'style', 'systems'] as const;

// One-time: fold the legacy pages/columns/widgets layout into the integrations
// (display options -> config, widget order -> position), then rewrite the
// dashboard row to just {title, theme}. Guarded by the `layout_migrated` flag.
export function migrateLayoutToIntegrations(): void {
  if (getSetting('layout_migrated') === '1') return;

  const raw = getSetting('dashboard');
  if (!raw) {
    setSetting('layout_migrated', '1');
    return;
  }

  // biome-ignore lint/suspicious/noExplicitAny: loose traversal of untrusted legacy dashboard JSON
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    setSetting('layout_migrated', '1');
    return;
  }

  // One transaction: config merges, reorder, dashboard rewrite, and the
  // `layout_migrated` flag commit together — a crash can't leave it half-applied
  // and re-run on next boot (which would clobber positions / manual edits).
  db.transaction(() => {
    if (Array.isArray(parsed?.pages)) {
      const byId = new Map(listIntegrations().map((r) => [r.id, r]));
      const ordered = new Set<number>();

      for (const page of parsed.pages) {
        for (const col of page?.columns ?? []) {
          for (const w of col?.widgets ?? []) {
            const row = byId.get(w?.integrationId);
            if (!row) continue;
            ordered.add(row.id);
            const merged = { ...row.config };
            for (const k of DISPLAY_KEYS) {
              if (w[k] !== undefined && merged[k] === undefined) merged[k] = w[k];
            }
            updateIntegration(row.id, { ...row, config: merged });
          }
        }
      }

      // any integration not referenced by a widget keeps its place after the rest
      for (const r of byId.values()) ordered.add(r.id);
      reorderIntegrations([...ordered]);
    }

    setSetting(
      'dashboard',
      JSON.stringify(
        {
          title: parsed?.title ?? 'Labby',
          theme: parsed?.theme ?? { default: 'system' },
        },
        null,
        2,
      ),
    );
    setSetting('layout_migrated', '1');
  })();
}
