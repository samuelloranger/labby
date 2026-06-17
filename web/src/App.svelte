<script lang="ts">
  import WidgetHost from './components/WidgetHost.svelte';
  import Header from './components/Header.svelte';
  import { initStream } from '$lib/stores';
  import type { Dashboard } from '$lib/types';
  import { onMount } from 'svelte';

  let { config }: { config: Dashboard } = $props();
  let activePageIndex = $state(0);
  let page = $derived(config.pages[activePageIndex] || config.pages[0]);

  onMount(() => {
    return initStream();
  });
</script>

<Header title={config.title} />

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

  <div class="grid">
    {#each page.columns as col}
      {#each col.widgets as widget}
        <WidgetHost {widget} />
      {/each}
    {/each}
  </div>
</main>

<footer class="f">labby · glass · config-as-code · no telemetry</footer>
