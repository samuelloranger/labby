<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, ChevronDown, ChevronUp, Database, Download, Eye, EyeOff, Pencil, Plus, TriangleAlert, Trash2, Upload } from 'lucide-svelte';
  import Icon from './components/Icon.svelte';
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
    bookmarks: 'lucide:layout-grid',
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

  let tagDraft = $state<Record<string, string>>({});

  type SiteForm = { title?: string; checkUrl?: string; url?: string; icon?: string; okCodes?: number[] };

  // --- tag/chip list fields (subreddits, ICS URLs) ---
  function tags(key: string): string[] {
    const v = formConfig[key];
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  }
  function addTag(key: string) {
    const raw = (tagDraft[key] ?? '').trim();
    if (!raw) return;
    const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const cur = tags(key);
    formConfig = { ...formConfig, [key]: [...cur, ...parts.filter((p) => !cur.includes(p))] };
    tagDraft[key] = '';
  }
  function removeTag(key: string, i: number) {
    formConfig = { ...formConfig, [key]: tags(key).filter((_, idx) => idx !== i) };
  }
  function onTagKey(e: KeyboardEvent, key: string) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(key);
    }
  }

  // --- structured monitor sites editor ---
  function sites(key: string): SiteForm[] {
    const v = formConfig[key];
    return Array.isArray(v) ? (v as SiteForm[]) : [];
  }
  function addSite(key: string) {
    formConfig = { ...formConfig, [key]: [...sites(key), { title: '', checkUrl: '' }] };
  }
  function removeSite(key: string, i: number) {
    formConfig = { ...formConfig, [key]: sites(key).filter((_, idx) => idx !== i) };
  }
  function updateSite(key: string, i: number, patch: Partial<SiteForm>) {
    formConfig = { ...formConfig, [key]: sites(key).map((s, idx) => (idx === i ? { ...s, ...patch } : s)) };
  }
  function okCodesValue(s: SiteForm): string {
    return (s.okCodes ?? []).join(', ');
  }
  function setOkCodes(key: string, i: number, raw: string) {
    const codes = raw.split(/[\s,]+/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
    updateSite(key, i, { okCodes: codes.length ? codes : undefined });
  }

  // --- bookmarks links editor ---
  type LinkForm = { title?: string; url?: string; icon?: string };
  function links(key: string): LinkForm[] {
    const v = formConfig[key];
    return Array.isArray(v) ? (v as LinkForm[]) : [];
  }
  function addLink(key: string) {
    formConfig = { ...formConfig, [key]: [...links(key), { title: '', url: '', icon: '' }] };
  }
  function removeLink(key: string, i: number) {
    formConfig = { ...formConfig, [key]: links(key).filter((_, idx) => idx !== i) };
  }
  function updateLink(key: string, i: number, patch: Partial<LinkForm>) {
    formConfig = {
      ...formConfig,
      [key]: links(key).map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    };
  }
  async function fetchFavicon(key: string, i: number) {
    const link = links(key)[i];
    if (!link?.url?.trim() || link.icon?.trim()) return;
    try {
      const res = await fetch(`/api/favicon?url=${encodeURIComponent(link.url.trim())}`);
      const data = (await res.json()) as { icon: string | null };
      if (data.icon) updateLink(key, i, { icon: data.icon });
    } catch {
      /* leave icon empty — falls back to a glyph */
    }
  }

  // --- calendar feeds: stored as "Name|URL" strings (URL only if unnamed) ---
  type CalForm = { name?: string; url?: string };
  function cals(key: string): CalForm[] {
    const v = formConfig[key];
    if (!Array.isArray(v)) return [];
    return v.map((entry) => {
      const s = String(entry);
      const pipe = s.indexOf('|');
      return pipe > 0 ? { name: s.slice(0, pipe).trim(), url: s.slice(pipe + 1).trim() } : { name: '', url: s.trim() };
    });
  }
  function writeCals(key: string, list: CalForm[]) {
    formConfig = {
      ...formConfig,
      [key]: list.map((c) => (c.name?.trim() ? `${c.name.trim()}|${(c.url ?? '').trim()}` : (c.url ?? '').trim())),
    };
  }
  function addCal(key: string) {
    writeCals(key, [...cals(key), { name: '', url: '' }]);
  }
  function removeCal(key: string, i: number) {
    writeCals(key, cals(key).filter((_, idx) => idx !== i));
  }
  function updateCal(key: string, i: number, patch: Partial<CalForm>) {
    writeCals(key, cals(key).map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  // Normalize config before save: commit any pending tag, clean monitor sites + calendar feeds.
  function cleanConfig(): Record<string, unknown> {
    for (const key of Object.keys(tagDraft)) if ((tagDraft[key] ?? '').trim()) addTag(key);
    const out: Record<string, unknown> = { ...formConfig };
    for (const [k, v] of Object.entries(out)) {
      if (k === 'sites' && Array.isArray(v)) {
        out[k] = (v as SiteForm[])
          .map((s) => ({
            title: (s.title ?? '').trim() || (s.checkUrl ?? '').trim(),
            checkUrl: (s.checkUrl ?? '').trim(),
            ...(s.url?.trim() ? { url: s.url.trim() } : {}),
            ...(s.icon?.trim() ? { icon: s.icon.trim() } : {}),
            ...(s.okCodes?.length ? { okCodes: s.okCodes } : {}),
          }))
          .filter((s) => s.checkUrl);
      } else if (k === 'icsUrls' && Array.isArray(v)) {
        // drop rows with no URL
        out[k] = (v as string[]).map((s) => String(s).trim()).filter((s) => {
          const pipe = s.indexOf('|');
          return (pipe > 0 ? s.slice(pipe + 1).trim() : s).length > 0;
        });
      } else if (k === 'links' && Array.isArray(v)) {
        out[k] = (v as LinkForm[])
          .map((l) => ({
            title: (l.title ?? '').trim() || (l.url ?? '').trim(),
            url: (l.url ?? '').trim(),
            ...(l.icon?.trim() ? { icon: l.icon.trim() } : {}),
          }))
          .filter((l) => l.url);
      }
    }
    return out;
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
      config: cleanConfig(),
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
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      saving = false;
    }
  }

  let importing = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  function exportBackup() {
    window.location.href = '/api/backup';
  }

  let dragIndex = $state<number | null>(null);

  async function persistOrder() {
    try {
      await fetch('/api/integrations/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rows.map((r) => r.id) }),
      });
    } catch {
      /* order will resync on next load */
    }
  }

  function onDragStart(i: number) {
    dragIndex = i;
  }
  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    rows = next;
    dragIndex = i;
  }
  function onDrop() {
    dragIndex = null;
    void persistOrder();
  }

  // Touch/keyboard-friendly reorder (HTML5 drag doesn't fire on iOS Safari).
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    rows = next;
    void persistOrder();
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm("This replaces ALL services and your dashboard layout with the backup's contents. Continue?")) return;
    importing = true;
    error = null;
    try {
      const text = await file.text();
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to restore backup');
      }
      window.location.reload();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore backup';
    } finally {
      importing = false;
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
      {#each rows as row, i (row.id)}
        <div
          class="svc-card"
          class:dragging={dragIndex === i}
          draggable="true"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => onDragOver(e, i)}
          ondrop={onDrop}
          ondragend={onDrop}
        >
          <div class="svc-head">
            <span class="drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
            <span class="svc-mark"><Icon icon={TYPE_ICONS[row.type] ?? 'lucide:box'} fallback="box" size={20} /></span>
            <div class="svc-title">
              <h3>{row.name}</h3>
              <span class="svc-status" class:on={row.enabled}>
                {types.find((t) => t.type === row.type)?.label ?? row.type}{row.enabled ? '' : ' · disabled'}
              </span>
            </div>
            <div class="row-actions">
              <button type="button" class="btn-icon" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                <ChevronUp size={15} />
              </button>
              <button type="button" class="btn-icon" onclick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" title="Move down">
                <ChevronDown size={15} />
              </button>
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

  <section class="backup" aria-labelledby="backup-title">
    <div class="backup-head">
      <span class="settings-eyebrow"><Database size={13} /> Backup &amp; restore</span>
      <h2 id="backup-title">Move your setup</h2>
      <p class="settings-sub">Download everything — services, credentials, and your dashboard layout — as one file, or restore from a previous one.</p>
    </div>
    <div class="backup-warn">
      <TriangleAlert size={16} />
      <span>The file includes your service credentials in plain text. Keep it somewhere private.</span>
    </div>
    <div class="backup-actions">
      <button type="button" class="btn-save" onclick={exportBackup}>
        <Download size={16} /> Export backup
      </button>
      <button type="button" class="btn-cancel" onclick={() => fileInput?.click()} disabled={importing}>
        <Upload size={16} /> {importing ? 'Importing…' : 'Import backup'}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json"
        style="display:none"
        onchange={onImportFile}
      />
    </div>
  </section>
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
        <input id="int-name" type="text" bind:value={formName} placeholder={`My ${selectedMeta.label}`} required />
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
          {#if field.key === 'sites'}
            <div class="sites-editor">
              {#each sites(field.key) as site, i (i)}
                <div class="site-row">
                  <div class="site-row-head">
                    <span class="site-badge">
                      <Icon icon={site.icon?.trim() || 'lucide:globe'} fallback="globe" size={18} />
                    </span>
                    <span class="site-row-title">{site.title?.trim() || site.checkUrl?.trim() || `Service ${i + 1}`}</span>
                    <button type="button" class="btn-icon danger" onclick={() => removeSite(field.key, i)} aria-label="Remove service" title="Remove service">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div class="site-grid">
                    <label class="sub-field">
                      Name
                      <input type="text" placeholder="Jellyfin" value={site.title ?? ''} oninput={(e) => updateSite(field.key, i, { title: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field">
                      Icon <span class="opt">optional</span>
                      <input type="text" placeholder="di:jellyfin" value={site.icon ?? ''} oninput={(e) => updateSite(field.key, i, { icon: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field span2">
                      Status check URL
                      <input type="text" placeholder="http://jellyfin:8096/health" value={site.checkUrl ?? ''} oninput={(e) => updateSite(field.key, i, { checkUrl: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field span2">
                      Link URL <span class="opt">optional — opens on click</span>
                      <input type="text" placeholder="https://jellyfin.example.com" value={site.url ?? ''} oninput={(e) => updateSite(field.key, i, { url: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field span2">
                      OK status codes <span class="opt">optional</span>
                      <input type="text" placeholder="200, 401" value={okCodesValue(site)} oninput={(e) => setOkCodes(field.key, i, e.currentTarget.value)} />
                    </label>
                  </div>
                </div>
              {/each}
              <button type="button" class="btn-add-site" onclick={() => addSite(field.key)}>
                <Plus size={14} /> Add service
              </button>
            </div>
          {:else if field.key === 'icsUrls'}
            <div class="sites-editor">
              {#each cals(field.key) as cal, i (i)}
                <div class="site-row">
                  <div class="site-row-head">
                    <span class="site-badge"><Icon icon="lucide:calendar" fallback="calendar" size={18} /></span>
                    <span class="site-row-title">{cal.name?.trim() || cal.url?.trim() || `Calendar ${i + 1}`}</span>
                    <button type="button" class="btn-icon danger" onclick={() => removeCal(field.key, i)} aria-label="Remove calendar" title="Remove calendar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div class="site-grid">
                    <label class="sub-field span2">
                      Name <span class="opt">optional — shown on events</span>
                      <input type="text" placeholder="Work" value={cal.name ?? ''} oninput={(e) => updateCal(field.key, i, { name: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field span2">
                      ICS feed URL
                      <input type="text" placeholder="https://example.com/calendar.ics" value={cal.url ?? ''} oninput={(e) => updateCal(field.key, i, { url: e.currentTarget.value })} />
                    </label>
                  </div>
                </div>
              {/each}
              <button type="button" class="btn-add-site" onclick={() => addCal(field.key)}>
                <Plus size={14} /> Add calendar
              </button>
            </div>
          {:else if field.key === 'links'}
            <div class="sites-editor">
              {#each links(field.key) as l, i (i)}
                <div class="site-row">
                  <div class="site-row-head">
                    <span class="site-badge">
                      <Icon icon={l.icon?.trim() || 'lucide:globe'} fallback="globe" size={18} />
                    </span>
                    <span class="site-row-title">{l.title?.trim() || l.url?.trim() || `Link ${i + 1}`}</span>
                    <button type="button" class="btn-icon danger" onclick={() => removeLink(field.key, i)} aria-label="Remove link" title="Remove link">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div class="site-grid">
                    <label class="sub-field">
                      Name
                      <input type="text" placeholder="Proxmox" value={l.title ?? ''} oninput={(e) => updateLink(field.key, i, { title: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field">
                      Icon <span class="opt">auto-filled from the link</span>
                      <input type="text" placeholder="di:proxmox" value={l.icon ?? ''} oninput={(e) => updateLink(field.key, i, { icon: e.currentTarget.value })} />
                    </label>
                    <label class="sub-field span2">
                      Link URL
                      <input type="text" placeholder="https://proxmox.lan:8006" value={l.url ?? ''} oninput={(e) => updateLink(field.key, i, { url: e.currentTarget.value })} onblur={() => fetchFavicon(field.key, i)} />
                    </label>
                  </div>
                </div>
              {/each}
              <button type="button" class="btn-add-site" onclick={() => addLink(field.key)}>
                <Plus size={14} /> Add link
              </button>
            </div>
          {:else if field.kind === 'list'}
            <div class="tag-input">
              {#each tags(field.key) as tag, i (i)}
                <span class="tag">{tag}<button type="button" onclick={() => removeTag(field.key, i)} aria-label={`Remove ${tag}`}>×</button></span>
              {/each}
              <input
                type="text"
                class="tag-entry"
                value={tagDraft[field.key] ?? ''}
                oninput={(e) => (tagDraft[field.key] = e.currentTarget.value)}
                onkeydown={(e) => onTagKey(e, field.key)}
                onblur={() => addTag(field.key)}
                placeholder={tags(field.key).length ? 'Add another…' : 'Type and press Enter'}
              />
            </div>
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
  .backup {
    margin-top: 36px;
    padding-top: 26px;
    border-top: 1px solid var(--glass-brd);
  }
  .backup-head h2 {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-top: 2px;
  }
  .backup-head .settings-sub {
    margin-top: 6px;
    margin-bottom: 16px;
  }
  .backup-warn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: 60ch;
    padding: 12px 14px;
    margin-bottom: 18px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warn) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
    color: var(--ink);
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.45;
  }
  .backup-warn :global(svg) {
    flex: none;
    margin-top: 1px;
    color: var(--warn);
  }
  .backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .backup-actions button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
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
    width: min(560px, calc(100vw - 24px));
    max-height: calc(100dvh - 32px);
    display: flex;
    flex-direction: column;
    background: var(--wall);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .form-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--glass-brd);
  }
  .form-head h2 {
    font-size: 1.1rem;
    font-weight: 800;
  }

  .svc-fields {
    flex: 1 1 auto;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 20px;
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
    /* 16px minimum prevents iOS Safari from zooming in on focus. */
    font-size: 16px;
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
  /* The rule above targets every input; checkboxes must opt out of full-width box styling. */
  input[type="checkbox"],
  input[type="radio"] {
    width: 18px;
    height: 18px;
    min-width: 0;
    flex: 0 0 auto;
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    accent-color: var(--accent);
    cursor: pointer;
  }

  /* --- tag/chip list fields --- */
  .tag-input {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 6px;
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8rem;
    padding: 3px 4px 3px 9px;
    border-radius: var(--pill);
    background: var(--surface);
    border: 1px solid var(--glass-brd);
  }
  .tag button {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    border-radius: var(--pill);
    background: transparent;
    color: var(--ink-dim);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .tag button:hover {
    background: var(--glass-brd);
  }
  .tag-entry {
    flex: 1;
    min-width: 140px;
    width: auto;
    border: none;
    background: transparent;
    padding: 4px 6px;
  }

  /* --- structured monitor sites editor --- */
  .sites-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .site-row {
    border: 1px solid var(--glass-brd);
    border-radius: var(--radius-sm);
    background: var(--surface);
    padding: 12px;
  }
  .site-row-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .site-badge {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    overflow: hidden;
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
  }
  .site-badge :global(img),
  .site-badge :global(svg) {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .site-row-title {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .site-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 12px;
  }
  .sub-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .sub-field input {
    min-width: 0;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }
  .sub-field .opt {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
    color: var(--ink-faint);
  }
  .span2 {
    grid-column: 1 / -1;
  }
  .btn-add-site {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 8px 12px;
    font-size: 0.84rem;
    border: 1px dashed var(--glass-brd);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  .btn-add-site:hover {
    background: var(--glass-2);
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
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 14px 20px;
    border-top: 1px solid var(--glass-brd);
    background: var(--glass-2);
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

  @media (max-width: 640px) {
    .form-panel {
      width: calc(100vw - 16px);
      max-height: calc(100dvh - 16px);
    }
    /* roomier touch targets on phones */
    .btn-icon {
      width: 40px;
      height: 40px;
    }
    .tag button {
      width: 26px;
      height: 26px;
      font-size: 16px;
    }
    .site-grid {
      grid-template-columns: 1fr;
    }
    /* full-width primary/secondary actions = easier to hit */
    .settings-footer {
      gap: 10px;
    }
    .btn-cancel,
    .btn-save {
      flex: 1;
      padding: 13px 16px;
    }
    .row-field {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }
  }

  .svc-card[draggable='true'] { cursor: default; }
  .svc-card.dragging { opacity: 0.5; }
  .drag-handle {
    cursor: grab;
    color: var(--ink-faint);
    font-size: 18px;
    line-height: 1;
    user-select: none;
    padding-right: 2px;
  }
  .drag-handle:active { cursor: grabbing; }
</style>
