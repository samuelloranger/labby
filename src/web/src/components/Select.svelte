<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronDown } from 'lucide-svelte';

  let {
    value,
    options,
    onchange,
    id = '',
    style = '',
    pill = false,
  }: {
    value: string;
    options: readonly (readonly [string, string])[] | { value: string; label: string }[];
    onchange: (value: string) => void;
    id?: string;
    style?: string;
    pill?: boolean;
  } = $props();

  let open = $state(false);
  let selectEl = $state<HTMLElement>();
  let listEl = $state<HTMLElement>();
  let focusedIndex = $state(-1);

  const items = $derived(
    options.map((opt) => {
      if (Array.isArray(opt)) {
        return { value: opt[0], label: opt[1] };
      }
      return opt as { value: string; label: string };
    })
  );

  const currentLabel = $derived(items.find((i) => i.value === value)?.label ?? value);

  // Curated color previews, one per palette (mode-agnostic — a palette has the
  // same accent hue in light and dark).
  const themeColors: Record<string, string> = {
    amber: '#d97706',
    slate: '#64748b',
    mint: '#10b981',
    rose: '#f43f5e',
    nord: '#88c0d0',
    peach: '#f97316',
    graphite: '#65a30d',
    ocean: '#0891b2',
    forest: '#16a34a',
    dracula: '#7c3aed',
    cyberpunk: 'linear-gradient(135deg, #d6006e 0%, #0891b2 100%)',
  };

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
    if (open) {
      focusedIndex = items.findIndex((i) => i.value === value);
      if (focusedIndex === -1) focusedIndex = 0;
      setTimeout(scrollToFocused, 10);
    }
  }

  function selectOption(val: string) {
    onchange(val);
    open = false;
    selectEl?.focus();
  }

  function handleOutsideClick(e: MouseEvent) {
    if (open && selectEl && !selectEl.contains(e.target as Node)) {
      open = false;
    }
  }

  function scrollToFocused() {
    if (!listEl) return;
    const focusedEl = listEl.children[focusedIndex] as HTMLElement;
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open = true;
        focusedIndex = items.findIndex((i) => i.value === value);
        if (focusedIndex === -1) focusedIndex = 0;
        setTimeout(scrollToFocused, 10);
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      open = false;
      selectEl?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = (focusedIndex + 1) % items.length;
      scrollToFocused();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = (focusedIndex - 1 + items.length) % items.length;
      scrollToFocused();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < items.length) {
        selectOption(items[focusedIndex].value);
      }
    }
  }
</script>

<svelte:window onclick={handleOutsideClick} />

<!-- svelte-ignore a11y_role_has_required_aria_props -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  bind:this={selectEl}
  {id}
  class="custom-select"
  class:pill
  class:open
  tabindex="0"
  onkeydown={handleKeydown}
  onclick={toggle}
  {style}
  role="combobox"
  aria-expanded={open}
  aria-haspopup="listbox"
  aria-label="Palette selector"
>
  <div class="select-trigger">
    <span class="theme-dot" style="background: {themeColors[value] || '#888'}"></span>
    <span class="select-label">{currentLabel}</span>
    <ChevronDown size={14} class="chevron-icon" />
  </div>

  {#if open}
    <div
      bind:this={listEl}
      class="select-dropdown"
      role="listbox"
    >
      {#each items as item, index}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="select-option"
          class:selected={item.value === value}
          class:focused={index === focusedIndex}
          onclick={(e) => {
            e.stopPropagation();
            selectOption(item.value);
          }}
          role="option"
          aria-selected={item.value === value}
        >
          <span class="theme-dot" style="background: {themeColors[item.value] || '#888'}"></span>
          <span class="option-label">{item.label}</span>
          {#if item.value === value}
            <span class="selected-indicator"></span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .custom-select {
    position: relative;
    display: inline-block;
    font-family: inherit;
    font-size: 0.88rem;
    color: var(--ink-dim);
    background: #ffffff; /* solid fallback */
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
    cursor: pointer;
    user-select: none;
    outline: none;
    transition: all 0.2s var(--ease);
    box-sizing: border-box;
  }

  .custom-select.pill {
    border-radius: var(--pill);
  }

  .custom-select:hover, .custom-select:focus-visible {
    border-color: var(--accent-soft);
    background: #f8fafc; /* solid fallback */
    color: var(--ink);
  }

  .custom-select:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .select-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    height: 40px; /* Aligns with 42px header container */
    box-sizing: border-box;
    width: 100%;
  }

  .theme-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.1);
  }

  .select-label {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    font-size: 0.88rem;
  }

  :global(.chevron-icon) {
    transition: transform 0.2s var(--ease);
    flex-shrink: 0;
    color: var(--ink-faint);
  }

  .custom-select.open :global(.chevron-icon) {
    transform: rotate(180deg);
  }

  .select-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 1000;
    max-height: 260px;
    overflow-y: auto;
    background: #f8fafc; /* solid fallback */
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-hi);
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: slideUp 0.15s var(--ease);
  }

  /* Custom scrollbar for dropdown */
  .select-dropdown::-webkit-scrollbar {
    width: 6px;
  }
  .select-dropdown::-webkit-scrollbar-track {
    background: transparent;
  }
  .select-dropdown::-webkit-scrollbar-thumb {
    background: var(--glass-brd);
    border-radius: var(--pill);
  }
  .select-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--accent-soft);
  }

  .select-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    transition: all 0.12s var(--ease);
    color: var(--ink-dim);
    font-weight: 500;
  }

  .select-option:hover, .select-option.focused {
    background: var(--glass-2);
    color: var(--ink);
  }

  .select-option.selected {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .selected-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    margin-left: auto;
  }

  /* Theme-specific solid backgrounds to make the component non-transparent */
  :global([data-theme^="light"]) .custom-select { background: #ffffff; }
  :global([data-theme^="light"]) .custom-select:hover { background: #f8fafc; }
  :global([data-theme^="light"]) .select-dropdown { background: #ffffff; border-color: rgba(0, 0, 0, 0.08); }

  /* Dark default fallback */
  @media (prefers-color-scheme: dark) {
    .custom-select { background: #1c1c1e; }
    .custom-select:hover { background: #2c2c2e; }
    .select-dropdown { background: #1c1c1e; }
  }

  /* Specific dark theme overrides matching theme palettes */
  :global([data-theme="dark"]) .custom-select { background: #1e202a; }
  :global([data-theme="dark"]) .custom-select:hover { background: #262936; }
  :global([data-theme="dark"]) .select-dropdown { background: #1e202a; }

  :global([data-theme="dark-graphite"]) .custom-select { background: #111827; }
  :global([data-theme="dark-graphite"]) .custom-select:hover { background: #1f2937; }
  :global([data-theme="dark-graphite"]) .select-dropdown { background: #111827; }

  :global([data-theme="dark-ocean"]) .custom-select { background: #082f49; }
  :global([data-theme="dark-ocean"]) .custom-select:hover { background: #0c3e60; }
  :global([data-theme="dark-ocean"]) .select-dropdown { background: #082f49; }

  :global([data-theme="dark-forest"]) .custom-select { background: #0b1f13; }
  :global([data-theme="dark-forest"]) .custom-select:hover { background: #123320; }
  :global([data-theme="dark-forest"]) .select-dropdown { background: #0b1f13; }

  :global([data-theme="dark-dracula"]) .custom-select { background: #282a36; }
  :global([data-theme="dark-dracula"]) .custom-select:hover { background: #343746; }
  :global([data-theme="dark-dracula"]) .select-dropdown { background: #282a36; }

  :global([data-theme="dark-nord"]) .custom-select { background: #2e3440; }
  :global([data-theme="dark-nord"]) .custom-select:hover { background: #3b4252; }
  :global([data-theme="dark-nord"]) .select-dropdown { background: #2e3440; }

  :global([data-theme="dark-cyberpunk"]) .custom-select { background: #120626; }
  :global([data-theme="dark-cyberpunk"]) .custom-select:hover { background: #1c0a3a; }
  :global([data-theme="dark-cyberpunk"]) .select-dropdown { background: #120626; }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
