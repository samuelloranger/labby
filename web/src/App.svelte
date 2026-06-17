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
    const cleanup = initStream();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mon = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const el = document.getElementById('sub');
    const tick = () => {
      const d = new Date();
      const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (el) el.textContent = `${days[d.getDay()]}, ${mon[d.getMonth()]} ${d.getDate()} · ${t}`;
    };
    tick();
    // ponytail: 1s tick; minute-aligned timer if battery ever matters
    const timer = setInterval(tick, 1000);
    return () => { clearInterval(timer); cleanup(); };
  });
</script>

<Header title={config.title} />

<main class="page">
  <div class="page-h">
    {#if config.pages.length > 1}
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
    {:else}
      <h1>{page.name}</h1>
    {/if}
    <span class="sub" id="sub"></span>
  </div>

  <div class="grid">
    {#each page.columns as col}
      {#each col.widgets as widget}
        <WidgetHost {widget} />
      {/each}
    {/each}
  </div>
</main>

<footer class="f">labby · glass · config-as-code · no telemetry</footer>
