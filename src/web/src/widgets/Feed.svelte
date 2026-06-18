<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { getStore, searchQuery, type FeedData, type WidgetState } from '$lib/stores';
  import { formatNumber, timeAgo } from '$lib/utils';

  let {
    title,
    integrationId,
    icon,
    fallback = 'globe',
    max = 5,
  }: { title: string; integrationId: number; icon: string; fallback?: string; max?: number } = $props();

  const store = getStore(integrationId);
  const state = $derived($store as WidgetState<FeedData>);
  let modalOpen = $state(false);

  const posts = $derived(state.data?.posts ?? []);
  const visible = $derived(posts.slice(0, max));
</script>

{#snippet rows(items: FeedData['posts'])}
  <div class="feed">
    {#each items as p}
      <a class="feed-row" href={p.url} target="_blank" rel="noopener">
        {#if p.score}<span class="feed-score">▲ {formatNumber(p.score)}</span>{/if}
        <span class="feed-main">
          <span class="feed-title">{p.title}</span>
          <span class="feed-sub">
            {p.subreddit ?? p.author ?? ''}{#if p.comments} · {formatNumber(p.comments)} comments{/if}{#if p.createdUtc} · {timeAgo(p.createdUtc)}{/if}
          </span>
        </span>
      </a>
    {/each}
  </div>
{/snippet}

{#if !$searchQuery.trim()}
  <section class="card">
    <div class="chead">
      <span class="ti">
        <span class="ibox"><Icon {icon} {fallback} size={18} /></span>
        {title}
      </span>
      {#if posts.length}<span class="meta">{posts.length}</span>{/if}
    </div>

    {#if state.loading && !state.data}
      <div class="skeleton" style="height:120px"></div>
    {:else if state.error}
      <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
    {:else if posts.length === 0}
      <p class="state-msg">No posts</p>
    {:else}
      {@render rows(visible)}
      {#if posts.length > max}
        <button class="card-cta" onclick={() => (modalOpen = true)}>View all {posts.length} →</button>
      {/if}
    {/if}
  </section>
{/if}

{#if modalOpen}
  <Modal title={title} meta={`${posts.length} posts`} onClose={() => (modalOpen = false)}>
    {@render rows(posts)}
  </Modal>
{/if}
