<script lang="ts">
  import { ChevronLeft, ChevronRight, Film, Play } from '@lucide/svelte';
  import Icon from '../components/Icon.svelte';
  import { getStore, type RecentMediaItem, type WidgetState } from '$lib/stores';
  import { clampPercent } from '$lib/utils';

  type MediaType = 'jellyfin' | 'emby' | 'plex';
  type MediaSession = {
    id: string;
    title: string;
    subtitle: string;
    user: string;
    device: string;
    progress: number;
    posterUrl?: string;
    isTranscoding: boolean;
  };
  type MediaData = { sessions: MediaSession[]; playing: number };
  type MediaOverview = MediaData & {
    sessionError?: string;
    recent?: RecentMediaItem[];
    recentError?: string;
  };

  let { title, integrationId, type }: { title: string; integrationId: number; type: MediaType } =
    $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<MediaOverview>);
  const icon = $derived(`di:${type}`);
  let recentTrack = $state<HTMLDivElement | null>(null);

  function posterSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    // Server emits `/api/<type>/image...`; rewrite to the per-integration proxy route.
    return url.replace(`/api/${type}/image`, `/api/integrations/${integrationId}/${type}-image`);
  }

  function scrollRecent(direction: -1 | 1) {
    recentTrack?.scrollBy({ left: direction * recentTrack.clientWidth * 0.8, behavior: 'smooth' });
  }
</script>

<section class="card" class:stale={state.stale}>
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon {icon} fallback="film" size={20} /></span>
      {title}
    </span>
    {#if state.data}
      <span class="meta">{state.data.playing} playing</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:72px"></div>
  {:else if state.error && !state.data}
    <p class="state-msg error" role="alert"><span class="dot down" aria-hidden="true"></span>{state.error}</p>
  {:else if state.data?.sessionError}
    <p class="state-msg error" role="alert"><span class="dot down" aria-hidden="true"></span>{state.data.sessionError}</p>
  {:else if !state.data?.sessions?.length}
    <p class="state-msg empty">No active sessions</p>
  {:else}
    <div class="sess">
      {#each state.data.sessions as s}
        <div class="jf">
          <div class="poster">
            {#if s.posterUrl}
              <img src={posterSrc(s.posterUrl)} alt="" />
            {:else}
              <Play size={18} />
            {/if}
          </div>
          <div class="info">
            <div class="cti">{s.title}</div>
            <div class="sub">{s.subtitle}</div>
            <div class="who">{s.user} · {s.device}</div>
            <!-- No percentage is printed next to this bar, so it has to carry the value itself. -->
            <div
              class="bar"
              role="progressbar"
              aria-label="{s.title} playback progress"
              aria-valuenow={Math.round(clampPercent(s.progress))}
              aria-valuemin="0"
              aria-valuemax="100"
            ><i style:width="{clampPercent(s.progress)}%"></i></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if type !== 'emby' && state.data}
    <div class="recent-head">
      <span>Recently added</span>
      {#if (state.data.recent?.length ?? 0) > 1}
        <div class="recent-controls">
          <button type="button" aria-label="Scroll recent media left" onclick={() => scrollRecent(-1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Scroll recent media right" onclick={() => scrollRecent(1)}><ChevronRight size={16} /></button>
        </div>
      {/if}
    </div>
    {#if state.data.recentError}
      <p class="state-msg error" role="alert">{state.data.recentError}</p>
    {:else if !state.data.recent?.length}
      <p class="state-msg empty">No recent additions</p>
    {:else}
      <div class="recent-track" bind:this={recentTrack} role="list" aria-label="Recently added movies and TV">
        {#each state.data.recent as item (item.id)}
          <div class="recent-item" role="listitem" title={item.title + (item.subtitle ? ` · ${item.subtitle}` : '')}>
            <div class="recent-poster">
              {#if item.posterUrl}
                <img src={posterSrc(item.posterUrl)} alt="" loading="lazy" />
              {:else}
                <Film size={25} aria-hidden="true" />
              {/if}
            </div>
            <span class="recent-title">{item.title}</span>
            <span class="recent-subtitle">{item.subtitle || (item.kind === 'movie' ? 'Movie' : 'TV')}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
