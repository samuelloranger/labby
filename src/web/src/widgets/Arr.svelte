<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, searchQuery, type ArrData, type WidgetState } from '$lib/stores';

  let { title, integrationId, kind, max = 5 }: { title: string; integrationId: number; kind: 'radarr' | 'sonarr'; max?: number } = $props();

  const store = getStore(integrationId);
  const state: WidgetState<ArrData> = $derived($store as WidgetState<ArrData>);
  const icon = $derived(kind === 'radarr' ? 'di:radarr' : 'di:sonarr');
  const q = $derived($searchQuery.trim().toLowerCase());
  const items = $derived(
    (state.data?.upcoming ?? []).filter((item) => !q || item.title.toLowerCase().includes(q)).slice(0, max),
  );
</script>

{#if !$searchQuery.trim() || items.length}
<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon {icon} fallback={kind === 'radarr' ? 'film' : 'tv'} size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">v{state.data.version ?? 'unknown'}</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:112px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if state.data}
    <div class="gauges">
      <div class="gauge"><div class="v accent">{state.data.queue}</div><div class="k">Queued</div></div>
      <div class="gauge"><div class="v">{state.data.missing ?? '—'}</div><div class="k">Missing</div></div>
    </div>

    {#if items.length}
      <div class="list-head">Upcoming releases</div>
      <div class="mini-list">
        {#each items as item (item.id)}
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
</style>
