<script lang="ts">
  import WidgetHost from './components/WidgetHost.svelte';
  import Header from './components/Header.svelte';
  import { initStream } from '$lib/stores';
  import type { Dashboard } from '$lib/types';
  import { onMount } from 'svelte';

  let { config }: { config: Dashboard } = $props();
  let page = $derived(config.pages[0]);

  onMount(() => {
    const cleanup = initStream();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mon = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const d = new Date();
    const el = document.getElementById('sub');
    if (el) el.textContent = `${days[d.getDay()]}, ${mon[d.getMonth()]} ${d.getDate()}`;
    return cleanup;
  });
</script>

<Header title={config.title} />

<main class="page">
  <div class="page-h">
    <h1>{page.name}</h1>
    <span class="sub" id="sub"></span>
  </div>

  <div class="grid">
    {#each page.columns as col}
      <div class="col">
        {#each col.widgets as widget}
          <WidgetHost {widget} />
        {/each}
      </div>
    {/each}
  </div>
</main>

<footer class="f">labby · glass · config-as-code · no telemetry</footer>
