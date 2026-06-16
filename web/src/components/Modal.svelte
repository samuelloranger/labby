<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    meta = '',
    onClose,
    children,
  }: { title: string; meta?: string; onClose: () => void; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="modal-bg" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-label={title} tabindex="-1">
    <div class="modal-head">
      <span class="mt">{title}{#if meta}<span class="mm">{meta}</span>{/if}</span>
      <button class="iconbtn" onclick={onClose} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      {@render children()}
    </div>
  </div>
</div>
