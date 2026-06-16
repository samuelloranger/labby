<script lang="ts">
  import { Palette, Search } from 'lucide-svelte';
  import { monitorStore, searchQuery, streamConnected } from '$lib/stores';

  const themes = [
    ['light', 'Light'],
    ['light-slate', 'Slate'],
    ['light-mint', 'Mint'],
    ['light-rose', 'Rose'],
    ['dark', 'Dark'],
    ['dark-graphite', 'Graphite'],
    ['dark-ocean', 'Ocean'],
    ['dark-forest', 'Forest'],
  ] as const;

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

  async function setTheme(next: string) {
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
      // Theme is already applied locally; the next change can re-sync config.
    }
  }
</script>

<svelte:window onkeydown={onGlobalKey} />

<header class="top">
  <div class="top-in">
    <div class="brand">
      <img class="dot" class:reconnecting={!connected} src="/icons/labby.svg" alt="Labby" width="28" height="28" />
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

    <label class="theme-picker" aria-label="Color scheme">
      <Palette size={17} />
      <select bind:value={theme} onchange={(e) => setTheme(e.currentTarget.value)}>
        {#each themes as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>
  </div>
</header>
