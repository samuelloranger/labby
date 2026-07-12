<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';

  let {
    title,
    meta = '',
    onClose,
    children,
  }: { title: string; meta?: string; onClose: () => void; children: Snippet } = $props();

  let dialogEl = $state<HTMLDialogElement | undefined>();

  $effect(() => {
    dialogEl?.showModal();
  });

  // Route every close path through the dialog's own close() so the browser
  // restores focus to whatever triggered the modal before we unmount it.
  function requestClose() {
    dialogEl?.close();
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) requestClose();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="modal-panel"
  aria-label={title}
  onclick={onBackdropClick}
  onclose={onClose}
  transition:fly={{ y: 18, duration: 220 }}
>
  <div class="modal-head">
    <span class="mt">{title}{#if meta}<span class="mm">{meta}</span>{/if}</span>
    <button class="iconbtn" onclick={requestClose} aria-label="Close">×</button>
  </div>
  <div class="modal-body">
    {@render children()}
  </div>
</dialog>
