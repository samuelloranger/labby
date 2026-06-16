<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { searchQuery } from '$lib/stores';
  import { formatNumber, timeAgo } from '$lib/utils';

  type Post = {
    title: string;
    url: string;
    score: number;
    comments: number;
    author?: string;
    subreddit?: string;
    domain?: string;
    createdUtc: number;
  };

  let {
    title,
    endpoint,
    icon,
    fallback = 'globe',
    max = 10,
  }: { title: string; endpoint: string; icon: string; fallback?: string; max?: number } = $props();

  let st = $state<{ loading: boolean; error: string | null; posts: Post[] }>({
    loading: true,
    error: null,
    posts: [],
  });
  let modalOpen = $state(false);

  const visible = $derived(st.posts.slice(0, max));

  async function load() {
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.error) st = { loading: false, error: data.error, posts: [] };
      else st = { loading: false, error: null, posts: data.posts ?? [] };
    } catch {
      st = { loading: false, error: 'Failed to load', posts: [] };
    }
  }

  // client-side 5min poll — these feeds aren't realtime, so they skip
  // the SSE channel plumbing the status widgets use.
  onMount(() => {
    load();
    const t = setInterval(load, 300000);
    return () => clearInterval(t);
  });
</script>

{#snippet rows(posts: Post[])}
  <div class="feed">
    {#each posts as p}
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
      {#if st.posts.length}<span class="meta">{st.posts.length}</span>{/if}
    </div>

    {#if st.loading}
      <div class="skeleton" style="height:120px"></div>
    {:else if st.error}
      <p class="state-msg error"><span class="dot down"></span>{st.error}</p>
    {:else if st.posts.length === 0}
      <p class="state-msg">No posts</p>
    {:else}
      {@render rows(visible)}
      {#if st.posts.length > max}
        <button class="card-cta" onclick={() => (modalOpen = true)}>View all {st.posts.length} →</button>
      {/if}
    {/if}
  </section>
{/if}

{#if modalOpen}
  <Modal title={title} meta={`${st.posts.length} posts`} onClose={() => (modalOpen = false)}>
    {@render rows(st.posts)}
  </Modal>
{/if}
