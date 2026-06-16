<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { qbStore, trStore, searchQuery } from '$lib/stores';
  import { clampPercent, formatBytesPerSec, formatEta, isSeedingTorrent, prepareDownloads } from '$lib/utils';

  let { title, client }: { title: string; client: 'qbittorrent' | 'transmission'; max?: number } = $props();

  const state = $derived(client === 'qbittorrent' ? $qbStore : $trStore);
  const icon = $derived(client === 'qbittorrent' ? 'di:qbittorrent' : 'di:transmission');
  const q = $derived($searchQuery.trim().toLowerCase());
  const allTorrents = $derived(state.data?.torrents ?? []);
  const counts = $derived(prepareDownloads(allTorrents, 0));
  const filtered = $derived(allTorrents.filter((t) => !q || t.name.toLowerCase().includes(q)));
  const list = $derived(prepareDownloads(filtered, filtered.length).visible);

  let listOpen = $state(false);
  let pending = $state<Record<string, boolean>>({});

  async function toggle(hash: string, action: 'pause' | 'resume') {
    pending = { ...pending, [hash]: true };
    try {
      await fetch(`/api/downloads/${client}/${hash}/${action}`, { method: 'POST' });
    } finally {
      const next = { ...pending };
      delete next[hash];
      pending = next;
    }
  }

  function isActive(s: string, progress: number): boolean {
    return !isSeedingTorrent(s, progress) && (s.includes('down') || progress < 100);
  }
</script>

<button class="card summary-card" onclick={() => (listOpen = true)} disabled={!state.data}>
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon {icon} fallback="download" size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">↓ {formatBytesPerSec(state.data.aggregateDlSpeed)} · ↑ {formatBytesPerSec(state.data.aggregateUpSpeed)}</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:72px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else}
    <div class="gauges">
      <div class="gauge"><div class="v accent">{counts.downloading}</div><div class="k">Downloading</div></div>
      <div class="gauge"><div class="v">{counts.seeding}</div><div class="k">Seeding</div></div>
    </div>
    <div class="card-cta">View torrents →</div>
  {/if}
</button>

{#if listOpen}
  <Modal title={title} meta={`${allTorrents.length} torrents`} onClose={() => (listOpen = false)}>
    {#if list.length === 0}
      <p class="state-msg">No matching torrents</p>
    {/if}
    <div class="dl">
      {#each list as t (t.hash)}
        {@const seed = isSeedingTorrent(t.state, t.progress)}
        {@const active = isActive(t.state, t.progress)}
        <div class="tor" class:seed={seed}>
          <div class="top">
            <span class="dot {active ? 'live' : seed ? 'ok' : 'idle'}"></span>
            <button
              class="tname"
              style="background:none;border:none;cursor:pointer;text-align:left;padding:0"
              title={active ? 'Pause' : 'Resume'}
              disabled={pending[t.hash]}
              onclick={() => toggle(t.hash, active ? 'pause' : 'resume')}
            >{t.name}</button>
            <span class="pct">{Math.round(clampPercent(t.progress))}%</span>
          </div>
          <div class="bar"><i style:width="{clampPercent(t.progress)}%"></i></div>
          <div class="spd">
            <span class="dn">↓ {formatBytesPerSec(t.dlSpeed)}</span>
            <span>↑ {formatBytesPerSec(t.upSpeed)}</span>
            <span style="color:var(--ink-faint)">
              {#if seed}seeding{#if t.ratio != null} · ratio {t.ratio.toFixed(1)}{/if}{:else}{formatEta(t.eta)}{/if}
            </span>
          </div>
        </div>
      {/each}
    </div>
  </Modal>
{/if}
