<script lang="ts">
  import { ChevronDown, Search, X } from 'lucide-svelte';
  import Icon from './Icon.svelte';
  import {
    filterIcons,
    loadDashboardIcons,
    loadLucideIcons,
    loadSelfhstIcons,
    type CatalogIcon,
  } from '$lib/icon-catalog';

  let {
    value = '',
    placeholder = 'Choose icon',
    onchange,
  }: { value?: string; placeholder?: string; onchange?: (v: string) => void } = $props();

  type Tab = 'di' | 'sh' | 'lucide' | 'custom';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'di', label: 'Dashboard Icons' },
    { id: 'sh', label: 'selfh.st' },
    { id: 'lucide', label: 'Lucide' },
    { id: 'custom', label: 'Custom' },
  ];

  // Keep more than fits on screen but not thousands of <img> at once.
  const RENDER_CAP = 240;

  let open = $state(false);
  let tab = $state<Tab>('di');
  let query = $state('');
  let catalog = $state<CatalogIcon[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let hoverSpec = $state<string | null>(null);
  let failed = $state<Record<string, boolean>>({});
  let customDraft = $state('');
  let shDraft = $state('');
  let popStyle = $state('');

  let swatchEl = $state<HTMLButtonElement | null>(null);
  let popEl = $state<HTMLDivElement | null>(null);
  let searchEl = $state<HTMLInputElement | null>(null);

  const results = $derived(filterIcons(catalog, query));
  const shown = $derived(results.slice(0, RENDER_CAP));
  const overflow = $derived(Math.max(0, results.length - RENDER_CAP));
  // What the footer reads out: the hovered cell, else the committed value.
  const readout = $derived(hoverSpec ?? (value || null));

  async function loadTab(t: Tab) {
    error = null;
    if (t === 'custom') {
      catalog = [];
      loading = false;
      return;
    }
    if (t === 'lucide') {
      catalog = loadLucideIcons();
      loading = false;
      return;
    }
    loading = true;
    try {
      const data = t === 'di' ? await loadDashboardIcons() : await loadSelfhstIcons();
      // A slower fetch must not clobber a tab the user has since switched away from.
      if (t === tab) catalog = data;
    } catch (e) {
      if (t === tab) {
        catalog = [];
        error = e instanceof Error ? e.message : 'Could not load icons';
      }
    } finally {
      if (t === tab) loading = false;
    }
  }

  async function selectTab(t: Tab) {
    if (t === tab) return;
    tab = t;
    query = '';
    hoverSpec = null;
    await loadTab(t);
    searchEl?.focus();
  }

  function place() {
    if (!swatchEl) return;
    const r = swatchEl.getBoundingClientRect();
    const W = 340;
    const gap = 6;
    const pad = 8;
    // Size to available space on the roomier side so the footer is never clipped.
    const below = window.innerHeight - r.bottom - gap - pad;
    const above = r.top - gap - pad;
    const useAbove = below < 300 && above > below;
    const maxH = Math.min(420, Math.max(200, useAbove ? above : below));
    const left = Math.min(Math.max(pad, r.left), window.innerWidth - W - pad);
    const top = useAbove ? Math.max(pad, r.top - gap - maxH) : r.bottom + gap;
    popStyle = `top:${top}px; left:${left}px; width:${W}px; max-height:${maxH}px;`;
  }

  async function openPicker() {
    open = true;
    place();
    if (!catalog.length && tab !== 'custom') await loadTab(tab);
    // Wait a tick so the input exists before focusing.
    queueMicrotask(() => searchEl?.focus());
  }

  function close() {
    open = false;
    hoverSpec = null;
  }

  function pick(spec: string) {
    onchange?.(spec);
    close();
  }

  function clear() {
    onchange?.('');
  }

  function onWindowPointer(e: PointerEvent) {
    const t = e.target as Node;
    if (popEl?.contains(t) || swatchEl?.contains(t)) return;
    close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  // The form modal uses a CSS transform, which would make our position:fixed
  // popover resolve against the modal instead of the viewport. Portal to <body>.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  // Wire global listeners only while open.
  $effect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener('pointerdown', onWindowPointer, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('pointerdown', onWindowPointer, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  });
</script>

<div class="ip-field" class:clearable={!!value}>
  <button
    type="button"
    class="ip-swatch"
    bind:this={swatchEl}
    onclick={() => (open ? close() : openPicker())}
    aria-haspopup="dialog"
    aria-expanded={open}
  >
    <span class="ip-swatch-mark"><Icon icon={value} fallback="image" size={20} /></span>
    <span class="ip-swatch-label" class:empty={!value}>{value || placeholder}</span>
    <ChevronDown size={15} class="ip-chev" />
  </button>
  {#if value}
    <button type="button" class="ip-clear" aria-label="Clear icon" onclick={clear}>
      <X size={13} />
    </button>
  {/if}
</div>

{#if open}
  <div class="ip-pop" use:portal bind:this={popEl} role="dialog" aria-label="Pick an icon" style={popStyle}>
    <div class="ip-tabs" role="tablist">
      {#each TABS as t}
        <button
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          class="ip-tab"
          class:active={tab === t.id}
          onclick={() => selectTab(t.id)}
        >
          {t.label}
        </button>
      {/each}
    </div>

    {#if tab === 'custom'}
      <div class="ip-custom">
        <p class="ip-hint">Paste an image URL, a <code>/path</code>, or any raw spec (<code>di:</code>, <code>sh:</code>, <code>lucide:</code>).</p>
        <div class="ip-custom-row">
          <span class="ip-preview"><Icon icon={customDraft} fallback="image" size={22} /></span>
          <input
            type="text"
            class="ip-input"
            bind:value={customDraft}
            placeholder="https://…/logo.svg"
            onkeydown={(e) => {
              if (e.key === 'Enter' && customDraft.trim()) pick(customDraft.trim());
            }}
          />
          <button type="button" class="ip-use" disabled={!customDraft.trim()} onclick={() => pick(customDraft.trim())}>
            Use
          </button>
        </div>
      </div>
    {:else}
      <div class="ip-searchbar">
        <Search size={15} class="ip-search-ic" />
        <input
          bind:this={searchEl}
          type="text"
          class="ip-input"
          bind:value={query}
          placeholder={tab === 'di' ? 'Search service logos…' : tab === 'sh' ? 'Search selfh.st…' : 'Search glyphs…'}
        />
      </div>

      {#if loading}
        <div class="ip-state">Loading icons…</div>
      {:else if error}
        <div class="ip-state ip-fallback">
          <p class="ip-err">{error}</p>
          {#if tab === 'sh'}
            <p class="ip-hint">Enter a selfh.st slug and it'll resolve live:</p>
            <div class="ip-custom-row">
              <span class="ip-preview"><Icon icon={shDraft ? `sh:${shDraft.trim()}` : ''} fallback="image" size={22} /></span>
              <input
                type="text"
                class="ip-input"
                bind:value={shDraft}
                placeholder="e.g. jellyfin"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && shDraft.trim()) pick(`sh:${shDraft.trim()}`);
                }}
              />
              <button type="button" class="ip-use" disabled={!shDraft.trim()} onclick={() => pick(`sh:${shDraft.trim()}`)}>
                Use
              </button>
            </div>
          {/if}
        </div>
      {:else if !shown.length}
        <div class="ip-state">No icons match “{query}”.</div>
      {:else}
        <div class="ip-grid" role="listbox" tabindex="-1">
          {#each shown as item (item.spec)}
            {#if !failed[item.spec]}
              <button
                type="button"
                role="option"
                aria-selected={value === item.spec}
                class="ip-cell"
                class:selected={value === item.spec}
                title={item.spec}
                onmouseenter={() => (hoverSpec = item.spec)}
                onmouseleave={() => (hoverSpec = null)}
                onfocus={() => (hoverSpec = item.spec)}
                onblur={() => (hoverSpec = null)}
                onclick={() => pick(item.spec)}
              >
                {#if item.previewSrc}
                  <img src={item.previewSrc} alt="" loading="lazy" onerror={() => (failed[item.spec] = true)} />
                {:else}
                  <Icon icon={item.spec} fallback="box" size={26} />
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}

    <div class="ip-foot">
      <code class="ip-spec" class:muted={!readout}>{readout ?? 'no icon selected'}</code>
      {#if overflow > 0 && !loading && !error}
        <span class="ip-more">+{overflow} more — refine search</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Trigger — reads as an input, behaves as a button. */
  .ip-field {
    position: relative;
    width: 100%;
  }
  .ip-field.clearable .ip-swatch-label {
    padding-right: 22px;
  }
  .ip-swatch {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
    color: var(--ink);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .ip-swatch:hover {
    border-color: var(--accent);
  }
  .ip-swatch-mark {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--glass-brd);
  }
  .ip-swatch-mark :global(img),
  .ip-swatch-mark :global(svg) {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .ip-swatch-label {
    flex: 1;
    min-width: 0;
    font-size: 0.82rem;
    font-weight: 600;
    font-variant-ligatures: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ip-swatch-label.empty {
    color: var(--ink-faint);
    font-weight: 500;
  }
  .ip-clear {
    position: absolute;
    right: 32px;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--ink-faint);
    cursor: pointer;
  }
  .ip-clear:hover {
    color: var(--down);
    background: var(--surface);
  }
  .ip-swatch :global(.ip-chev) {
    flex: 0 0 auto;
    color: var(--ink-faint);
  }

  /* Popover */
  .ip-pop {
    position: fixed;
    z-index: 200;
    display: flex;
    flex-direction: column;
    max-height: 404px;
    background: var(--wall);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .ip-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 6px;
    border-bottom: 1px solid var(--glass-brd);
    background: var(--glass-2);
  }
  .ip-tab {
    flex: 0 1 auto;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-dim);
    font-family: inherit;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    cursor: pointer;
    white-space: nowrap;
  }
  .ip-tab:hover {
    color: var(--ink);
  }
  .ip-tab.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .ip-searchbar {
    position: relative;
    display: flex;
    align-items: center;
    padding: 10px 12px 8px;
  }
  .ip-searchbar :global(.ip-search-ic) {
    position: absolute;
    left: 22px;
    color: var(--ink-faint);
    pointer-events: none;
  }
  .ip-input {
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 16px;
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--ink);
    outline: none;
  }
  .ip-searchbar .ip-input {
    padding-left: 32px;
  }
  .ip-input:focus {
    border-color: var(--accent);
  }

  /* The specimen tray. */
  .ip-grid {
    flex: 1 1 auto;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;
    padding: 4px 8px 8px;
  }
  .ip-cell {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--glass-2);
    cursor: pointer;
    padding: 0;
  }
  .ip-cell:hover {
    background: var(--surface);
    border-color: var(--glass-brd);
  }
  .ip-cell.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .ip-cell :global(img),
  .ip-cell :global(svg) {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }

  .ip-state {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: var(--ink-dim);
    font-size: 0.82rem;
  }
  .ip-fallback {
    justify-content: flex-start;
    padding-top: 12px;
  }
  .ip-err {
    color: var(--warn);
    font-weight: 600;
  }
  .ip-hint {
    color: var(--ink-faint);
    font-size: 0.76rem;
    line-height: 1.4;
  }
  .ip-hint code {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.72rem;
    color: var(--ink-dim);
  }

  .ip-custom {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .ip-custom-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ip-preview {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--glass-brd);
  }
  .ip-preview :global(img),
  .ip-preview :global(svg) {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .ip-use {
    flex: 0 0 auto;
    padding: 8px 14px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: #fff;
    font-family: inherit;
    font-weight: 700;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .ip-use:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Footer — the live spec readout is the signature element. */
  .ip-foot {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-top: 1px solid var(--glass-brd);
    background: var(--glass-2);
  }
  .ip-spec {
    min-width: 0;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ip-spec.muted {
    color: var(--ink-faint);
    font-weight: 500;
  }
  .ip-more {
    flex: 0 0 auto;
    font-size: 0.7rem;
    color: var(--ink-faint);
  }

  @media (prefers-reduced-motion: no-preference) {
    .ip-cell {
      transition: background 0.12s ease, border-color 0.12s ease;
    }
  }
</style>
