<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, searchQuery, type SpeedtestData, type WidgetState } from '$lib/stores';

  let { title, integrationId, max = 5 }: { title: string; integrationId: number; max?: number } = $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<SpeedtestData>);
  const data = $derived(state.data);
  const latest = $derived(data?.latest);
  const history = $derived((data?.history ?? []).slice(0, max));

  let pending = $state(false);

  function formatSpeed(bps: number): string {
    if (bps == null || Number.isNaN(bps) || bps === 0) return '—';
    if (bps >= 1_000_000_000) {
      return `${(bps / 1_000_000_000).toFixed(1)} Gbps`;
    }
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      );
    } catch {
      return '';
    }
  }

  // Calculate SVG line points for the history chart
  const chartPoints = $derived.by(() => {
    const pts = (data?.history ?? []).slice(0, 10).reverse();
    if (pts.length < 2) return null;

    const width = 300;
    const height = 80;
    const padding = 8;
    const bottomY = height - padding;

    const maxSpeed = Math.max(...pts.map((p) => Math.max(p.download, p.upload)), 1_000_000);

    const dlCoords = pts.map((p, idx) => {
      const x = padding + (idx / (pts.length - 1)) * (width - 2 * padding);
      const y = height - padding - (p.download / maxSpeed) * (height - 2 * padding);
      return { x, y };
    });

    const ulCoords = pts.map((p, idx) => {
      const x = padding + (idx / (pts.length - 1)) * (width - 2 * padding);
      const y = height - padding - (p.upload / maxSpeed) * (height - 2 * padding);
      return { x, y };
    });

    const dlLine = dlCoords.map((c) => `${c.x},${c.y}`).join(' ');
    const ulLine = ulCoords.map((c) => `${c.x},${c.y}`).join(' ');

    const dlFill = `${padding},${bottomY} ${dlLine} ${width - padding},${bottomY}`;

    return {
      dlLine,
      ulLine,
      dlFill,
      width,
      height,
      padding,
    };
  });

  async function triggerRun() {
    if (pending) return;
    pending = true;
    try {
      const initialLatestId = latest?.id;
      await fetch(`/api/integrations/${integrationId}/action/run`, { method: 'POST' });

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        if (state.data?.latest && state.data.latest.id !== initialLatestId) {
          break;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      pending = false;
    }
  }
</script>

{#if !$searchQuery.trim()}
<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="/icons/speedtest-tracker.svg" fallback="gauge" size={20} /></span>
      {title}
    </span>
    <button
      class="btn-run"
      disabled={pending || state.loading}
      onclick={triggerRun}
      title="Run speed test now"
    >
      {#if pending}
        <span class="spinner-icon"></span>
        <span class="btn-text">Running...</span>
      {:else}
        <Icon icon="lucide:play" fallback="play" size={14} />
        <span class="btn-text">Run Test</span>
      {/if}
    </button>
  </div>

  {#if state.loading && !data}
    <div class="skeleton" style="height:160px"></div>
  {:else if state.error && !data}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if data}
    <div class="gauges">
      <div class="gauge">
        <div class="v accent">{formatSpeed(latest?.download ?? 0)}</div>
        <div class="k">Download</div>
      </div>
      <div class="gauge">
        <div class="v">{formatSpeed(latest?.upload ?? 0)}</div>
        <div class="k">Upload</div>
      </div>
      <div class="gauge">
        <div class="v">{latest?.ping ? `${latest.ping} ms` : '—'}</div>
        <div class="k">Latency</div>
      </div>
    </div>

    {#if chartPoints}
      <div class="chart-container">
        <svg viewBox="0 0 {chartPoints.width} {chartPoints.height}" class="sparkline-svg">
          <defs>
            <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25" />
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
            </linearGradient>
          </defs>

          <!-- Grid horizontal lines -->
          <line x1="{chartPoints.padding}" y1="{chartPoints.height / 2}" x2="{chartPoints.width - chartPoints.padding}" y2="{chartPoints.height / 2}" stroke="var(--surface-2)" stroke-width="0.5" stroke-dasharray="2 2" />

          <!-- Download Gradient Area Fill -->
          <polygon points={chartPoints.dlFill} fill="url(#dlGrad)" />

          <!-- Download Line -->
          <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points={chartPoints.dlLine} />

          <!-- Upload Line -->
          <polyline fill="none" stroke="var(--ink-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3" points={chartPoints.ulLine} />
        </svg>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot dl"></span> Download</span>
          <span class="legend-item"><span class="legend-dot ul"></span> Upload</span>
        </div>
      </div>
    {/if}

    {#if history.length > 0}
      <div class="history-list">
        {#each history as item (item.id)}
          <div class="history-item">
            <div class="history-meta">
              <span class="history-time">{formatDate(item.createdAt)}</span>
            </div>
            <div class="history-speeds">
              <span class="history-dl">{formatSpeed(item.download)}</span>
              <span class="history-ul">{formatSpeed(item.upload)}</span>
              <span class="history-ping">{item.ping} ms</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
{/if}

<style>
  .btn-run {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--glass-brd);
    color: var(--ink);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s var(--ease);
  }

  .btn-run:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--ink);
  }

  .btn-run:active:not(:disabled) {
    transform: scale(0.95);
  }

  .btn-run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-text {
    font-family: var(--font);
  }

  .spinner-icon {
    width: 12px;
    height: 12px;
    border: 2px solid var(--ink-faint);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .chart-container {
    margin: 16px 0 8px;
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: 10px;
    border: 1px solid var(--glass-brd);
  }

  .sparkline-svg {
    width: 100%;
    height: 90px;
    display: block;
  }

  .chart-legend {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 6px;
    font-size: 0.75rem;
    color: var(--ink-dim);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-dot.dl {
    background: var(--accent);
  }

  .legend-dot.ul {
    border: 1.5px dashed var(--ink-dim);
    width: 7px;
    height: 7px;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    border-top: 1px solid var(--glass-brd);
    padding-top: 12px;
  }

  .history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .history-time {
    color: var(--ink-dim);
  }

  .history-speeds {
    display: flex;
    gap: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .history-dl {
    color: var(--accent);
  }

  .history-ul {
    color: var(--ink-dim);
  }

  .history-ping {
    color: var(--ink-faint);
    min-width: 40px;
    text-align: right;
  }
</style>
