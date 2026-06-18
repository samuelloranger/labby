<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, Settings, Database } from 'lucide-svelte';
  import Modal from './Modal.svelte';
  import Select from './Select.svelte';
  import { get } from 'svelte/store';
  import { getStore, searchQuery, streamConnected, type MonitorData, type WidgetState } from '$lib/stores';
  import type { Dashboard } from '$lib/types';

  const themes = [
    ['system', 'System Default'],
    ['light', 'Light (Amber)'],
    ['light-slate', 'Slate (Light)'],
    ['light-mint', 'Mint (Light)'],
    ['light-rose', 'Rose (Light)'],
    ['light-nord', 'Nord (Light)'],
    ['light-peach', 'Peach (Light)'],
    ['light-graphite', 'Graphite (Light)'],
    ['light-ocean', 'Ocean (Light)'],
    ['light-forest', 'Forest (Light)'],
    ['light-dracula', 'Dracula (Light)'],
    ['light-cyberpunk', 'Cyberpunk (Light)'],
    ['dark', 'Dark (Amber)'],
    ['dark-graphite', 'Graphite (Dark)'],
    ['dark-ocean', 'Ocean (Dark)'],
    ['dark-forest', 'Forest (Dark)'],
    ['dark-dracula', 'Dracula (Dark)'],
    ['dark-nord', 'Nord (Dark)'],
    ['dark-cyberpunk', 'Cyberpunk (Dark)'],
    ['dark-slate', 'Slate (Dark)'],
    ['dark-mint', 'Mint (Dark)'],
    ['dark-rose', 'Rose (Dark)'],
    ['dark-peach', 'Peach (Dark)'],
  ] as const;

  let { config }: { config: Dashboard } = $props();
  const title = $derived(config.title ?? 'Labby');

  let theme = $state(config.theme?.default ?? 'system');
  let layout = $state(config.theme?.layout ?? 'masonry');
  let customCss = $state(config.theme?.customCss ?? '');
  let settingsOpen = $state(false);
  let saving = $state(false);

  let searchEl = $state<HTMLInputElement>();
  let currentTime = $state('');

  const monitorIds = $derived.by(() => {
    const ids = new Set<number>();
    for (const page of config.pages) {
      for (const col of page.columns) {
        for (const w of col.widgets) {
          if (w.type === 'monitor') ids.add(w.integrationId);
        }
      }
    }
    return [...ids];
  });

  let summary = $state({ up: 0, warn: 0, down: 0 });

  $effect(() => {
    const ids = monitorIds;
    const recompute = () => {
      let up = 0;
      let warn = 0;
      let down = 0;
      for (const id of ids) {
        const s = get(getStore(id)) as WidgetState<MonitorData>;
        if (s.data?.summary) {
          up += s.data.summary.up;
          warn += s.data.summary.warn;
          down += s.data.summary.down;
        }
      }
      summary = { up, warn, down };
    };
    recompute();
    const unsubs = ids.map((id) => getStore(id).subscribe(recompute));
    return () => unsubs.forEach((u) => u());
  });

  const connectedVal = $derived($streamConnected);

  onMount(() => {
    // Remove server-injected custom css tag since Svelte will handle it
    const serverStyle = document.getElementById('labby-custom-css');
    if (serverStyle) {
      serverStyle.remove();
    }

    try {
      const stored = localStorage.getItem('labby-theme');
      if (stored) {
        theme = stored as any;
      } else {
        theme = config.theme?.default ?? 'system';
      }
    } catch {}

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mon = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const tick = () => {
      const d = new Date();
      const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      currentTime = `${days[d.getDay()]}, ${mon[d.getMonth()]} ${d.getDate()} · ${t}`;
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  });

  // "/" focuses search; ignore when already typing in a field.
  function onGlobalKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && settingsOpen) {
      closeSettings();
      return;
    }
    if (e.key !== '/') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    e.preventDefault();
    searchEl?.focus();
  }

  function previewTheme(next: string) {
    theme = next as any;
    if (next === 'system') {
      const sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = sys;
    } else {
      document.documentElement.dataset.theme = next;
    }
  }

  function previewLayout(next: 'masonry' | 'columns') {
    layout = next;
    config.theme.layout = next;
  }

  function previewCss(next: string) {
    customCss = next;
    config.theme.customCss = next;
  }

  async function quickSetTheme(next: string) {
    previewTheme(next);
    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      if (res.ok) {
        config.theme.default = next as any;
        try {
          if (next === 'system') {
            localStorage.removeItem('labby-theme');
          } else {
            localStorage.setItem('labby-theme', next);
          }
        } catch {}
      }
    } catch {
      // Ignore
    }
  }

  function openSettings() {
    theme = config.theme?.default ?? 'system';
    layout = config.theme?.layout ?? 'masonry';
    customCss = config.theme?.customCss ?? '';
    settingsOpen = true;
  }

  function closeSettings() {
    settingsOpen = false;
    const originalTheme = config.theme?.default ?? 'system';
    if (originalTheme === 'system') {
      const sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = sys;
    } else {
      document.documentElement.dataset.theme = originalTheme;
    }
    theme = originalTheme;
    config.theme.layout = config.theme?.layout ?? 'masonry';
    config.theme.customCss = config.theme?.customCss ?? '';
    layout = config.theme?.layout ?? 'masonry';
    customCss = config.theme?.customCss ?? '';
  }

  async function saveSettings() {
    saving = true;
    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: theme,
          layout: layout,
          customCss: customCss,
        }),
      });
      if (res.ok) {
        config.theme.default = theme;
        config.theme.layout = layout;
        config.theme.customCss = customCss;
        try {
          if (theme === 'system') {
            localStorage.removeItem('labby-theme');
          } else {
            localStorage.setItem('labby-theme', theme);
          }
        } catch {}
        settingsOpen = false;
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    const cssText = settingsOpen ? customCss : (config.theme?.customCss ?? '');
    let el = document.getElementById('labby-custom-css-dynamic');
    if (cssText) {
      if (!el) {
        el = document.createElement('style');
        el.id = 'labby-custom-css-dynamic';
        document.head.appendChild(el);
      }
      el.textContent = cssText;
    } else if (el) {
      el.remove();
    }
  });
</script>

<svelte:window onkeydown={onGlobalKey} />

<header class="top">
  <div class="top-in">
    <div class="brand">
      <img class="logo" class:reconnecting={!connectedVal} src="/icons/labby.svg" alt="Labby" width="28" height="28" />
      <span>{title.toLowerCase()}</span>
    </div>

    {#if currentTime}
      <span class="header-time">{currentTime}</span>
    {/if}

    <div class="searchpill">
      <input
        placeholder="Search services, containers…"
        aria-label="Search services, containers and torrents"
        bind:value={$searchQuery}
        bind:this={searchEl}
        onkeydown={(e) => { if (e.key === 'Escape') { $searchQuery = ''; searchEl?.blur(); } }}
      />
      <span class="go"><Search size={16} color="#fff" strokeWidth={2.5} /></span>
    </div>

    <div class="summary">
      <span class="chip" title="Services up"><span class="dot ok"></span><b>{summary.up}</b></span>
      <span class="chip" title="Warnings"><span class="dot warn"></span><b>{summary.warn}</b></span>
      <span class="chip" title="Services down"><span class="dot down"></span><b>{summary.down}</b></span>
    </div>

    <Select value={theme} options={themes} onchange={quickSetTheme} pill={true} style="width: 170px;" />

    <button class="iconbtn" onclick={() => window.location.hash = '#settings'} aria-label="Manage services" title="Manage services">
      <Database size={17} />
    </button>

    <button class="iconbtn" onclick={openSettings} aria-label="Customize interface" title="Customize interface">
      <Settings size={17} />
    </button>
  </div>
</header>

{#if settingsOpen}
  <Modal title="Customize Dashboard" onClose={closeSettings}>
    <div class="settings-form">
      <div class="settings-group">
        <label for="settings-theme">Theme Color Scheme</label>
        <Select id="settings-theme" value={theme} options={themes} onchange={previewTheme} pill={false} style="width: 100%;" />
      </div>

      <div class="settings-group">
        <span class="settings-label">Dashboard Layout</span>
        <div class="settings-radio-group">
          <label class="radio-label">
            <input type="radio" name="layout" value="masonry" checked={layout === 'masonry'} onchange={() => previewLayout('masonry')} />
            <span>Masonry (Auto-pack)</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="layout" value="columns" checked={layout === 'columns'} onchange={() => previewLayout('columns')} />
            <span>True Columns (As Configured)</span>
          </label>
        </div>
        <p class="settings-help">Columns layout displays widgets in the exact columns specified in dashboard.json.</p>
      </div>

      <div class="settings-group">
        <label for="settings-css">Custom CSS Overrides</label>
        <textarea id="settings-css" value={customCss} oninput={(e) => previewCss(e.currentTarget.value)} placeholder={"/* Add custom CSS overrides here (e.g. .card { border-radius: 12px; }) */"} rows={6}></textarea>
        <p class="settings-help">Injects CSS rules into the head of the page. Reverts on close if not saved.</p>
      </div>

      <div class="settings-actions">
        <button class="settings-btn save" onclick={saveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  </Modal>
{/if}
