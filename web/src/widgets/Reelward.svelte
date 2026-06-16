<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { reelwardStore, searchQuery } from '$lib/stores';

  let { title, max = 5 }: { title: string; max?: number } = $props();

  const state = $derived($reelwardStore);
  const q = $derived($searchQuery.trim().toLowerCase());
  const upcoming = $derived(
    (state.data?.upcoming ?? []).filter((item) => !q || item.title.toLowerCase().includes(q)).slice(0, max),
  );
  const online = $derived((state.data?.trackers ?? []).filter((tracker) => tracker.connected).length);
</script>

{#if !$searchQuery.trim() || upcoming.length}
<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="lucide:clapperboard" fallback="clapperboard" size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">{online}/{state.data.trackers.length} trackers</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:132px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if state.data}
    <div class="gauges">
      <div class="gauge"><div class="v accent">{upcoming.length}</div><div class="k">Upcoming</div></div>
      <div class="gauge"><div class="v">{state.data.rss.releasesGrabbed ?? '—'}</div><div class="k">RSS grabs</div></div>
    </div>

    <div class="list-head">Trackers · ratio</div>
    <div class="mini-list">
      {#each state.data.trackers as tracker (tracker.name)}
        <div class="mini-row">
          <span class="dot {tracker.connected ? 'ok' : 'warn'}"></span>
          <span>{tracker.name}</span>
          <b>{tracker.ratio == null ? '—' : tracker.ratio.toFixed(2)}</b>
        </div>
      {/each}
    </div>

    {#if upcoming.length}
      <div class="list-head top-gap">Upcoming releases</div>
      <div class="mini-list">
        {#each upcoming as item (item.id)}
          <div class="mini-row">
            <span class="dot live"></span>
            <span>{item.title}</span>
            <b>{item.date ? new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'TBD'}</b>
          </div>
        {/each}
      </div>
    {:else}
      <p class="state-msg empty">No upcoming releases</p>
    {/if}
  {/if}
</section>
{/if}

<style>
  .list-head {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-dim);
    margin-bottom: 6px;
  }
  .list-head.top-gap {
    margin-top: 14px;
  }
</style>
