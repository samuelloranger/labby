<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type BookmarksData, type WidgetState } from '$lib/stores';

  let { title, integrationId }: { title: string; integrationId: number } = $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<BookmarksData>);
  const links = $derived(state.data?.links ?? []);
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="lucide:layout-grid" fallback="layout-grid" size={18} /></span>
      {title}
    </span>
    {#if links.length}<span class="meta">{links.length}</span>{/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:96px"></div>
  {:else if state.error}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if links.length === 0}
    <p class="state-msg">No bookmarks</p>
  {:else}
    <div class="bm-grid">
      {#each links as l}
        <a class="bm-tile" href={l.url} target="_blank" rel="noopener">
          <span class="bm-ico"><Icon icon={l.icon ?? ''} fallback="globe" size={22} /></span>
          <span class="bm-label">{l.title}</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .bm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 8px;
  }
  .bm-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    border-radius: var(--radius, 10px);
    background: var(--surface-2, rgba(127, 127, 127, 0.08));
    color: inherit;
    text-decoration: none;
    transition: background 0.15s ease;
  }
  .bm-tile:hover {
    background: var(--surface-3, rgba(127, 127, 127, 0.16));
  }
  .bm-label {
    font-size: 0.78rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  @media (prefers-reduced-motion: reduce) {
    .bm-tile { transition: none; }
  }
</style>
