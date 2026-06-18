<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Database, Eye, EyeOff, Plus, Trash2 } from 'lucide-svelte';
  import Icon from './components/Icon.svelte';

  let settings: Record<string, string> = $state({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let revealed = $state<Record<string, boolean>>({});

  const KNOWN_SERVICES = [
    {
      name: 'Labby',
      icon: '/icons/labby.svg',
      keys: ['LABBY_PORT']
    },
    {
      name: 'Docker',
      icon: 'di:docker',
      keys: ['DOCKER_RO_HOST', 'DOCKER_RW_HOST']
    },
    {
      name: 'qBittorrent',
      icon: 'di:qbittorrent',
      keys: ['QBIT_URL', 'QBIT_USER', 'QBIT_PASS']
    },
    {
      name: 'Transmission',
      icon: 'di:transmission',
      keys: ['TRANSMISSION_URL', 'TRANSMISSION_USER', 'TRANSMISSION_PASS']
    },
    {
      name: 'AdGuard',
      icon: 'di:adguard-home',
      keys: ['ADGUARD_URL', 'ADGUARD_USER', 'ADGUARD_PASS']
    },
    {
      name: 'Jellyfin',
      icon: 'di:jellyfin',
      keys: ['JELLYFIN_URL', 'JELLYFIN_API_KEY']
    },
    {
      name: 'Beszel',
      icon: 'di:beszel',
      keys: ['BESZEL_URL', 'BESZEL_USER', 'BESZEL_PASS', 'BESZEL_TOKEN']
    },
    {
      name: 'Radarr',
      icon: 'di:radarr',
      keys: ['RADARR_URL', 'RADARR_API_KEY']
    },
    {
      name: 'Sonarr',
      icon: 'di:sonarr',
      keys: ['SONARR_URL', 'SONARR_API_KEY']
    },
    {
      name: 'Reelward',
      icon: 'lucide:film',
      keys: ['REELWARD_URL', 'REELWARD_API_KEY']
    },
    {
      name: 'OpenWeather',
      icon: 'lucide:sun',
      keys: ['OPENWEATHER_API_KEY']
    },
    {
      name: 'Speedtest Tracker',
      icon: '/icons/speedtest-tracker.svg',
      keys: ['SPEEDTEST_TRACKER_URL', 'SPEEDTEST_TRACKER_API_TOKEN']
    }
  ];

  let otherKeys = $derived(Object.keys(settings).filter(k => !KNOWN_SERVICES.some(s => s.keys.includes(k))).sort());

  let newKey = $state('');
  let newValue = $state('');

  // Turn QBIT_API_KEY into "API Key" — friendlier than the raw env var.
  function fieldLabel(key: string): string {
    const suffixes: [string, string][] = [
      ['_API_TOKEN', 'API Token'],
      ['_API_KEY', 'API Key'],
      ['_RO_HOST', 'Read Host'],
      ['_RW_HOST', 'Write Host'],
      ['_URL', 'URL'],
      ['_USER', 'Username'],
      ['_PASS', 'Password'],
      ['_TOKEN', 'Token'],
      ['_PORT', 'Port'],
      ['_KEY', 'Key'],
    ];
    for (const [suffix, label] of suffixes) {
      if (key.endsWith(suffix)) return label;
    }
    return key;
  }

  function isSecret(key: string): boolean {
    return key.includes('PASS') || key.includes('TOKEN') || key.includes('KEY');
  }

  function configuredCount(keys: string[]): number {
    return keys.filter(k => (settings[k] ?? '').trim() !== '').length;
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      settings = await res.json();

      // Ensure all known keys exist in the object (even if empty) to display the fields
      for (const service of KNOWN_SERVICES) {
        for (const key of service.keys) {
          if (settings[key] === undefined) {
            settings[key] = '';
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  });

  async function save() {
    saving = true;
    error = null;
    try {
      // Remove empty settings before saving
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (v.trim() !== '') {
          payload[k] = v.trim();
        }
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save settings');
      window.location.hash = '';
      window.location.reload();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      saving = false;
    }
  }

  function addSetting(e: Event) {
    e.preventDefault();
    if (!newKey.trim()) return;
    settings[newKey.trim().toUpperCase()] = newValue.trim();
    newKey = '';
    newValue = '';
  }

  function removeSetting(k: string) {
    const s = { ...settings };
    delete s[k];
    settings = s;
  }
</script>

<div class="page settings-page">
  <div class="settings-bar">
    <button class="iconbtn" onclick={() => (window.location.hash = '')} aria-label="Back to dashboard" title="Back to dashboard">
      <ArrowLeft size={18} />
    </button>
    <div class="settings-heading">
      <span class="settings-eyebrow"><Database size={13} /> Configuration</span>
      <h1>Manage Services</h1>
      <p class="settings-sub">Service URLs, API keys, and credentials. These stay server-side — empty fields aren't saved.</p>
    </div>
  </div>

  {#if error}
    <p class="state-msg error">{error}</p>
  {/if}

  {#if loading}
    <div class="services-grid">
      {#each Array(6) as _}
        <div class="svc-card"><div class="skeleton" style="height:104px"></div></div>
      {/each}
    </div>
  {:else}
    <div class="services-grid">
      {#each KNOWN_SERVICES as service}
        {@const n = configuredCount(service.keys)}
        <div class="svc-card">
          <div class="svc-head">
            <span class="svc-mark"><Icon icon={service.icon} fallback="box" size={20} /></span>
            <div class="svc-title">
              <h3>{service.name}</h3>
              <span class="svc-status" class:on={n > 0}>
                {n > 0 ? `${n}/${service.keys.length} configured` : 'Not configured'}
              </span>
            </div>
          </div>
          <div class="svc-fields">
            {#each service.keys as key}
              <div class="field">
                <div class="field-label">
                  <label for={key}>{fieldLabel(key)}</label>
                  <code>{key}</code>
                </div>
                {#if isSecret(key)}
                  <div class="field-input secret">
                    <input
                      type={revealed[key] ? 'text' : 'password'}
                      id={key}
                      autocomplete="off"
                      bind:value={settings[key]}
                      placeholder="Not set"
                    />
                    <button
                      type="button"
                      class="reveal"
                      onclick={() => (revealed[key] = !revealed[key])}
                      aria-label={revealed[key] ? 'Hide value' : 'Show value'}
                      title={revealed[key] ? 'Hide value' : 'Show value'}
                    >
                      {#if revealed[key]}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
                    </button>
                  </div>
                {:else}
                  <div class="field-input">
                    <input type="text" id={key} bind:value={settings[key]} placeholder="Not set" />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    {#if otherKeys.length > 0}
      <div class="svc-card wide">
        <div class="svc-head">
          <span class="svc-mark on">+</span>
          <div class="svc-title"><h3>Custom Variables</h3></div>
        </div>
        <div class="svc-fields">
          {#each otherKeys as key}
            <div class="field custom">
              <input type="text" value={key} readonly class="custom-key" aria-label="Variable name" />
              <div class="field-input">
                <input type="text" bind:value={settings[key]} aria-label={`Value for ${key}`} />
              </div>
              <button type="button" class="btn-remove" onclick={() => removeSetting(key)} aria-label={`Remove ${key}`} title="Remove">
                <Trash2 size={15} />
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="svc-card wide">
      <div class="svc-head">
        <span class="svc-mark on"><Plus size={16} /></span>
        <div class="svc-title">
          <h3>Add Custom Variable</h3>
          <span class="svc-status">Define an environment variable not listed above</span>
        </div>
      </div>
      <form class="add-form" onsubmit={addSetting}>
        <input type="text" bind:value={newKey} placeholder="KEY_NAME" required aria-label="New variable name" />
        <input type="text" bind:value={newValue} placeholder="Value" required aria-label="New variable value" />
        <button type="submit" class="btn-add"><Plus size={15} /> Add</button>
      </form>
    </div>

    <div class="settings-footer">
      <button class="btn-cancel" onclick={() => (window.location.hash = '')}>Cancel</button>
      <button onclick={save} class="btn-save" disabled={saving}>
        {saving ? 'Saving…' : 'Save & Reload'}
      </button>
    </div>
  {/if}
</div>

<style>
  .settings-page {
    max-width: 1080px;
    margin: 0 auto;
  }

  .settings-bar {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 28px;
  }
  .settings-bar .iconbtn {
    margin-top: 2px;
    text-decoration: none;
    flex: none;
  }
  .settings-heading h1 {
    font-size: 1.7rem;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }
  .settings-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .settings-sub {
    color: var(--ink-dim);
    font-size: 0.9rem;
    font-weight: 500;
    margin-top: 6px;
    max-width: 56ch;
  }

  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }

  .svc-card {
    background: var(--glass);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius);
    padding: 18px;
    box-shadow: var(--shadow), inset 0 1px 0 var(--glass-hi);
  }
  .svc-card.wide {
    margin-bottom: 18px;
  }

  .svc-head {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 16px;
  }
  .svc-mark {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--ink-dim);
    overflow: hidden;
  }
  .svc-mark :global(img),
  .svc-mark :global(svg) {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .svc-mark.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 800;
  }
  .svc-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .svc-title h3 {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .svc-status {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-faint);
  }
  .svc-status.on {
    color: var(--ok);
  }

  .svc-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .field-label label {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--ink);
  }
  .field-label code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.66rem;
    color: var(--ink-faint);
    letter-spacing: 0.02em;
  }

  .field-input {
    position: relative;
    display: flex;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 0.86rem;
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    color: var(--ink);
    outline: none;
    transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
  }
  input::placeholder {
    color: var(--ink-faint);
  }
  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .field-input.secret input {
    padding-right: 42px;
  }
  .reveal {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: var(--ink-faint);
    border-radius: 8px;
    cursor: pointer;
    transition: color 0.15s var(--ease);
  }
  .reveal:hover {
    color: var(--ink);
  }
  .reveal:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .field.custom {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .custom-key {
    width: 220px;
    flex: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    color: var(--ink-dim);
    opacity: 0.85;
  }
  .field.custom .field-input {
    flex: 1;
  }
  .btn-remove {
    flex: none;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid var(--glass-brd);
    background: var(--glass-2);
    color: var(--ink-dim);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s var(--ease);
  }
  .btn-remove:hover {
    color: var(--down);
    border-color: var(--down);
  }

  .add-form {
    display: flex;
    gap: 10px;
  }
  .add-form input:first-child {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    max-width: 220px;
  }
  .btn-add {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 18px;
    border: 1px solid var(--glass-brd);
    background: var(--glass-2);
    color: var(--ink);
    font-family: inherit;
    font-weight: 700;
    font-size: 0.86rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s var(--ease);
  }
  .btn-add:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .settings-footer {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
    padding: 16px 0;
    background: linear-gradient(to top, var(--wall) 60%, transparent);
  }
  .btn-cancel,
  .btn-save {
    font-family: inherit;
    font-weight: 700;
    font-size: 0.9rem;
    padding: 11px 24px;
    border-radius: var(--pill);
    cursor: pointer;
    transition: all 0.18s var(--ease);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn-cancel {
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    color: var(--ink-dim);
  }
  .btn-cancel:hover {
    color: var(--ink);
  }
  .btn-save {
    background: var(--accent);
    color: #fff;
    border: none;
    box-shadow: 0 4px 14px var(--accent-soft);
  }
  .btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px var(--accent-soft);
  }
  .btn-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 560px) {
    .add-form {
      flex-wrap: wrap;
    }
    .add-form input:first-child {
      max-width: none;
    }
    .field.custom {
      flex-wrap: wrap;
    }
    .custom-key {
      width: 100%;
    }
  }
</style>
