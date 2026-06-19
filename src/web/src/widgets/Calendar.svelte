<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { getStore, type CalendarData, type CalendarEvent, type WidgetState } from '$lib/stores';

  let { title, integrationId, max = 8 }: { title: string; integrationId: number; max?: number } = $props();

  const store = $derived(getStore(integrationId));
  const state = $derived($store as WidgetState<CalendarData>);
  const events = $derived.by<CalendarEvent[]>(() => {
    const all = state.data?.events ?? [];
    const now = Date.now();
    return all
      .filter((ev) => {
        if (ev.allDay) {
          const endDate = new Date(ev.end);
          const localEnd = new Date(
            endDate.getUTCFullYear(),
            endDate.getUTCMonth(),
            endDate.getUTCDate()
          ).getTime();
          return localEnd > now;
        }
        return ev.end > now;
      })
      .slice(0, max);
  });

  // Group events by calendar day for an agenda layout.
  type Group = { key: string; label: string; events: CalendarEvent[] };
  const groups = $derived.by<Group[]>(() => {
    const out: Group[] = [];
    for (const ev of events) {
      const key = dayKey(ev);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: dayLabel(ev), events: [] };
        out.push(g);
      }
      g.events.push(ev);
    }
    return out;
  });

  // All-day events are date-only and timezone-agnostic: the feed encodes them as
  // VALUE=DATE (UTC midnight), so read their day in UTC. Timed events are real
  // instants, shown in the viewer's local zone.
  function dayParts(ev: CalendarEvent): { y: number; m: number; d: number } {
    const date = new Date(ev.start);
    return ev.allDay
      ? { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() }
      : { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
  }

  function dayKey(ev: CalendarEvent): string {
    const p = dayParts(ev);
    return `${p.y}-${p.m}-${p.d}`;
  }

  function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dayLabel(ev: CalendarEvent): string {
    const p = dayParts(ev);
    const day = new Date(p.y, p.m, p.d);
    const diff = Math.round((day.getTime() - startOfDay(new Date())) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function timeLabel(ev: CalendarEvent): string {
    if (ev.allDay) return 'All day';
    return new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
</script>

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
