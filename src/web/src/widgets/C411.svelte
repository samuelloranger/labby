<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type C411Data, type WidgetState } from '$lib/stores';

  let { title, integrationId }: { title: string; integrationId: number } = $props();
  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<C411Data>);
  const data = $derived(state.data);
  const avatarSrc = $derived(data?.avatarUrl ? `/api/integrations/${integrationId}/c411-avatar?v=${data.updatedAt}` : null);
  let failedAvatar = $state<string | null>(null);
  const xpGoal = $derived((data?.xpIntoLevel ?? 0) + (data?.xpToNextLevel ?? 0));
  const xpPercent = $derived(xpGoal > 0 ? Math.min(100, (data?.xpIntoLevel ?? 0) / xpGoal * 100) : 0);
  const grade = $derived(data?.class?.progress.grade);
  const tiers = { bronze: 'Bronze', argent: 'Silver', or: 'Gold' };
  const rankLabel = $derived(data?.class
    ? label(data.class.slug) + (grade ? ` · ${tiers[grade.tier]} ${['I', 'II', 'III', 'IV'][grade.level - 1]}` : '')
    : null);
  const paths = [
    { key: 'seed', label: 'Seed' }, { key: 'upload', label: 'Upload' },
    { key: 'specialization', label: 'Specialization' }, { key: 'competitivity', label: 'Competitivity' },
  ] as const;
  const sources = { personal: 'Personal', campaign: 'Site event', window: 'Freeleech window' };
  function label(slug: string): string {
    return slug.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  function volume(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let value = bytes, unit = 0;
    while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
    return `${value.toLocaleString([], { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
  }
</script>

<section class="card c411" class:stale={state.stale} aria-label={title}>
  <header class="widget-head">
    <h2><img class="service-logo" src="/icons/c411.png" alt="C411" width="80" height="32" />{#if title !== 'C411'}<span>{title}</span>{/if}</h2>
    <a href="https://c411.org/user/profile" target="_blank" rel="noopener noreferrer" aria-label="Open C411 profile"><Icon icon="lucide:external-link" fallback="external-link" size={16} /></a>
  </header>
  {#if state.loading && !data}
    <div class="loading" role="status" aria-label="Loading C411 profile">
      <div class="person"><div class="avatar skeleton"></div><div class="loading-name"><div class="skeleton"></div><div class="skeleton short"></div></div></div>
      <div class="skeleton loading-bar"></div><div class="skeleton loading-stats"></div>
    </div>
  {:else if state.error && !data}
    <p class="notice" role="alert">{state.error}</p>
  {:else if data}
    {#if state.error}
      <p class="notice" role="alert">{state.error} · Showing last successful update</p>
    {:else if state.stale}
      <p class="notice" role="status">Connection lost. Showing last successful update.</p>
    {/if}
    <div class="person">
      <div class="avatar-slot">
        {#if avatarSrc && failedAvatar !== avatarSrc}
          <img class="avatar" src={avatarSrc} alt={`${data.username}'s C411 avatar`} width="80" height="80" referrerpolicy="no-referrer" onerror={() => failedAvatar = avatarSrc} />
        {:else}
          <div class="avatar fallback" role="img" aria-label={`${data.username}'s avatar unavailable`}>{data.username.slice(0, 1).toUpperCase()}</div>
        {/if}
      </div>
      <div class="identity">
        <h3>{data.username}</h3>
        {#if data.class}
          <p class="rank" class:bronze={grade?.tier === 'bronze'} class:silver={grade?.tier === 'argent'} class:gold={grade?.tier === 'or'}>{rankLabel}</p>
        {:else}<p class="no-class">No class chosen</p>{/if}
        <p class="level">Level {data.level.toLocaleString()}</p>
      </div>
    </div>
    <div class="xp-section">
      <div class="xp-heading"><strong>{xpGoal > 0 ? `Level ${(data.level + 1).toLocaleString()}` : 'Level progress'}</strong><span>{xpGoal > 0 ? `${data.xpToNextLevel.toLocaleString()} XP to go` : 'No next-level target'}</span></div>
      <div class="xp-track" role="progressbar" aria-label={`XP toward level ${data.level + 1}`} aria-valuemin="0" aria-valuemax={Math.max(1, xpGoal)} aria-valuenow={data.xpIntoLevel} aria-valuetext={`${data.xpIntoLevel.toLocaleString()} of ${xpGoal.toLocaleString()} XP`}><span style:width={`${xpPercent}%`}></span></div>
      <p class="xp-caption"><b>{data.xpIntoLevel.toLocaleString()}</b> / {xpGoal.toLocaleString()} XP earned this level</p>
    </div>
    <dl class="stats">
      <div><dt>Zen balance</dt><dd class="zen">{data.zen.toLocaleString()}</dd></div>
      <div><dt>Share ratio</dt><dd>{data.ratio === null ? (data.uploaded > 0 ? '∞' : '—') : data.ratio.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
    </dl>
    {#if data.class}
      <details class="quests">
        <summary><span>Class quests</span><span class="quest-total">{data.class.progress.questsCompleted} / {data.class.progress.questsTotal} completed</span><span class="disclosure" aria-hidden="true">+</span></summary>
        <dl class="path-list">
          {#each paths as path (path.key)}
            {@const progress = data.class.voies[path.key]}
            <div class="path"><dt>{path.label}{#if progress.questsTotal === 0}<span class="inactive">No active quests</span>{/if}</dt><dd>{#if progress.star}<span class="earned-star" role="img" aria-label={`${path.label} star earned`} title="Earned star retained when new quests are added"><Icon icon="lucide:star" fallback="star" size={14} /></span>{/if}{progress.questsCompleted} / {progress.questsTotal}</dd></div>
          {/each}
          <div class="path bonus"><dt>Tree bonus</dt><dd>+{(data.class.treeBonusBp / 100).toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</dd></div>
        </dl>
      </details>
    {/if}
    <dl class="transfers"><div><dt>Uploaded</dt><dd>{volume(data.uploaded)}</dd></div><div><dt>Downloaded</dt><dd>{volume(data.downloaded)}</dd></div></dl>
    <div class="status" aria-live="polite"><span class="permission" class:blocked={!data.downloadAllowed}>Downloads {data.downloadAllowed ? 'allowed' : 'blocked'}</span><span title={data.freeleechSources.map((source) => sources[source]).join(', ')}>Freeleech {data.freeleech ? 'active' : 'off'}</span></div>
    {#if !data.downloadAllowed && data.blockedReason}<p class="blocked-reason">{data.blockedReason === 'insufficient_balance' ? 'Insufficient balance' : label(data.blockedReason)}</p>{/if}
    <p class="stamp">Updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
  {/if}
</section>

<style>
  :global(:root) .card.c411 {
    --c411-bg: #fff; --c411-surface: #edf2ef; --c411-ink: #17231d; --c411-muted: #52645a;
    --c411-line: #dae3dd; --c411-accent: #167250; --c411-bronze: #81511f; --c411-silver: #58646c; --c411-gold: #806000; --c411-error: #9e322a;
    background: var(--c411-bg); color: var(--c411-ink); padding: 22px; border: 0; border-radius: 12px;
    box-shadow: none; backdrop-filter: none; /* taste-skill-ignore: remove inherited glass and shadows for the approved flat card. */
    animation: none; font-size: 14px; font-variant-numeric: tabular-nums;
  }
  :global(:root[data-theme^='dark']) .c411 {
    --c411-bg: #171919; --c411-surface: #212424; --c411-ink: #f1f4f3; --c411-muted: #abb5b0;
    --c411-line: #303733; --c411-accent: #55d2a6; --c411-bronze: #e7bd87; --c411-silver: #c4d0d8; --c411-gold: #edce6d; --c411-error: #f3aaa3;
  }
  .c411 h2, .c411 h3, .c411 p, .c411 dl, .c411 dd { margin: 0; }
  .widget-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
  .widget-head h2 { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 16px; font-weight: 650; letter-spacing: -0.025em; }
  .service-logo { display: block; width: 80px; height: 32px; object-fit: contain; }
  .widget-head a { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; color: var(--c411-muted); }
  .widget-head a:hover { color: var(--c411-ink); }
  .person { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .avatar-slot { flex: none; }
  .avatar { display: block; width: 80px; height: 80px; border-radius: 9px; object-fit: cover; }
  .fallback { display: grid; place-items: center; background: var(--c411-surface); color: var(--c411-muted); font-size: 28px; font-weight: 550; }
  .identity { min-width: 0; }
  .identity h3 { font-size: 20px; font-weight: 650; line-height: 1.3; letter-spacing: -0.025em; overflow-wrap: anywhere; }
  .c411 .rank { margin-top: 5px; color: var(--c411-muted); font-size: 13px; font-weight: 550; overflow-wrap: anywhere; }
  .rank.bronze { color: var(--c411-bronze); } .rank.silver { color: var(--c411-silver); } .rank.gold { color: var(--c411-gold); }
  .c411 .level, .c411 .no-class { color: var(--c411-muted); font-size: 13px; margin-top: 5px; }
  .xp-section { margin-top: 24px; }
  .xp-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .xp-heading strong { font-size: 14px; font-weight: 550; }
  .xp-heading span { font-size: 13px; color: var(--c411-muted); text-align: right; }
  .xp-track { height: 5px; border-radius: 3px; background: var(--c411-line); overflow: hidden; }
  .xp-track > span { display: block; height: 100%; background: var(--c411-accent); border-radius: inherit; }
  .c411 .xp-caption { margin-top: 8px; font-size: 13px; color: var(--c411-muted); }
  .xp-caption b { color: var(--c411-ink); font-weight: 500; }
  .c411 .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 22px; }
  .stats div:last-child { text-align: right; } .stats dt { color: var(--c411-muted); font-size: 13px; margin-bottom: 4px; }
  .stats dd { font-size: 22px; line-height: 1.5; font-weight: 500; overflow-wrap: anywhere; } .stats .zen { color: var(--c411-accent); }
  .quests { margin-top: 16px; }
  .quests summary { display: flex; align-items: center; gap: 12px; min-height: 44px; cursor: pointer; color: var(--c411-muted); font-size: 13px; list-style: none; }
  .quests summary::-webkit-details-marker { display: none; } .quest-total { margin-left: auto; text-align: right; }
  .disclosure { font-size: 18px; } .quests[open] .disclosure { font-size: 0; } .quests[open] .disclosure::after { content: '−'; font-size: 18px; }
  .path { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 36px; padding: 6px 0; font-size: 13px; }
  .path dt { color: var(--c411-muted); } .path dd { display: flex; align-items: center; gap: 8px; text-align: right; white-space: nowrap; }
  .inactive { display: block; font-size: 12px; } .earned-star { display: inline-flex; color: var(--c411-gold); } .bonus { margin-top: 6px; }
  .c411 .transfers { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin-top: 20px; font-size: 13px; }
  .transfers > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; } .transfers > div:last-child { margin-left: auto; }
  .transfers dt { color: var(--c411-muted); } .transfers dd { font-weight: 500; }
  .status { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-top: 15px; margin-top: 18px; border-top: 1px solid var(--c411-line); font-size: 13px; color: var(--c411-muted); }
  .permission { display: inline-flex; align-items: center; gap: 6px; color: var(--c411-accent); }
  .permission::before { content: ''; display: block; width: 5px; height: 5px; flex: none; border-radius: 50%; background: currentColor; }
  .permission.blocked { color: var(--c411-error); }
  .c411 .stamp { margin-top: 14px; font-size: 12px; color: var(--c411-muted); }
  .c411 .notice { margin-bottom: 18px; color: var(--c411-error); font-size: 13px; line-height: 1.6; }
  .c411 .blocked-reason { margin-top: 8px; color: var(--c411-error); font-size: 13px; }
  .c411 .skeleton { background: var(--c411-surface); background-image: none; animation: none; }
  .loading { min-height: 350px; } .loading-name { width: 60%; } .loading-name .skeleton { height: 20px; margin-bottom: 10px; }
  .loading-name .short { width: 65%; height: 14px; } .loading-bar { margin-top: 30px; height: 42px; } .loading-stats { margin-top: 24px; height: 70px; }
  @media (max-width: 600px) { :global(:root) .card.c411 { padding: 20px; } .person { gap: 14px; } .avatar { width: 72px; height: 72px; } .identity h3 { font-size: 19px; } .widget-head a { width: 32px; height: 32px; } }
</style>
