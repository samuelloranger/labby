<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let {
    title,
    meta = '',
    onClose,
    children,
  }: { title: string; meta?: string; onClose: () => void; children: Snippet } = $props();

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div use:portal class="modal-bg" role="presentation" transition:fade={{ duration: 160 }} onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" transition:fly={{ y: 18, duration: 220 }}>
    <div class="modal-head">
      <span class="mt">{title}{#if meta}<span class="mm">{meta}</span>{/if}</span>
      <button class="iconbtn" onclick={onClose} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      {@render children()}
    </div>
  </div>
</div>
