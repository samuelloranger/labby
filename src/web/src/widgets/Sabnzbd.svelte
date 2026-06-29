<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type SabnzbdData, type WidgetState } from '$lib/stores';
  import { clampPercent, formatBytesPerSec } from '$lib/utils';

  let { title, integrationId, max }: { title: string; integrationId: number; max?: number } =
    $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<SabnzbdData>);
  const slots = $derived((state.data?.slots ?? []).slice(0, max && max > 0 ? max : undefined));

  let pending = $state<Record<string, boolean>>({});
  let optimistic = $state<Record<string, boolean>>({});

  function isPaused(status: string): boolean {
    return status.toLowerCase() === 'paused';
  }

  async function toggle(id: string, action: 'pause' | 'resume') {
    optimistic = { ...optimistic, [id]: action === 'pause' };
    pending = { ...pending, [id]: true };
    try {
      const res = await fetch(`/api/integrations/${integrationId}/action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [id] }),
      });
      if (!res.ok) throw new Error('action failed');
    } catch {
      const next = { ...optimistic };
      delete next[id];
      optimistic = next;
    } finally {
      const p = { ...pending };
      delete p[id];
      pending = p;
    }
  }

  // Drop the optimistic override once live state agrees.
  $effect(() => {
    for (const s of state.data?.slots ?? []) {
      if (s.id in optimistic && isPaused(s.status) === optimistic[s.id]) {
        const next = { ...optimistic };
        delete next[s.id];
        optimistic = next;
      }
    }
  });
</script>

<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="di:sabnzbd" fallback="download" size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">
        {#if state.data.paused}paused{:else}↓ {formatBytesPerSec(state.data.speedBps)}{/if}
        {#if state.data.slots.length} · {state.data.timeLeft}{/if}
      </span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:72px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if !slots.length}
    <p class="state-msg empty">Queue empty</p>
  {:else}
    <div class="dl">
      {#each slots as s (s.id)}
        {@const paused = s.id in optimistic ? optimistic[s.id] : isPaused(s.status)}
        <div class="tor" class:paused={paused}>
          <div class="top">
            <span class="dot {paused ? 'idle' : 'live'}"></span>
            <span class="tname" title={s.name}>{s.name}</span>
            <span class="pct">{Math.round(clampPercent(s.progress))}%</span>
            <button
              class="tor-action"
              title={paused ? 'Resume' : 'Pause'}
              aria-label={paused ? 'Resume download' : 'Pause download'}
              disabled={pending[s.id]}
              onclick={() => toggle(s.id, paused ? 'resume' : 'pause')}
            >
              <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} size={15} />
            </button>
          </div>
          <div class="bar"><i style:width="{clampPercent(s.progress)}%"></i></div>
          <div class="spd">
            <span style="color:var(--ink-faint)">
              {paused ? 'paused' : s.status.toLowerCase()} · {s.timeLeft || '—'}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

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
