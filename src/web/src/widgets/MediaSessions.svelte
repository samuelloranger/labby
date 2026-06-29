<script lang="ts">
  import { Play } from 'lucide-svelte';
  import Icon from '../components/Icon.svelte';
  import { getStore, type WidgetState } from '$lib/stores';
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

  let { title, integrationId, type }: { title: string; integrationId: number; type: MediaType } =
    $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<MediaData>);
  const icon = $derived(`di:${type}`);

  function posterSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    // Server emits `/api/<type>/image...`; rewrite to the per-integration proxy route.
    return url.replace(`/api/${type}/image`, `/api/integrations/${integrationId}/${type}-image`);
  }
</script>

<section class="card">
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
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
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
            <div class="bar"><i style:width="{clampPercent(s.progress)}%"></i></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
