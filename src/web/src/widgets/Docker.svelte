<script lang="ts">
  import { FileText, Play, RotateCcw, Square } from 'lucide-svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { getStore, searchQuery, type DockerData, type WidgetState } from '$lib/stores';

  let { title, integrationId }: { title: string; integrationId: number } = $props();

  const store = getStore(integrationId);
  const state = $derived($store as WidgetState<DockerData>);
  const q = $derived($searchQuery.trim().toLowerCase());
  const all = $derived(state.data?.containers ?? []);
  const total = $derived(all.length);
  const avgCpu = $derived.by(() => {
    const v = all.map((c) => c.cpuPercent).filter((c): c is number => c != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  });
  const containers = $derived(
    all
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1) || a.name.localeCompare(b.name)),
  );

  let listOpen = $state(false);
  let pending = $state<Record<string, string>>({});
  let logsOpen = $state(false);
  let logsText = $state('');
  let logsTitle = $state('');

  async function action(id: string, act: 'start' | 'stop' | 'restart') {
    pending = { ...pending, [id]: act };
    try {
      await fetch(`/api/integrations/${integrationId}/action/${act}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [id] }),
      });
    } finally {
      const next = { ...pending };
      delete next[id];
      pending = next;
    }
  }

  async function showLogs(id: string, name: string) {
    logsTitle = name;
    logsOpen = true;
    logsText = 'Loading…';
    try {
      const res = await fetch(`/api/integrations/${integrationId}/logs/${id}?tail=200`);
      const data = await res.json();
      logsText = data.logs ?? data.error ?? 'No logs';
    } catch {
      logsText = 'Failed to load logs';
    }
  }

  function containerIcon(name: string): string {
    return `di:${name.replace(/-dev$|-server$|-frontend$/, '')}`;
  }
</script>

<button class="card summary-card" onclick={() => (listOpen = true)} disabled={!state.data}>
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="di:docker" fallback="box" size={17} /></span>
      {title}
    </span>
    <span class="meta">{state.stale ? 'stale' : 'live'}</span>
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:72px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else}
    <div class="gauges">
      <div class="gauge"><div class="v">{total}</div><div class="k">Running</div></div>
      <div class="gauge"><div class="v accent">{avgCpu}%</div><div class="k">Avg CPU</div></div>
    </div>
    <div class="card-cta">View containers →</div>
  {/if}
</button>

{#if listOpen}
  <Modal title="Containers" meta={`${total} running`} onClose={() => (listOpen = false)}>
    {#if containers.length === 0}
      <p class="state-msg">No matching containers</p>
    {/if}
    {#each containers as c (c.id)}
      <div class="ctr">
        <span class="dot {c.state === 'running' ? 'ok' : c.state === 'exited' ? 'down' : 'warn'}"></span>
        <Icon icon={containerIcon(c.name)} fallback="box" class="clogo" size={28} />
        <div>
          <div class="cname">{c.name}</div>
          <div class="cimg">
            {#if c.state === 'exited'}exited ({c.exitCode ?? '?'}) · {c.status}{:else}{c.image}{/if}
          </div>
        </div>
        <div class="usage">
          {#if c.state === 'running' && c.cpuPercent != null}
            cpu <span class="meter" class:hot={c.cpuPercent > 50}><i style:width="{c.cpuPercent}%"></i></span>
            {c.cpuPercent}%
          {:else}
            <span style="color:var(--ink-faint)">—</span>
          {/if}
        </div>
        <div class="ctrls">
          <button class="btn" title="logs" onclick={() => showLogs(c.id, c.name)}><FileText size={16} /></button>
          {#if c.state === 'running'}
            <button class="btn stop" class:pending={pending[c.id] === 'stop'} disabled={pending[c.id] !== undefined} title="stop" onclick={() => action(c.id, 'stop')}><Square size={16} /></button>
            <button class="btn" class:pending={pending[c.id] === 'restart'} disabled={pending[c.id] !== undefined} title="restart" onclick={() => action(c.id, 'restart')}><RotateCcw size={16} /></button>
          {:else}
            <button class="btn go" class:pending={pending[c.id] === 'start'} disabled={pending[c.id] !== undefined} title="start" onclick={() => action(c.id, 'start')}><Play size={16} /></button>
            <button class="btn" class:pending={pending[c.id] === 'restart'} disabled={pending[c.id] !== undefined} title="restart" onclick={() => action(c.id, 'restart')}><RotateCcw size={16} /></button>
          {/if}
        </div>
      </div>
    {/each}
  </Modal>
{/if}

{#if logsOpen}
  <Modal title={`${logsTitle} logs`} onClose={() => (logsOpen = false)}>
    <pre class="modal-pre">{logsText}</pre>
  </Modal>
{/if}
