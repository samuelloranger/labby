<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type TennisData, type WidgetState } from '$lib/stores';

  let { title, integrationId, max = 5 }: { title: string; integrationId: number; max?: number } = $props();
  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<TennisData>);
  const limit = $derived(Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 5);
  const matches = $derived((state.data?.matches ?? []).slice(0, limit));
</script>

<section class="card" class:stale={state.stale}>
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="lucide:activity" fallback="activity" size={20} /></span>
      {title}
    </span>
    <span class="meta">15 min snapshots</span>
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:120px"></div>
  {:else if state.error}
    <p class="state-msg error" role="alert">{state.error}</p>
  {:else}
    {#if state.data}
      <p class="snapshot-time">Fetched <time datetime={state.data.fetchedAt}>{new Date(state.data.fetchedAt).toLocaleString()}</time></p>
    {/if}
    {#if !matches.length}
      <p class="state-msg">No matches in progress at this check</p>
    {:else}
      <div class="tennis-matches">
        {#each matches as match (match.id)}
          <table>
            <caption>
              {match.tournament}
              {#if match.eventStatus}<span> · {match.eventStatus}</span>{/if}
              {#if match.tiebreak}<span> · Tiebreak</span>{/if}
              {#if match.stale}<span> · Score may be stale</span>{/if}
            </caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                {#each match.games?.[0] ?? [] as _, i}<th scope="col">S{i + 1}</th>{/each}
                <th scope="col">Pts</th>
              </tr>
            </thead>
            <tbody>
              {#each match.players as player, i}
                <tr>
                  <th scope="row">{player}{#if match.server === i + 1}<span aria-label="Serving"> ●</span>{/if}</th>
                  {#each match.games?.[i] ?? [] as games}<td>{games}</td>{/each}
                  <td>{match.points[i] ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/each}
      </div>
      {#if (state.data?.matches.length ?? 0) > matches.length}
        <p class="snapshot-time">Showing {matches.length} of {state.data?.matches.length} matches</p>
      {/if}
    {/if}
    {#if state.data?.hasMore}
      <p class="snapshot-time">More matches are in progress; this snapshot contains only the first page.</p>
    {/if}
  {/if}
</section>

<style>
  .snapshot-time { padding: 0 1rem 0.5rem; margin: 0; font-size: 0.75rem; color: var(--ink-dim); }
  .tennis-matches { padding: 0 1rem 1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.8rem; }
  caption { text-align: left; color: var(--ink-dim); margin-bottom: 0.3rem; overflow-wrap: anywhere; }
  th, td { padding: 0.25rem; text-align: center; font-variant-numeric: tabular-nums; }
  th:first-child { text-align: left; overflow-wrap: anywhere; }
  th[scope="row"] { font-weight: 500; }
  thead { font-size: 0.65rem; color: var(--ink-dim); }
</style>
