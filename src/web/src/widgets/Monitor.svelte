<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, searchQuery, type MonitorData, type WidgetState } from '$lib/stores';

  let {
    title,
    integrationId,
    style = 'default',
    variant = 'rows',
    headerIcon = 'lucide:activity',
  }: {
    title: string;
    integrationId: number;
    style?: 'compact' | 'default';
    variant?: 'rows' | 'tiles';
    headerIcon?: string;
  } = $props();

  const store = getStore(integrationId);
  const state = $derived($store as WidgetState<MonitorData>);

  const rows = $derived(state.data?.sites ?? []);

  const q = $derived($searchQuery.trim().toLowerCase());
  const shown = $derived(q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows);
  const hideCard = $derived(q !== '' && shown.length === 0);

  const summary = $derived.by(() => ({
    up: shown.filter((x) => x.status === 'up').length,
    warn: shown.filter((x) => x.status === 'warn').length,
    down: shown.filter((x) => x.status === 'down').length,
  }));
</script>

{#if !hideCard}
<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon={headerIcon} fallback="activity" size={17} /></span>
      {title}
    </span>
    {#if !state.loading && !state.error}
      <span class="meta">{summary.up + summary.warn + summary.down > 0 ? `${summary.up} / ${shown.length} up` : ''}</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:48px"></div>
  {:else if state.error && shown.length === 0}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if shown.length === 0}
    <p class="state-msg">No sites configured</p>
  {:else if variant === 'tiles'}
    <div class="tiles">
      {#each shown as site}
        <a class="tile" href={site.url ?? '#'} target="_blank" rel="noopener">
          <span class="dot {site.status === 'up' ? 'ok' : site.status === 'warn' ? 'warn' : 'down'}"></span>
          <span class="tic"><Icon icon={site.icon} fallback="layout-grid" size={28} /></span>
          <span class="lbl">{site.title}</span>
        </a>
      {/each}
    </div>
  {:else}
    <div class="rows">
      {#each shown as site}
        <div class="row" class:bad={site.status === 'down'}>
          <span class="dot {site.status === 'up' ? 'ok' : site.status === 'warn' ? 'warn' : 'down'}"></span>
          <Icon icon={site.icon} fallback="globe" size={20} />
          {#if site.url}
            <a class="name" href={site.url} target="_blank" rel="noopener">{site.title}</a>
          {:else}
            <span class="name">{site.title}</span>
          {/if}
          <span class="ms">{site.latencyMs != null ? `${site.latencyMs}ms` : 'timeout'}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>
{/if}
