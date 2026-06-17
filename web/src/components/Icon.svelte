<script lang="ts">
  import {
    Activity, Box, Download, Film, Flame, Folder, Globe, LayoutGrid, MessageSquare, Moon, Radio,
    Search, Shield, Sun, Wallet, LayoutDashboard,
  } from 'lucide-svelte';
  import { resolveIconSrc } from '$lib/utils';

  const ICONS: Record<string, typeof Box> = {
    activity: Activity,
    box: Box,
    download: Download,
    film: Film,
    flame: Flame,
    folder: Folder,
    globe: Globe,
    'layout-grid': LayoutGrid,
    'layout-dashboard': LayoutDashboard,
    'message-square': MessageSquare,
    moon: Moon,
    radio: Radio,
    search: Search,
    shield: Shield,
    sun: Sun,
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
