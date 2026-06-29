<script lang="ts">
  import Monitor from '../widgets/Monitor.svelte';
  import Docker from '../widgets/Docker.svelte';
  import Downloads from '../widgets/Downloads.svelte';
  import AdGuard from '../widgets/AdGuard.svelte';
  import MediaSessions from '../widgets/MediaSessions.svelte';
  import Beszel from '../widgets/Beszel.svelte';
  import Arr from '../widgets/Arr.svelte';
  import Reelward from '../widgets/Reelward.svelte';
  import Feed from '../widgets/Feed.svelte';
  import Weather from '../widgets/Weather.svelte';
  import Calendar from '../widgets/Calendar.svelte';
  import Speedtest from '../widgets/Speedtest.svelte';
  import Bookmarks from '../widgets/Bookmarks.svelte';
  import Sabnzbd from '../widgets/Sabnzbd.svelte';
  import type { IntegrationRow } from '$lib/types';

  let { integration }: { integration: IntegrationRow } = $props();
  const c = $derived(integration.config as Record<string, any>);
  const id = $derived(integration.id);
  const title = $derived(integration.name);
</script>

{#if integration.type === 'monitor'}
  <Monitor {title} integrationId={id} style={c.style} variant={c.variant ?? 'rows'} headerIcon={c.variant === 'tiles' ? 'lucide:layout-grid' : 'lucide:activity'} />
{:else if integration.type === 'docker'}
  <Docker {title} integrationId={id} />
{:else if integration.type === 'qbittorrent' || integration.type === 'transmission'}
  <Downloads {title} integrationId={id} client={integration.type} max={c.max} />
{:else if integration.type === 'adguard'}
  <AdGuard {title} integrationId={id} />
{:else if integration.type === 'jellyfin' || integration.type === 'emby' || integration.type === 'plex'}
  <MediaSessions {title} integrationId={id} type={integration.type} />
{:else if integration.type === 'sabnzbd'}
  <Sabnzbd {title} integrationId={id} max={c.max} />
{:else if integration.type === 'beszel'}
  <Beszel {title} integrationId={id} systems={c.systems} max={c.max} />
{:else if integration.type === 'radarr' || integration.type === 'sonarr'}
  <Arr {title} integrationId={id} kind={integration.type} max={c.max} />
{:else if integration.type === 'reelward'}
  <Reelward {title} integrationId={id} max={c.max} />
{:else if integration.type === 'reddit'}
  <Feed {title} integrationId={id} icon="di:reddit" fallback="message-square" max={c.max} />
{:else if integration.type === 'hackernews'}
  <Feed {title} integrationId={id} icon="di:hacker-news" fallback="flame" max={c.max} />
{:else if integration.type === 'weather'}
  <Weather {title} integrationId={id} />
{:else if integration.type === 'calendar'}
  <Calendar {title} integrationId={id} max={c.max} />
{:else if integration.type === 'speedtest'}
  <Speedtest {title} integrationId={id} max={c.max} />
{:else if integration.type === 'bookmarks'}
  <Bookmarks {title} integrationId={id} />
{/if}
