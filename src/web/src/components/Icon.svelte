<script lang="ts">
  import { Box } from 'lucide-svelte';
  import { LUCIDE_ICONS as ICONS } from '$lib/lucide-set';
  import { resolveIconSrc } from '$lib/utils';

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
  let currentSrc = $state<string | undefined>(undefined);
  let triedFallback = $state(false);
  const resolved = $derived(resolveIconSrc(icon, fallback));
  const Lucide = $derived(ICONS[resolved.lucide] ?? ICONS[fallback] ?? Box);

  // Reset the load chain whenever the resolved image changes.
  $effect(() => {
    currentSrc = resolved.src;
    triedFallback = false;
    imgFailed = false;
  });

  function onImgError() {
    if (resolved.srcFallback && !triedFallback && currentSrc !== resolved.srcFallback) {
      triedFallback = true;
      currentSrc = resolved.srcFallback;
    } else {
      imgFailed = true;
    }
  }
</script>

{#if resolved.type === 'img' && !imgFailed}
  <img
    class="logo {className}"
    src={currentSrc}
    alt=""
    loading="lazy"
    style:width="{size}px"
    style:height="{size}px"
    onerror={onImgError}
  />
{:else}
  <Lucide class="ic {className}" {size} strokeWidth={2} />
{/if}
