<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { beszelStore, searchQuery } from '$lib/stores';
  import { clampPercent, formatBytes, formatNumber, formatUptime } from '$lib/utils';

  let { title, systems, max = 8 }: { title: string; systems?: string[]; max?: number } = $props();

  const state = $derived($beszelStore);
  const q = $derived($searchQuery.trim().toLowerCase());
  const wanted = $derived(new Set((systems ?? []).map((name) => name.toLowerCase())));
  const visible = $derived.by(() => {
    const all = state.data?.systems ?? [];
    return all
      .filter((system) => wanted.size === 0 || wanted.has(system.name.toLowerCase()))
      .filter((system) => !q || system.name.toLowerCase().includes(q))
      .slice(0, max);
  });

  const avg = $derived.by(() => {
    if (!visible.length) return { cpu: 0, mem: 0, disk: 0 };
    const totals = visible.reduce(
      (acc, system) => ({
        cpu: acc.cpu + system.cpuPercent,
        mem: acc.mem + system.memoryPercent,
        disk: acc.disk + system.diskPercent,
      }),
      { cpu: 0, mem: 0, disk: 0 },
    );
    return {
      cpu: Math.round(totals.cpu / visible.length),
      mem: Math.round(totals.mem / visible.length),
      disk: Math.round(totals.disk / visible.length),
    };
  });
  const disks = $derived.by(() => {
    const visibleIds = new Set(visible.map((system) => system.id));
    const all = state.data?.disks ?? [];
    return all
      .filter((disk) => visibleIds.has(disk.systemId))
      .filter(
        (disk) =>
          !q ||
          disk.name.toLowerCase().includes(q) ||
          disk.model.toLowerCase().includes(q) ||
          disk.state.toLowerCase().includes(q),
      );
  });
  const primary = $derived(visible[0]);

  function statusClass(status: string): 'ok' | 'down' | 'warn' {
    if (status === 'up') return 'ok';
    if (status === 'down') return 'down';
    return 'warn';
  }

  function hotClass(value: number): 'hot' | 'warn' | '' {
    if (value >= 90) return 'hot';
    if (value >= 75) return 'warn';
    return '';
  }

  function diskIssueCount(disk: (typeof disks)[number]): number {
    return (
      (disk.reallocatedSectors ?? 0) +
      (disk.pendingSectors ?? 0) +
      (disk.offlineUncorrectable ?? 0) +
      (disk.mediaErrors ?? 0)
    );
  }

  function diskClass(disk: (typeof disks)[number]): 'ok' | 'down' | 'warn' {
    if (disk.state.toUpperCase() !== 'PASSED') return 'down';
    if (diskIssueCount(disk) > 0 || (disk.wearPercent ?? 0) >= 80) return 'warn';
    return 'ok';
  }

  function diskLabel(name: string): string {
    return name.replace('/dev/', '');
  }
</script>

{#if !$searchQuery.trim() || visible.length}
<section class="card beszel-card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="di:beszel" fallback="chart-no-axes-combined" size={20} /></span>
      {title}
    </span>
    <span class="meta">{state.stale ? 'stale' : 'live'}</span>
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:168px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if visible.length === 0}
    <p class="state-msg">No matching systems</p>
  {:else}
    {#if primary}
      <div class="beszel-host">
        <span class="dot {statusClass(primary.status)}"></span>
        <strong>{primary.name}</strong>
        <span>{primary.status} · up {formatUptime(primary.uptimeSeconds)}</span>
      </div>
    {/if}

    <div class="beszel-summary">
      <div>
        <span>CPU</span>
        <b class:warn={avg.cpu >= 75} class:hot={avg.cpu >= 90}>{avg.cpu}%</b>
      </div>
      <div>
        <span>RAM</span>
        <b class:warn={avg.mem >= 75} class:hot={avg.mem >= 90}>{avg.mem}%</b>
      </div>
      <div>
        <span>Disk</span>
        <b class:warn={avg.disk >= 75} class:hot={avg.disk >= 90}>{avg.disk}%</b>
      </div>
    </div>

    {#if disks.length}
      <div class="beszel-disk-head">
        <span>Storage</span>
        <b>{disks.length} disks</b>
      </div>
      <div class="beszel-disks">
        {#each disks as disk (disk.id)}
          <div class="beszel-disk">
            <div class="beszel-disk-top">
              <span class="dot {diskClass(disk)}"></span>
              <div class="beszel-disk-name">
                <strong>{diskLabel(disk.name)}</strong>
                <span>{disk.model || disk.type}</span>
              </div>
              <div class="beszel-capacity">
                <b>{formatBytes(disk.capacityBytes)}</b>
                {#if disk.usedPercent != null}
                  <span>{Math.round(disk.usedPercent)}% used</span>
                {/if}
              </div>
            </div>
            {#if disk.usedPercent != null}
              <div class="bar beszel-disk-bar {hotClass(disk.usedPercent)}">
                <i style:width="{clampPercent(disk.usedPercent)}%"></i>
              </div>
            {/if}
            <div class="beszel-smart">
              <span class="{diskClass(disk)}">{disk.state || 'unknown'}</span>
              {#if disk.tempC != null}<span>{disk.tempC}°C</span>{/if}
              {#if disk.hours != null}<span>{formatNumber(disk.hours)}h</span>{/if}
              <span>{diskIssueCount(disk)} errors</span>
              {#if disk.wearPercent != null}<span>{disk.wearPercent}% wear</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
{/if}
