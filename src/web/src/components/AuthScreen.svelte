<script lang="ts">
  import { LogIn, LogOut, ShieldX } from '@lucide/svelte';
  import type { AuthScreen } from '$lib/auth';

  let { screen }: { screen: AuthScreen } = $props();
</script>

<main class="auth-screen">
  <section class="card auth-card" aria-labelledby="auth-title">
    <p class="brand"><img class="logo" src="/icons/labby.svg" alt="" width="28" height="28" /><span>labby</span></p>
    <div class="auth-badge" aria-hidden="true">
      {#if screen.kind === 'forbidden'}<ShieldX size={22} />{:else}<LogOut size={22} />{/if}
    </div>
    {#if screen.kind === 'forbidden'}
      <h1 id="auth-title">Not allowed</h1>
      <p class="auth-msg">Signed in as <b>{screen.user}</b>, which isn’t allowed to use this dashboard.</p>
      <a class="settings-btn auth-btn" href="/auth/logout"><LogOut size={16} />Sign out</a>
    {:else}
      <h1 id="auth-title">Signed out</h1>
      <p class="auth-msg">Your Labby session has ended.</p>
      <a class="settings-btn auth-btn" href="/"><LogIn size={16} />Sign in again</a>
    {/if}
  </section>
</main>

<style>
  .auth-screen {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px 16px;
  }
  .auth-card {
    width: min(420px, 100%);
    padding: 32px 28px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .auth-badge {
    width: 52px;
    height: 52px;
    margin-top: 6px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--glass-2);
    border: 1px solid var(--glass-brd);
    color: var(--accent-ink);
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .auth-msg {
    margin: 0;
    max-width: 32ch;
    color: var(--ink-dim);
    font-size: 0.92rem;
  }
  .auth-msg b {
    color: var(--ink);
  }
  /* `.card a` / `.card a:hover` in app.css recolor links inside cards (to the
     ink / accent color), which would put accent text on the accent button.
     Scoped selectors here out-rank them; white matches the Save button. */
  .auth-btn,
  .auth-btn:hover {
    color: #fff;
  }
  .auth-btn {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
</style>
