<script lang="ts">
  import { onMount } from 'svelte';
  import { Monitor, Moon, Settings, Database, Sun } from 'lucide-svelte';
  import Modal from './Modal.svelte';
  import Select from './Select.svelte';
  import { get } from 'svelte/store';
  import { getStore, streamConnected, type MonitorData, type WidgetState } from '$lib/stores';
  import type { Dashboard, IntegrationRow } from '$lib/types';
  import {
    composeTheme,
    decomposeTheme,
    PALETTES,
    resolveConcreteTheme,
    type Mode,
    type Palette,
  } from '$lib/theme';

  let { config, integrations = [] }: { config: Dashboard; integrations?: IntegrationRow[] } = $props();
  const title = $derived(config.title ?? 'Labby');

  const initial = decomposeTheme(config.theme?.default ?? 'system');
  let mode = $state<Mode>(initial.mode);
  let palette = $state<Palette>(initial.palette);
  let density = $state<'default' | 'compact'>('compact');
  let motion = $state(config.theme?.motion ?? false);
  let customCss = $state(config.theme?.customCss ?? '');
  let settingsOpen = $state(false);
  let saving = $state(false);

  let currentTime = $state('');

  const monitorIds = $derived(
    integrations.filter((r) => r.type === 'monitor' && r.enabled).map((r) => r.id),
  );

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

  function systemIsDark(): boolean {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }

  onMount(() => {
    // Remove server-injected custom css tag since Svelte will handle it
    const serverStyle = document.getElementById('labby-custom-css');
    if (serverStyle) {
      serverStyle.remove();
    }

    try {
      const stored = localStorage.getItem('labby-theme');
      const decomposed = decomposeTheme(stored ?? config.theme?.default ?? 'system');
      mode = decomposed.mode;
      palette = decomposed.palette;
    } catch {}

    try {
      const storedDensity = localStorage.getItem('labby-density');
      if (storedDensity) {
        density = storedDensity as any;
      } else {
        density = config.theme?.density ?? 'compact';
      }
      document.documentElement.dataset.density = density;
    } catch {}

    document.documentElement.dataset.motion = motion ? 'on' : 'off';

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

  function onGlobalKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && settingsOpen) {
      closeSettings();
    }
  }

  const themeId = $derived(composeTheme(mode, palette));

  function applyThemePreview() {
    document.documentElement.dataset.theme = resolveConcreteTheme(mode, palette, systemIsDark());
  }

  function previewMode(next: Mode) {
    mode = next;
    applyThemePreview();
  }

  function previewPalette(next: Palette) {
    palette = next;
    applyThemePreview();
  }

  function previewDensity(next: 'default' | 'compact') {
    density = next;
    document.documentElement.dataset.density = next;
  }

  function previewMotion(next: boolean) {
    motion = next;
    document.documentElement.dataset.motion = next ? 'on' : 'off';
  }

  function previewCss(next: string) {
    customCss = next;
  }

  async function persistTheme() {
    const next = themeId;
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

  async function quickSetMode(next: Mode) {
    previewMode(next);
    await persistTheme();
  }

  async function quickSetPalette(next: Palette) {
    previewPalette(next);
    await persistTheme();
  }

  function openSettings() {
    const decomposed = decomposeTheme(config.theme?.default ?? 'system');
    mode = decomposed.mode;
    palette = decomposed.palette;
    density = config.theme?.density ?? 'default';
    motion = config.theme?.motion ?? false;
    customCss = config.theme?.customCss ?? '';
    settingsOpen = true;
  }

  function closeSettings() {
    settingsOpen = false;
    const original = decomposeTheme(config.theme?.default ?? 'system');
    mode = original.mode;
    palette = original.palette;
    document.documentElement.dataset.theme = resolveConcreteTheme(mode, palette, systemIsDark());
    density = config.theme?.density ?? 'default';
    document.documentElement.dataset.density = density;
    motion = config.theme?.motion ?? false;
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
    customCss = config.theme?.customCss ?? '';
  }

  async function saveSettings() {
    saving = true;
    try {
      const next = themeId;
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: next,
          density: density,
          motion: motion,
          customCss: customCss,
        }),
      });
      if (res.ok) {
        config.theme.default = next as any;
        config.theme.density = density;
        config.theme.motion = motion;
        config.theme.customCss = customCss;
        try {
          if (next === 'system') {
            localStorage.removeItem('labby-theme');
          } else {
            localStorage.setItem('labby-theme', next);
          }
          localStorage.setItem('labby-density', density);
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

    {#if monitorIds.length > 0}
      <div class="summary">
        <span class="chip" title="Monitored sites up"><span class="dot ok"></span><b>{summary.up}</b></span>
        <span class="chip" title="Monitored sites warning"><span class="dot warn"></span><b>{summary.warn}</b></span>
        <span class="chip" title="Monitored sites down"><span class="dot down"></span><b>{summary.down}</b></span>
      </div>
    {/if}

    <span class="quick-theme">
      <span class="mode-toggle" role="group" aria-label="Theme mode">
        <button type="button" class="mode-btn" class:active={mode === 'light'} onclick={() => quickSetMode('light')} aria-label="Light" aria-pressed={mode === 'light'} title="Light">
          <Sun size={15} />
        </button>
        <button type="button" class="mode-btn" class:active={mode === 'dark'} onclick={() => quickSetMode('dark')} aria-label="Dark" aria-pressed={mode === 'dark'} title="Dark">
          <Moon size={15} />
        </button>
        <button type="button" class="mode-btn" class:active={mode === 'system'} onclick={() => quickSetMode('system')} aria-label="System" aria-pressed={mode === 'system'} title="System">
          <Monitor size={15} />
        </button>
      </span>
      <Select
        value={palette}
        options={PALETTES}
        onchange={(v) => quickSetPalette(v as Palette)}
        pill={true}
        style="width: 130px;"
      />
    </span>

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
        <span class="settings-label">Theme mode</span>
        <div class="settings-radio-group" role="radiogroup" aria-label="Theme mode">
          <label class="radio-label">
            <input type="radio" name="theme-mode" value="light" checked={mode === 'light'} onchange={() => previewMode('light')} />
            <span>Light</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="theme-mode" value="dark" checked={mode === 'dark'} onchange={() => previewMode('dark')} />
            <span>Dark</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="theme-mode" value="system" checked={mode === 'system'} onchange={() => previewMode('system')} />
            <span>System</span>
          </label>
        </div>
      </div>

      <div class="settings-group">
        <label for="settings-palette">Palette</label>
        <Select id="settings-palette" value={palette} options={PALETTES} onchange={(v) => previewPalette(v as Palette)} pill={false} style="width: 100%;" />
      </div>

      <div class="settings-group">
        <span class="settings-label">Density</span>
        <div class="settings-radio-group">
          <label class="radio-label">
            <input type="radio" name="density" value="default" checked={density === 'default'} onchange={() => previewDensity('default')} />
            <span>Default</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="density" value="compact" checked={density === 'compact'} onchange={() => previewDensity('compact')} />
            <span>Compact</span>
          </label>
        </div>
        <p class="settings-help">Compact reduces padding, card margins, and list item spacing so more content fits on screen.</p>
      </div>

      <div class="settings-group">
        <label class="radio-label">
          <input type="checkbox" checked={motion} onchange={(e) => previewMotion(e.currentTarget.checked)} />
          <span>Decorative motion</span>
        </label>
        <p class="settings-help">Adds an idle bob to the header logo and a slow pulse to empty/loading state messages. Off by default.</p>
      </div>

      <div class="settings-group">
        <label for="settings-css">Custom CSS</label>
        <textarea id="settings-css" value={customCss} oninput={(e) => previewCss(e.currentTarget.value)} placeholder={"/* Your styles, e.g. .card { border-radius: 12px; } */"} rows={6}></textarea>
        <p class="settings-help">Applies your own styles across the dashboard. Previews live; discarded if you close without saving.</p>
      </div>

      <div class="settings-actions">
        <button class="settings-btn save" onclick={saveSettings} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  /* On phones the quick theme picker lives in the Customize modal instead. */
  @media (max-width: 720px) {
    .quick-theme {
      display: none;
    }
  }

  .quick-theme {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-toggle {
    display: flex;
    border: 1px solid var(--glass-brd);
    border-radius: var(--pill);
    overflow: hidden;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--ink-faint);
    cursor: pointer;
    transition: all 0.15s var(--ease);
  }

  .mode-btn:hover {
    color: var(--ink);
  }

  .mode-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
