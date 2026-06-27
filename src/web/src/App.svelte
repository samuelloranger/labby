<script lang="ts">
  import WidgetHost from './components/WidgetHost.svelte';
  import Header from './components/Header.svelte';
  import { initStream } from '$lib/stores';
  import type { Dashboard, IntegrationRow } from '$lib/types';
  import { onMount } from 'svelte';

  let { config }: { config: Dashboard } = $props();
  let integrations = $state<IntegrationRow[]>([]);

  const visible = $derived(
    [...integrations].filter((r) => r.enabled).sort((a, b) => a.position - b.position || a.id - b.id),
  );

  onMount(() => {
    void fetch('/api/integrations')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: IntegrationRow[]) => {
        integrations = rows;
      });
    return initStream();
  });
</script>

<Header {config} {integrations} />

<main class="page">
  <div class="grid">
    {#each visible as integration (integration.id)}
      <WidgetHost {integration} />
    {/each}
  </div>
</main>
