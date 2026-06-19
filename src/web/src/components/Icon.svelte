<script lang="ts">
  import {
    Activity, Box, Calendar, Clapperboard, CloudSun, Download, Film, Flame, Folder, Gauge, Globe,
    LayoutGrid, MessageSquare, Moon, Pause, Play, Radio, Search, Shield, Sun, Tv, Wallet, LayoutDashboard,
  } from 'lucide-svelte';
  import { resolveIconSrc } from '$lib/utils';

  const ICONS: Record<string, typeof Box> = {
    activity: Activity,
    box: Box,
    calendar: Calendar,
    clapperboard: Clapperboard,
    'cloud-sun': CloudSun,
    download: Download,
    film: Film,
    flame: Flame,
    folder: Folder,
    gauge: Gauge,
    globe: Globe,
    'layout-grid': LayoutGrid,
    'layout-dashboard': LayoutDashboard,
    'message-square': MessageSquare,
    moon: Moon,
    pause: Pause,
    play: Play,
    radio: Radio,
    search: Search,
    shield: Shield,
    sun: Sun,
    tv: Tv,
    wallet: Wallet,
  };

  let {
    icon = undefined,
    fallback = 'box',
    class: className = '',
    size = 20,
  }: {
    icon?: string;
    fallback?: string;
    class?: string;
    size?: number;
  } = $props();

  let imgFailed = $state(false);
  const resolved = $derived(resolveIconSrc(icon, fallback));
  const Lucide = $derived(ICONS[resolved.lucide] ?? ICONS[fallback] ?? Box);

  $effect(() => {
    if (resolved.src) {
      imgFailed = false;
    }
  });
</script>

{#if resolved.type === 'img' && !imgFailed}
  <img
    class="logo {className}"
    src={resolved.src}
    alt=""
    loading="lazy"
    style:width="{size}px"
    style:height="{size}px"
    onerror={() => (imgFailed = true)}
  />
{:else}
  <Lucide class="ic {className}" {size} strokeWidth={2} />
{/if}
