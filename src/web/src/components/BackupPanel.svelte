<script lang="ts">
  import { Database, Download, TriangleAlert, Upload } from 'lucide-svelte';

  // Restore errors surface to the page-level error banner in the parent.
  let { error = $bindable() }: { error?: string | null } = $props();

  let importing = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  function exportBackup() {
    window.location.href = '/api/backup';
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm("This replaces ALL services and your dashboard layout with the backup's contents. Continue?")) return;
    importing = true;
    error = null;
    try {
      const text = await file.text();
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to restore backup');
      }
      window.location.reload();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore backup';
    } finally {
      importing = false;
    }
  }
</script>

<section class="backup" aria-labelledby="backup-title">
  <div class="backup-head">
    <span class="settings-eyebrow"><Database size={13} /> Backup &amp; restore</span>
    <h2 id="backup-title">Move your setup</h2>
    <p class="settings-sub">Download everything — services, credentials, and your dashboard layout — as one file, or restore from a previous one.</p>
  </div>
  <div class="backup-warn">
    <TriangleAlert size={16} />
    <span>The file includes your service credentials in plain text. Keep it somewhere private.</span>
  </div>
  <div class="backup-actions">
    <button type="button" class="btn-save" onclick={exportBackup}>
      <Download size={16} /> Export backup
    </button>
    <button type="button" class="btn-cancel" onclick={() => fileInput?.click()} disabled={importing}>
      <Upload size={16} /> {importing ? 'Importing…' : 'Import backup'}
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json"
      style="display:none"
      onchange={onImportFile}
    />
  </div>
</section>

<style>
  .backup {
    margin-top: 36px;
    padding-top: 26px;
    border-top: 1px solid var(--glass-brd);
  }
  .backup-head h2 {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-top: 2px;
  }
  .backup-head .settings-sub {
    margin-top: 6px;
    margin-bottom: 16px;
  }
  .backup-warn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: 60ch;
    padding: 12px 14px;
    margin-bottom: 18px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warn) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
    color: var(--ink);
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.45;
  }
  .backup-warn :global(svg) {
    flex: none;
    margin-top: 1px;
    color: var(--warn);
  }
  .backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .backup-actions button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  /* shared with the settings bar heading (see Settings.svelte) */
  .settings-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .settings-sub {
    color: var(--ink-dim);
    font-size: 0.9rem;
    font-weight: 500;
    margin-top: 6px;
    max-width: 56ch;
  }
</style>
