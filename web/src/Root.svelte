<script lang="ts">
  import App from './App.svelte';
  import type { Dashboard } from '$lib/types';
  import { onMount } from 'svelte';

  let config = $state<Dashboard | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load config');
      config = data;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Config error';
    }
  });
</script>

{#if error}
  <main class="page"><p class="state-msg error">{error}</p></main>
{:else if config}
  <App {config} />
{:else}
  <main class="page"><div class="skeleton" style="height:120px"></div></main>
{/if}
