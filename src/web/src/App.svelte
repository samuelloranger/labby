<script lang="ts">
  import WidgetHost from './components/WidgetHost.svelte';
  import Header from './components/Header.svelte';
  import { initStream } from '$lib/stores';
  import type { Dashboard, IntegrationRow } from '$lib/types';
  import { onMount } from 'svelte';

  let { config }: { config: Dashboard } = $props();
  let activePageIndex = $state(0);
  let page = $derived(config.pages[activePageIndex] || config.pages[0]);
  let integrationsById = $state<Map<number, IntegrationRow>>(new Map());

  onMount(() => {
    void fetch('/api/integrations')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: IntegrationRow[]) => {
        integrationsById = new Map(rows.map((r) => [r.id, r]));
      });
    return initStream();
  });

  // Entrance cascade ordered by on-screen position. CSS nth-child can't do this
  // under masonry (column-count flows top-of-col-1, top-of-col-2, … in DOM order),
  // so the stagger scattered. Sort the real rects top→left and stamp delays.
  function cascade(node: HTMLElement) {
    const cards = [...node.querySelectorAll<HTMLElement>('.card')];
    cards
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
      .forEach(({ el }, i) => {
        el.style.animationDelay = `${Math.min(i * 0.025, 0.3)}s`;
      });
  }
</script>

<Header {config} />

<main class="page">
  {#if config.pages.length > 1}
    <div class="page-h">
      <div class="page-tabs" role="tablist" aria-label="Dashboard pages">
        {#each config.pages as p, idx}
          <button
            class="page-tab"
            class:active={activePageIndex === idx}
            role="tab"
            aria-selected={activePageIndex === idx}
            onclick={() => (activePageIndex = idx)}
          >{p.name}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if config.theme?.layout === 'columns'}
    <div class="grid-columns" use:cascade>
      {#each page.columns as col}
        <div class="grid-column {col.size}">
          {#each col.widgets as widget}
            <WidgetHost {widget} integrationType={integrationsById.get(widget.integrationId)?.type} />
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid" use:cascade>
      {#each page.columns as col}
        {#each col.widgets as widget}
          <WidgetHost {widget} integrationType={integrationsById.get(widget.integrationId)?.type} />
        {/each}
      {/each}
    </div>
  {/if}
</main>

<footer class="f">labby · glass · config-as-code · no telemetry</footer>
