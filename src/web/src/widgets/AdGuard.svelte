<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { adguardStore, searchQuery } from '$lib/stores';
  import { formatNumber } from '$lib/utils';

  let { title }: { title: string } = $props();
  const state = $derived($adguardStore);
  let toggling = $state(false);

  async function toggleProtection() {
    if (!state.data || toggling) return;
    toggling = true;
    try {
      await fetch('/api/adguard/protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !state.data.protectionEnabled }),
      });
    } finally {
      toggling = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      void toggleProtection();
    }
  }
</script>

{#if !$searchQuery.trim()}
<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="di:adguard-home" fallback="shield" size={20} /></span>
      {title}
    </span>
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:120px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if state.data}
    <div class="gauges">
      <div class="gauge"><div class="v">{formatNumber(state.data.queries)}</div><div class="k">Queries · 24h</div></div>
      <div class="gauge"><div class="v accent">{state.data.blockedPercent}%</div><div class="k">Blocked</div></div>
      <div class="gauge"><div class="v">{state.data.avgLatencyMs}ms</div><div class="k">Avg latency</div></div>
      <div class="gauge"><div class="v">{formatNumber(state.data.rulesCount)}</div><div class="k">Rules</div></div>
    </div>
    <div class="toggle-row">
      <span class="k">Protection</span>
      <button
        class="sw"
        class:on={state.data.protectionEnabled}
        role="switch"
        aria-checked={state.data.protectionEnabled}
        aria-label="Toggle AdGuard protection"
        disabled={toggling}
        onclick={toggleProtection}
        onkeydown={onKey}
      ><i></i></button>
    </div>
  {/if}
</section>
{/if}
