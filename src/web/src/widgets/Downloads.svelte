<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { getStore, type DownloadsData, type WidgetState } from '$lib/stores';
  import { clampPercent, formatBytesPerSec, formatEta, isSeedingTorrent, prepareDownloads } from '$lib/utils';

  let {
    title,
    integrationId,
    client,
    max,
  }: { title: string; integrationId: number; client: 'qbittorrent' | 'transmission'; max?: number } = $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<DownloadsData>);
  const icon = $derived(client === 'qbittorrent' ? 'di:qbittorrent' : 'di:transmission');
  const allTorrents = $derived(state.data?.torrents ?? []);
  const counts = $derived(prepareDownloads(allTorrents, 0));
  const capped = $derived(prepareDownloads(allTorrents, max && max > 0 ? max : 8));
  const list = $derived(capped.visible);

  let listOpen = $state(false);
  let pending = $state<Record<string, boolean>>({});
  // Optimistic paused state per hash: flip the row immediately on click, then
  // clear once the live SSE state agrees (or revert if the action failed).
  let optimistic = $state<Record<string, boolean>>({});

  async function toggle(hash: string, action: 'pause' | 'resume') {
    optimistic = { ...optimistic, [hash]: action === 'pause' };
    pending = { ...pending, [hash]: true };
    try {
      const res = await fetch(`/api/integrations/${integrationId}/action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [hash] }),
      });
      if (!res.ok) throw new Error('action failed');
    } catch {
      // Revert the optimistic flip if the action did not take.
      const next = { ...optimistic };
      delete next[hash];
      optimistic = next;
    } finally {
      const p = { ...pending };
      delete p[hash];
      pending = p;
    }
  }

  // Drop the optimistic override once the live state reflects the intent.
  $effect(() => {
    for (const t of allTorrents) {
      if (t.hash in optimistic && isPaused(t.state) === optimistic[t.hash]) {
        const next = { ...optimistic };
        delete next[t.hash];
        optimistic = next;
      }
    }
  });

  function isPaused(s: string): boolean {
    // qBittorrent 5.x: stoppedUP / stoppedDL; older: pausedUP / pausedDL; transmission: stopped
    return s.includes('paused') || s.includes('stopped');
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
      <p class="state-msg">No torrents</p>
    {/if}
    <div class="dl">
      {#each list as t (t.hash)}
        {@const seed = isSeedingTorrent(t.state, t.progress)}
        {@const paused = t.hash in optimistic ? optimistic[t.hash] : isPaused(t.state)}
        <div class="tor" class:seed={seed} class:paused={paused}>
          <div class="top">
            <span class="dot {paused ? 'idle' : seed ? 'ok' : 'live'}"></span>
            <span class="tname" title={t.name}>{t.name}</span>
            <span class="pct">{Math.round(clampPercent(t.progress))}%</span>
            <button
              class="tor-action"
              title={paused ? 'Resume' : 'Pause'}
              aria-label={paused ? 'Resume torrent' : 'Pause torrent'}
              disabled={pending[t.hash]}
              onclick={() => toggle(t.hash, paused ? 'resume' : 'pause')}
            >
              <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} size={15} />
            </button>
          </div>
          <div class="bar"><i style:width="{clampPercent(t.progress)}%"></i></div>
          <div class="spd">
            <span class="dn">↓ {formatBytesPerSec(t.dlSpeed)}</span>
            <span>↑ {formatBytesPerSec(t.upSpeed)}</span>
            <span style="color:var(--ink-faint)">
              {#if paused}paused{:else if seed}seeding{#if t.ratio != null} · ratio {t.ratio.toFixed(1)}{/if}{:else}{formatEta(t.eta)}{/if}
            </span>
          </div>
        </div>
      {/each}
    </div>
    {#if capped.hidden > 0}
      <p class="state-msg">+{capped.hidden} more not shown — raise Max items to see them</p>
    {/if}
  </Modal>
{/if}

<style>
  .tor-action {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink-faint);
    cursor: pointer;
    transition:
      background 0.15s var(--ease),
      color 0.15s var(--ease);
  }
  .tor-action:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }
  .tor-action:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tor.paused {
    opacity: 0.55;
  }
  .tor.paused .bar i {
    background: var(--ink-faint);
  }
</style>
