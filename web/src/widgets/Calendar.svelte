<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { calendarStore, searchQuery } from '$lib/stores';
  import type { CalendarEvent } from '$lib/stores';

  let { title, max = 8 }: { title: string; max?: number } = $props();

  const state = $derived($calendarStore);
  const events = $derived((state.data?.events ?? []).slice(0, max));

  // Group events by calendar day for an agenda layout.
  type Group = { key: string; label: string; events: CalendarEvent[] };
  const groups = $derived.by<Group[]>(() => {
    const out: Group[] = [];
    for (const ev of events) {
      const key = dayKey(ev.start);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: dayLabel(ev.start), events: [] };
        out.push(g);
      }
      g.events.push(ev);
    }
    return out;
  });

  function dayKey(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dayLabel(ms: number): string {
    const today = startOfDay(new Date());
    const day = startOfDay(new Date(ms));
    const diff = Math.round((day - today) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function timeLabel(ev: CalendarEvent): string {
    if (ev.allDay) return 'All day';
    return new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
</script>

{#if !$searchQuery.trim()}
<section class="card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="lucide:calendar" fallback="calendar" size={20} /></span>
      {title}
    </span>
    {#if events.length}
      <span class="meta">{events.length}</span>
    {/if}
  </div>

  {#if state.loading && !state.data}
    <div class="skeleton" style="height:120px"></div>
  {:else if state.error}
    <p class="state-msg error"><span class="dot down"></span>{state.error}</p>
  {:else if !events.length}
    <p class="state-msg">Nothing coming up</p>
  {:else}
    <div class="agenda">
      {#each groups as group (group.key)}
        <div class="agenda-day">{group.label}</div>
        {#each group.events as ev (ev.calendar + ev.start + ev.title)}
          <div class="agenda-row">
            <span class="agenda-time" class:allday={ev.allDay}>{timeLabel(ev)}</span>
            <span class="agenda-body">
              <span class="agenda-title">{ev.title}</span>
              {#if ev.location}<span class="agenda-loc">{ev.location}</span>{/if}
            </span>
            {#if ev.calendar}<span class="agenda-cal">{ev.calendar}</span>{/if}
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</section>
{/if}
