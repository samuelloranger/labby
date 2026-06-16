<script lang="ts">
  import Monitor from '../widgets/Monitor.svelte';
  import Docker from '../widgets/Docker.svelte';
  import Downloads from '../widgets/Downloads.svelte';
  import AdGuard from '../widgets/AdGuard.svelte';
  import Jellyfin from '../widgets/Jellyfin.svelte';
  import Beszel from '../widgets/Beszel.svelte';
  import Arr from '../widgets/Arr.svelte';
  import Reelward from '../widgets/Reelward.svelte';
  import Feed from '../widgets/Feed.svelte';
  import Weather from '../widgets/Weather.svelte';
  import Calendar from '../widgets/Calendar.svelte';
  import type { Widget } from '$lib/types';

  let { widget }: { widget: Widget } = $props();
</script>

{#if widget.type === 'monitor'}
  <Monitor
    title={widget.title}
    sites={widget.sites}
    style={widget.style}
    variant={widget.variant ?? 'rows'}
    headerIcon={widget.variant === 'tiles' ? 'lucide:layout-grid' : 'lucide:activity'}
  />
{:else if widget.type === 'docker'}
  <Docker title={widget.title} show={widget.show} />
{:else if widget.type === 'downloads'}
  <Downloads title={widget.title} client={widget.client} max={widget.max} />
{:else if widget.type === 'adguard'}
  <AdGuard title={widget.title} />
{:else if widget.type === 'jellyfin'}
  <Jellyfin title={widget.title} />
{:else if widget.type === 'beszel'}
  <Beszel title={widget.title} systems={widget.systems} max={widget.max} />
{:else if widget.type === 'radarr'}
  <Arr title={widget.title} kind="radarr" max={widget.max} />
{:else if widget.type === 'sonarr'}
  <Arr title={widget.title} kind="sonarr" max={widget.max} />
{:else if widget.type === 'reelward'}
  <Reelward title={widget.title} max={widget.max} />
{:else if widget.type === 'reddit'}
  <Feed
    title={widget.title}
    endpoint={`/api/reddit/${(Array.isArray(widget.subreddit) ? widget.subreddit.join('+') : widget.subreddit)}`}
    icon="di:reddit"
    fallback="message-square"
    max={widget.max}
  />
{:else if widget.type === 'hackernews'}
  <Feed title={widget.title} endpoint="/api/hackernews" icon="di:hacker-news" fallback="flame" max={widget.max} />
{:else if widget.type === 'weather'}
  <Weather title={widget.title} city={widget.city} lat={widget.lat} lon={widget.lon} />
{:else if widget.type === 'calendar'}
  <Calendar title={widget.title} max={widget.max} />
{/if}
