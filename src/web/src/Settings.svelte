<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Database, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-svelte';
  import Icon from './components/Icon.svelte';
  import { refreshStreamSubscriptions } from '$lib/stores';
  import type { FieldDef, IntegrationRow, IntegrationTypeMeta } from '$lib/types';

  let types = $state<IntegrationTypeMeta[]>([]);
  let rows = $state<IntegrationRow[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let revealed = $state<Record<string, boolean>>({});

  let editing = $state<IntegrationRow | null>(null);
  let formOpen = $state(false);
  let formType = $state('');
  let formName = $state('');
  let formEnabled = $state(true);
  let formRefresh = $state<number | ''>('');
  let formConfig = $state<Record<string, unknown>>({});

  const TYPE_ICONS: Record<string, string> = {
    monitor: 'lucide:activity',
    docker: 'di:docker',
    qbittorrent: 'di:qbittorrent',
    transmission: 'di:transmission',
    adguard: 'di:adguard-home',
    jellyfin: 'di:jellyfin',
    beszel: 'di:beszel',
    radarr: 'di:radarr',
    sonarr: 'di:sonarr',
    reelward: '/icons/reelward.png',
    reddit: 'di:reddit',
    hackernews: 'di:hacker-news',
    weather: '/icons/openweather.png',
    calendar: 'lucide:calendar',
    speedtest: '/icons/speedtest-tracker.svg',
  };

  const selectedMeta = $derived(types.find((t) => t.type === formType));

  function defaultConfig(fields: FieldDef[]): Record<string, unknown> {
    const cfg: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.kind === 'list') cfg[f.key] = [];
      else if (f.kind === 'number') cfg[f.key] = undefined;
      else if (f.kind === 'select') cfg[f.key] = f.options?.[0] ?? '';
      else cfg[f.key] = '';
    }
    return cfg;
  }

  function openAdd(type: string) {
    const meta = types.find((t) => t.type === type);
    if (!meta) return;
    editing = null;
    formType = type;
    formName = '';
    formEnabled = true;
    formRefresh = meta.defaultRefreshSeconds;
    formConfig = defaultConfig(meta.fields);
    formOpen = true;
    error = null;
  }

  function openEdit(row: IntegrationRow) {
    editing = row;
    formType = row.type;
    formName = row.name;
    formEnabled = row.enabled;
    formRefresh = row.refreshSeconds ?? '';
    formConfig = { ...row.config };
    formOpen = true;
    error = null;
  }

  function closeForm() {
    formOpen = false;
    editing = null;
  }

  function listFieldValue(key: string): string {
    const v = formConfig[key];
    if (Array.isArray(v)) {
      return v
        .map((item) => {
          if (typeof item === 'object' && item && 'checkUrl' in item) {
            const s = item as { title?: string; checkUrl: string };
            return s.title && s.title !== s.checkUrl ? `${s.title}|${s.checkUrl}` : s.checkUrl;
          }
          return String(item);
        })
        .join('\n');
    }
    if (typeof v === 'string') return v;
    return '';
  }

  function setListField(key: string, raw: string) {
    if (key === 'sites') {
      formConfig = {
        ...formConfig,
        [key]: raw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((line) => {
            const pipe = line.indexOf('|');
            if (pipe > 0) {
              return { title: line.slice(0, pipe).trim(), checkUrl: line.slice(pipe + 1).trim() };
            }
            return { title: line, checkUrl: line };
          }),
      };
      return;
    }
    formConfig = {
      ...formConfig,
      [key]: raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  function setField(key: string, value: string, kind?: FieldDef['kind']) {
    let parsed: unknown = value;
    if (kind === 'number') parsed = value === '' ? undefined : Number(value);
    formConfig = { ...formConfig, [key]: parsed };
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const [typesRes, rowsRes] = await Promise.all([
        fetch('/api/integrations/types'),
        fetch('/api/integrations'),
      ]);
      if (!typesRes.ok || !rowsRes.ok) throw new Error('Failed to load integrations');
      types = await typesRes.json();
      rows = await rowsRes.json();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  async function saveForm() {
    if (!formName.trim() || !formType) return;
    saving = true;
    error = null;
    const payload = {
      name: formName.trim(),
      type: formType,
      config: formConfig,
      enabled: formEnabled,
      refreshSeconds: formRefresh === '' ? null : Number(formRefresh),
    };
    try {
      const res = editing
        ? await fetch(`/api/integrations/${editing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save integration');
      }
      closeForm();
      await load();
      await refreshStreamSubscriptions();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      saving = false;
    }
  }

  async function removeRow(row: IntegrationRow) {
    if (!confirm(`Delete integration "${row.name}"?`)) return;
    saving = true;
    error = null;
    try {
      const res = await fetch(`/api/integrations/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete integration');
      await load();
      await refreshStreamSubscriptions();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      saving = false;
    }
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
      <p class="settings-sub">Add integrations with URLs, API keys, and per-instance settings. Everything is stored in the SQLite database — credentials never leave the server.</p>
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
      {#each rows as row}
        <div class="svc-card">
          <div class="svc-head">
            <span class="svc-mark"><Icon icon={TYPE_ICONS[row.type] ?? 'lucide:box'} fallback="box" size={20} /></span>
            <div class="svc-title">
              <h3>{row.name}</h3>
              <span class="svc-status" class:on={row.enabled}>
                {types.find((t) => t.type === row.type)?.label ?? row.type}{row.enabled ? '' : ' · disabled'}
              </span>
            </div>
            <div class="row-actions">
              <button type="button" class="btn-icon" onclick={() => openEdit(row)} aria-label="Edit" title="Edit">
                <Pencil size={15} />
              </button>
              <button type="button" class="btn-icon danger" onclick={() => removeRow(row)} aria-label="Delete" title="Delete">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="svc-card wide">
      <div class="svc-head">
        <span class="svc-mark on"><Plus size={16} /></span>
        <div class="svc-title">
          <h3>Add Integration</h3>
          <span class="svc-status">Choose a service type to configure</span>
        </div>
      </div>
      <div class="type-grid">
        {#each types as t}
          <button type="button" class="type-pick" onclick={() => openAdd(t.type)}>
            <Icon icon={TYPE_ICONS[t.type] ?? 'lucide:box'} fallback="box" size={18} />
            {t.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if formOpen && selectedMeta}
  <div class="modal-backdrop" role="presentation" onclick={closeForm}></div>
  <div class="form-panel" role="dialog" aria-labelledby="form-title">
    <div class="form-head">
      <h2 id="form-title">{editing ? 'Edit' : 'Add'} {selectedMeta.label}</h2>
      <button type="button" class="iconbtn" onclick={closeForm} aria-label="Close">×</button>
    </div>

    <div class="svc-fields">
      <div class="field">
        <label for="int-name">Name</label>
        <input id="int-name" type="text" bind:value={formName} placeholder="My Radarr" required />
      </div>

      <div class="field row-field">
        <label class="check-label">
          <input type="checkbox" bind:checked={formEnabled} />
          Enabled
        </label>
        <div class="refresh-field">
          <label for="int-refresh">Refresh (seconds)</label>
          <input id="int-refresh" type="number" min="5" bind:value={formRefresh} placeholder={String(selectedMeta.defaultRefreshSeconds)} />
        </div>
      </div>

      {#each selectedMeta.fields as field}
        <div class="field">
          <label for={`f-${field.key}`}>{field.label}</label>
          {#if field.kind === 'list'}
            <textarea
              id={`f-${field.key}`}
              rows={4}
              value={listFieldValue(field.key)}
              oninput={(e) => setListField(field.key, e.currentTarget.value)}
              placeholder="One entry per line"
            ></textarea>
          {:else if field.kind === 'select'}
            <select
              id={`f-${field.key}`}
              value={String(formConfig[field.key] ?? '')}
              onchange={(e) => setField(field.key, e.currentTarget.value, 'select')}
            >
              {#each field.options ?? [] as opt}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
          {:else if field.secret}
            <div class="field-input secret">
              <input
                type={revealed[field.key] ? 'text' : 'password'}
                id={`f-${field.key}`}
                autocomplete="off"
                value={String(formConfig[field.key] ?? '')}
                oninput={(e) => setField(field.key, e.currentTarget.value, field.kind)}
              />
              <button
                type="button"
                class="reveal"
                onclick={() => (revealed[field.key] = !revealed[field.key])}
                aria-label={revealed[field.key] ? 'Hide value' : 'Show value'}
              >
                {#if revealed[field.key]}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
              </button>
            </div>
          {:else}
            <input
              type={field.kind === 'number' ? 'number' : 'text'}
              id={`f-${field.key}`}
              value={formConfig[field.key] != null ? String(formConfig[field.key]) : ''}
              oninput={(e) => setField(field.key, e.currentTarget.value, field.kind)}
            />
          {/if}
        </div>
      {/each}
    </div>

    <div class="settings-footer">
      <button class="btn-cancel" onclick={closeForm}>Cancel</button>
      <button class="btn-save" onclick={saveForm} disabled={saving || !formName.trim()}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
{/if}

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
    flex: 1;
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

  .row-actions {
    display: flex;
    gap: 6px;
  }
  .btn-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--glass-brd);
    background: var(--glass-2);
    color: var(--ink-dim);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .btn-icon.danger:hover {
    color: var(--down);
    border-color: var(--down);
  }

  .type-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .type-pick {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--glass-brd);
    background: var(--glass-2);
    border-radius: var(--pill);
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
  }
  .type-pick:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 100;
  }
  .form-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow: auto;
    background: var(--wall);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
  }
  .form-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .form-head h2 {
    font-size: 1.1rem;
    font-weight: 800;
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
  .field label {
    font-size: 0.84rem;
    font-weight: 600;
  }
  .row-field {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .check-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.86rem;
    font-weight: 600;
  }
  .refresh-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;
  }

  input,
  select,
  textarea {
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
  }
  textarea {
    resize: vertical;
    min-height: 88px;
  }
  .field-input {
    position: relative;
    display: flex;
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
    cursor: pointer;
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--glass-brd);
  }
  .btn-cancel,
  .btn-save {
    font-family: inherit;
    font-weight: 700;
    font-size: 0.9rem;
    padding: 11px 24px;
    border-radius: var(--pill);
    cursor: pointer;
  }
  .btn-cancel {
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    color: var(--ink-dim);
  }
  .btn-save {
    background: var(--accent);
    color: #fff;
    border: none;
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
