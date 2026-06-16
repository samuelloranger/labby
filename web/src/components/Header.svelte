<script lang="ts">
  import { Moon, Search, Sun } from 'lucide-svelte';
  import { monitorStore, searchQuery, streamConnected } from '$lib/stores';

  let { title = 'Labby' }: { title?: string } = $props();

  const monitor = $derived($monitorStore);
  const connected = $derived($streamConnected);

  let theme = $state(document.documentElement.dataset.theme ?? 'light');
  let searchEl = $state<HTMLInputElement>();

  const summary = $derived(monitor.data?.summary ?? { up: 0, warn: 0, down: 0 });

  // "/" focuses search; ignore when already typing in a field.
  function onGlobalKey(e: KeyboardEvent) {
    if (e.key !== '/') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    e.preventDefault();
    searchEl?.focus();
  }

  async function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    theme = next;
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('labby-theme', next);
    } catch {
      /* ignore */
    }
    try {
      await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      // Theme is already applied locally + persisted to localStorage; the next
      // toggle (or page load) will re-sync the server cookie.
    }
  }
</script>

<svelte:window onkeydown={onGlobalKey} />

<header class="top">
  <div class="top-in">
    <div class="brand">
      <span class="dot" class:reconnecting={!connected}>L</span>
      <span>{title.toLowerCase()}</span>
    </div>

    <div class="searchpill">
      <input
        placeholder="Search services, containers…"
        aria-label="Search services, containers and torrents"
        bind:value={$searchQuery}
        bind:this={searchEl}
        onkeydown={(e) => { if (e.key === 'Escape') { $searchQuery = ''; searchEl?.blur(); } }}
      />
      <span class="go"><Search size={16} color="#fff" strokeWidth={2.5} /></span>
    </div>

    <div class="summary">
      <span class="chip" title="Services up"><span class="dot ok"></span><b>{summary.up}</b></span>
      <span class="chip" title="Warnings"><span class="dot warn"></span><b>{summary.warn}</b></span>
      <span class="chip" title="Services down"><span class="dot down"></span><b>{summary.down}</b></span>
    </div>

    <button class="iconbtn" aria-label="Toggle theme" onclick={toggleTheme}>
      {#if theme === 'dark'}
        <Sun size={20} />
      {:else}
        <Moon size={20} />
      {/if}
    </button>
  </div>
</header>
