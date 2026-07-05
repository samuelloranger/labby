<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type ReelwardData, type WidgetState } from '$lib/stores';

  let { title, integrationId, max = 5 }: { title: string; integrationId: number; max?: number } = $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<ReelwardData>);
  const upcoming = $derived((state.data?.upcoming ?? []).slice(0, max));
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="/icons/reelward.png" fallback="clapperboard" size={20} /></span>
      {title}
    </span>
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

    {#if upcoming.length}
      <div class="list-head">Upcoming releases</div>
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

<style>
  .list-head {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-dim);
    margin-bottom: 6px;
  }
</style>
