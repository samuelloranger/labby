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
    <div class="grid-columns">
      {#each page.columns as col}
        <div class="grid-column {col.size}">
          {#each col.widgets as widget}
            <WidgetHost {widget} integrationType={integrationsById.get(widget.integrationId)?.type} />
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid">
      {#each page.columns as col}
        {#each col.widgets as widget}
          <WidgetHost {widget} integrationType={integrationsById.get(widget.integrationId)?.type} />
        {/each}
      {/each}
    </div>
  {/if}
</main>
