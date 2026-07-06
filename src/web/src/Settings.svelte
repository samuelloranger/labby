<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, ChevronDown, ChevronUp, Database, Pencil, Plus, Trash2 } from 'lucide-svelte';
  import Icon from './components/Icon.svelte';
  import IntegrationForm from './components/IntegrationForm.svelte';
  import BackupPanel from './components/BackupPanel.svelte';
  import type { IntegrationRow, IntegrationTypeMeta } from '$lib/types';

  let types = $state<IntegrationTypeMeta[]>([]);
  let rows = $state<IntegrationRow[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  let editing = $state<IntegrationRow | null>(null);
  let formOpen = $state(false);
  let formType = $state('');

  const TYPE_ICONS: Record<string, string> = {
    monitor: 'lucide:activity',
    docker: 'di:docker',
    qbittorrent: 'di:qbittorrent',
    transmission: 'di:transmission',
    sabnzbd: 'di:sabnzbd',
    adguard: 'di:adguard-home',
    jellyfin: 'di:jellyfin',
    emby: 'di:emby',
    plex: 'di:plex',
    beszel: 'di:beszel',
    radarr: 'di:radarr',
    sonarr: 'di:sonarr',
    reelward: '/icons/reelward.png',
    reddit: 'di:reddit',
    hackernews: 'di:hacker-news',
    weather: '/icons/openweather.png',
    calendar: 'lucide:calendar',
    speedtest: '/icons/speedtest-tracker.svg',
    bookmarks: 'lucide:layout-grid',
  };

  const selectedMeta = $derived(types.find((t) => t.type === formType));

  function openAdd(type: string) {
    if (!types.some((t) => t.type === type)) return;
    editing = null;
    formType = type;
    formOpen = true;
    error = null;
  }

  function openEdit(row: IntegrationRow) {
    editing = row;
    formType = row.type;
    formOpen = true;
    error = null;
  }

  function closeForm() {
    formOpen = false;
    editing = null;
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const [typesRes, rowsRes] = await Promise.all([
        fetch('/api/integrations/types'),
        fetch('/api/integrations'),
      ]);
      if (!typesRes.ok || !rowsRes.ok) throw new Error('Failed to load integrations');
      types = await typesRes.json();
      rows = await rowsRes.json();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  type SavePayload = {
    name: string;
    type: string;
    config: Record<string, unknown>;
    enabled: boolean;
    refreshSeconds: number | null;
  };

  async function saveForm(payload: SavePayload) {
    saving = true;
    error = null;
    try {
      const res = editing
        ? await fetch(`/api/integrations/${editing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save integration');
      }
      closeForm();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      saving = false;
    }
  }

  async function removeRow(row: IntegrationRow) {
    if (!confirm(`Delete integration "${row.name}"?`)) return;
    saving = true;
    error = null;
    try {
      const res = await fetch(`/api/integrations/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete integration');
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      saving = false;
    }
  }

  let dragIndex = $state<number | null>(null);

  async function persistOrder() {
    try {
      await fetch('/api/integrations/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rows.map((r) => r.id) }),
      });
    } catch {
      /* order will resync on next load */
    }
  }

  function onDragStart(i: number) {
    dragIndex = i;
  }
  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    rows = next;
    dragIndex = i;
  }
  function onDrop() {
    dragIndex = null;
    void persistOrder();
  }

  // Touch/keyboard-friendly reorder (HTML5 drag doesn't fire on iOS Safari).
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    rows = next;
    void persistOrder();
  }
</script>

<div class="page settings-page">
  <div class="settings-bar">
    <button class="iconbtn" onclick={() => (window.location.hash = '')} aria-label="Back to dashboard" title="Back to dashboard">
      <ArrowLeft size={18} />
    </button>
    <div class="settings-heading">
      <span class="settings-eyebrow"><Database size={13} /> Configuration</span>
      <h1>Manage Services</h1>
      <p class="settings-sub">Add integrations with URLs, API keys, and per-instance settings. Everything is stored in the SQLite database — credentials never leave the server.</p>
    </div>
  </div>

  {#if error}
    <p class="state-msg error">{error}</p>
  {/if}

  {#if loading}
    <div class="services-grid">
      {#each Array(6) as _}
        <div class="svc-card"><div class="skeleton" style="height:104px"></div></div>
      {/each}
    </div>
  {:else}
    <div class="services-grid">
      {#each rows as row, i (row.id)}
        <div
          class="svc-card"
          class:dragging={dragIndex === i}
          draggable="true"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => onDragOver(e, i)}
          ondrop={onDrop}
          ondragend={() => (dragIndex = null)}
        >
          <div class="svc-head">
            <span class="drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
            <span class="svc-mark"><Icon icon={TYPE_ICONS[row.type] ?? 'lucide:box'} fallback="box" size={20} /></span>
            <div class="svc-title">
              <h3>{row.name}</h3>
              <span class="svc-status" class:on={row.enabled}>
                {types.find((t) => t.type === row.type)?.label ?? row.type}{row.enabled ? '' : ' · disabled'}
              </span>
            </div>
            <div class="row-actions">
              <button type="button" class="btn-icon move-btn" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                <ChevronUp size={15} />
              </button>
              <button type="button" class="btn-icon move-btn" onclick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" title="Move down">
                <ChevronDown size={15} />
              </button>
              <button type="button" class="btn-icon" onclick={() => openEdit(row)} aria-label="Edit" title="Edit">
                <Pencil size={15} />
              </button>
              <button type="button" class="btn-icon danger" onclick={() => removeRow(row)} aria-label="Delete" title="Delete">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="svc-card wide">
      <div class="svc-head">
        <span class="svc-mark on"><Plus size={16} /></span>
        <div class="svc-title">
          <h3>Add Integration</h3>
          <span class="svc-status">Choose a service type to configure</span>
        </div>
      </div>
      <div class="type-grid">
        {#each types as t}
          <button type="button" class="type-pick" onclick={() => openAdd(t.type)}>
            <Icon icon={TYPE_ICONS[t.type] ?? 'lucide:box'} fallback="box" size={18} />
            {t.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <BackupPanel bind:error />
</div>

{#if formOpen && selectedMeta}
  <IntegrationForm meta={selectedMeta} row={editing} {saving} onsubmit={saveForm} oncancel={closeForm} />
{/if}

<style>
  .settings-page {
    max-width: 1080px;
    margin: 0 auto;
  }

  .settings-bar {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 28px;
  }
  .settings-bar .iconbtn {
    margin-top: 2px;
    text-decoration: none;
    flex: none;
  }
  .settings-heading h1 {
    font-size: 1.7rem;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }
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

  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }

  .svc-card {
    background: var(--glass);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius);
    padding: 18px;
    box-shadow: var(--shadow), inset 0 1px 0 var(--glass-hi);
  }
  .svc-card.wide {
    margin-bottom: 18px;
  }

  .svc-head {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .svc-mark {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--ink-dim);
    overflow: hidden;
  }
  .svc-mark.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 800;
  }
  .svc-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .svc-title h3 {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .svc-status {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-faint);
  }
  .svc-status.on {
    color: var(--ok);
  }

  .row-actions {
    display: flex;
    gap: 6px;
  }
  .btn-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--glass-brd);
    background: var(--glass-2);
    color: var(--ink-dim);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .btn-icon.danger:hover {
    color: var(--down);
    border-color: var(--down);
  }

  .type-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .type-pick {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--glass-brd);
    background: var(--glass-2);
    border-radius: var(--pill);
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
  }
  .type-pick:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  @media (max-width: 640px) {
    /* roomier touch targets on phones */
    .btn-icon {
      width: 40px;
      height: 40px;
    }
  }

  .svc-card[draggable='true'] { cursor: default; }
  .svc-card.dragging { opacity: 0.5; }
  .drag-handle {
    cursor: grab;
    color: var(--ink-faint);
    font-size: 18px;
    line-height: 1;
    user-select: none;
    padding-right: 2px;
  }
  .drag-handle:active { cursor: grabbing; }

  /* Desktop (mouse): drag to reorder, hide arrow buttons. */
  @media (hover: hover) and (pointer: fine) {
    .row-actions .move-btn { display: none; }
  }
  /* Touch: arrow buttons reorder (HTML5 drag doesn't fire on iOS), hide drag handle. */
  @media (pointer: coarse) {
    .drag-handle { display: none; }
    .svc-card[draggable='true'] { cursor: default; }
  }
</style>
