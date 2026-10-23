<script lang="ts">
  import { onMount } from 'svelte';
  import { Monitor, Moon, Settings, Database, Sun, LogOut } from '@lucide/svelte';
  import Modal from './Modal.svelte';
  import Select from './Select.svelte';
  import { get } from 'svelte/store';
  import { getStore, streamConnected, type MonitorData, type WidgetState } from '$lib/stores';
  import type { Dashboard, IntegrationRow } from '$lib/types';
  import { type AuthUser, fetchAuthUser } from '$lib/auth';
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
  let glass = $state(config.theme?.glass ?? true);
  let customCss = $state(config.theme?.customCss ?? '');

  // Common ESP32 / small HDMI display resolutions for /api/panel.jpg.
  const PANEL_PRESETS = [
    ['800x480', '7" · 800 × 480 (CrowPanel, Sunton)'],
    ['1024x600', '7" HD · 1024 × 600'],
    ['1280x800', '10.1" · 1280 × 800'],
    ['480x320', '3.5" · 480 × 320'],
    ['custom', 'Custom size'],
  ] as const;
  const presetFor = (w: number, h: number) =>
    PANEL_PRESETS.some(([v]) => v === `${w}x${h}`) ? `${w}x${h}` : 'custom';
  // Synced from config each time the dialog opens (openSettings).
  let panelWidth = $state(800);
  let panelHeight = $state(480);
  let panelPreset = $state<string>('800x480');
  let panelError = $state('');
  let saveError = $state('');

  /** Same rules as the server's PanelConfigSchema, checked before anything is saved. */
  function panelSizeProblem(width: number, height: number): string | null {
    if (!Number.isInteger(width) || !Number.isInteger(height)) return 'Enter a whole-pixel width and height';
    if (width < 320 || width > 1920 || height < 240 || height > 1200) {
      return 'Width must be 320–1920 px and height 240–1200 px';
    }
    const aspect = width / height;
    if (aspect < 1.25 || aspect > 2.4) {
      return 'Panel must be landscape, between 5:4 and 12:5 (e.g. 800x480, 1024x600)';
    }
    return null;
  }

  function choosePanelPreset(next: string) {
    panelPreset = next;
    panelError = '';
    if (next === 'custom') return;
    const [w, h] = next.split('x').map(Number);
    panelWidth = w;
    panelHeight = h;
  }

  let settingsOpen = $state(false);
  let saving = $state(false);

  let currentTime = $state('');
  let authUser = $state<AuthUser | null>(null);

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
    void fetchAuthUser().then((user) => (authUser = user));

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
    // localStorage wins on load so the inline resolver in index.html and this
    // component agree — otherwise the blur would flash back on at mount.
    try {
      const storedGlass = localStorage.getItem('labby-glass');
      if (storedGlass) glass = storedGlass !== 'off';
    } catch {}
    if (config.theme) config.theme.glass = glass;
    document.documentElement.dataset.glass = glass ? 'on' : 'off';

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

  function previewGlass(next: boolean) {
    glass = next;
    document.documentElement.dataset.glass = next ? 'on' : 'off';
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
    glass = config.theme?.glass ?? true;
    customCss = config.theme?.customCss ?? '';
    panelWidth = config.panel?.width ?? 800;
    panelHeight = config.panel?.height ?? 480;
    panelPreset = presetFor(panelWidth, panelHeight);
    panelError = '';
    saveError = '';
    settingsOpen = true;
  }

  /** Saves the panel size if it changed; returns false (and shows why) when rejected. */
  async function savePanelSize(): Promise<boolean> {
    const width = Number(panelWidth);
    const height = Number(panelHeight);
    if (width === config.panel?.width && height === config.panel?.height) return true;
    const res = await fetch('/api/panel/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width, height }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      panelError = body?.error ?? 'Could not save the panel size';
      return false;
    }
    config.panel = { width, height };
    panelError = '';
    return true;
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
    glass = config.theme?.glass ?? true;
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
    document.documentElement.dataset.glass = glass ? 'on' : 'off';
    customCss = config.theme?.customCss ?? '';
  }

  async function saveSettings() {
    // Reject a bad panel size before saving anything, so Save never half-applies.
    const problem = panelSizeProblem(Number(panelWidth), Number(panelHeight));
    if (problem) {
      panelError = problem;
      return;
    }
    saving = true;
    saveError = '';
    try {
      const next = themeId;
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: next,
          density: density,
          motion: motion,
          glass: glass,
          customCss: customCss,
        }),
      });
      if (res.ok) {
        config.theme.default = next as any;
        config.theme.density = density;
        config.theme.motion = motion;
        config.theme.glass = glass;
        config.theme.customCss = customCss;
        try {
          if (next === 'system') {
            localStorage.removeItem('labby-theme');
          } else {
            localStorage.setItem('labby-theme', next);
          }
          localStorage.setItem('labby-density', density);
          localStorage.setItem('labby-glass', glass ? 'on' : 'off');
        } catch {}
        if (await savePanelSize()) settingsOpen = false;
      } else {
        saveError = 'Could not save settings. Try again.';
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      saveError = 'Could not reach Labby to save settings. Check the connection and try again.';
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
    <h1 class="brand">
      <img class="logo" class:reconnecting={!connectedVal} src="/icons/labby.svg" alt="" width="28" height="28" />
      <span>{title.toLowerCase()}</span>
    </h1>

    <!-- The reconnecting logo pulse is the only signal a sighted user gets; this
         is the same signal for everyone else. -->
    <p class="sr-only" role="status">
      {connectedVal ? 'Live updates connected' : 'Live updates disconnected, reconnecting'}
    </p>

    {#if currentTime}
      <span class="header-time">{currentTime}</span>
    {/if}

    {#if monitorIds.length > 0}
      <div class="summary" role="status" aria-label="Monitored sites">
        <span class="chip" title="Monitored sites up"><span class="dot ok"></span><b>{summary.up}</b><span class="sr-only"> up</span></span>
        <span class="chip" title="Monitored sites warning"><span class="dot warn"></span><b>{summary.warn}</b><span class="sr-only"> warning</span></span>
        <span class="chip" title="Monitored sites down"><span class="dot down"></span><b>{summary.down}</b><span class="sr-only"> down</span></span>
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

    {#if authUser}
      <button class="iconbtn" onclick={() => (window.location.href = '/auth/logout')} aria-label="Sign out" title="Sign out">
        <LogOut size={17} />
      </button>
    {/if}
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
        <label class="radio-label">
          <input type="checkbox" checked={glass} onchange={(e) => previewGlass(e.currentTarget.checked)} />
          <span>Glass effect</span>
        </label>
        <p class="settings-help">Frosted blur behind the header and cards. Beautiful, and the single most expensive thing the dashboard draws — turning it off measured about 4.5x faster repaints on a weak GPU. Switch it off if hovering feels sluggish.</p>
      </div>

      <div class="settings-group">
        <label for="settings-panel">Display panel size</label>
        <Select id="settings-panel" label="Display panel size" swatches={false} value={panelPreset} options={PANEL_PRESETS} onchange={choosePanelPreset} pill={false} style="width: 100%;" />
        {#if panelPreset === 'custom'}
          <div class="settings-size">
            <input type="number" inputmode="numeric" min="320" max="1920" aria-label="Panel width in pixels" bind:value={panelWidth} oninput={() => (panelError = '')} />
            <span aria-hidden="true">×</span>
            <input type="number" inputmode="numeric" min="240" max="1200" aria-label="Panel height in pixels" bind:value={panelHeight} oninput={() => (panelError = '')} />
          </div>
        {/if}
        {#if panelError}
          <p class="settings-error" role="alert">{panelError}</p>
        {/if}
        <p class="settings-help">Resolution of the small screen showing <a href="/api/panel.jpg" target="_blank" rel="noreferrer">/api/panel.jpg</a>. Landscape, between 5:4 and 12:5; cards reflow to fit.</p>
      </div>

      <div class="settings-group">
        <label for="settings-css">Custom CSS</label>
        <textarea id="settings-css" value={customCss} oninput={(e) => previewCss(e.currentTarget.value)} placeholder={"/* Your styles, e.g. .card { border-radius: 12px; } */"} rows={6}></textarea>
        <p class="settings-help">Applies your own styles across the dashboard. Previews live; discarded if you close without saving.</p>
      </div>

      <div class="settings-actions">
        {#if saveError}
          <p class="settings-error" role="alert">{saveError}</p>
        {/if}
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
    transition:
      color 0.15s var(--ease),
      background 0.15s var(--ease);
  }

  .mode-btn:hover {
    color: var(--ink);
  }

  .mode-btn.active {
    background: var(--accent-soft);
    color: var(--accent-ink);
  }
</style>
