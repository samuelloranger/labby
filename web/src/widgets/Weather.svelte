<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { searchQuery, weatherStore } from '$lib/stores';
  import { tempUnit, weatherIconUrl, windLabel, windUnit } from '$lib/utils';

  let {
    title,
    city,
    lat,
    lon,
  }: { title: string; city?: string; lat?: number; lon?: number } = $props();

  const state = $derived($weatherStore);
  const locationKey = $derived(
    city ? `city:${city}` : lat != null && lon != null ? `coord:${lat},${lon}` : null,
  );
  const entry = $derived(locationKey ? state.data?.locations[locationKey] : null);
  const data = $derived(entry && !('error' in entry) ? entry : null);
  const locationError = $derived(
    !locationKey
      ? 'Weather widget requires city or lat/lon'
      : entry && 'error' in entry
        ? entry.error
        : state.error,
  );
</script>

{#if !$searchQuery.trim()}
<section class="card weather-card">
  <div class="chead">
    <span class="ti">
      <span class="ibox"><Icon icon="lucide:cloud-sun" fallback="cloud-sun" size={20} /></span>
      {title}
      {#if data}
        <span class="weather-place">
          {data.city}{#if data.country}, {data.country}{/if}
        </span>
      {/if}
    </span>
  </div>

  {#if state.loading && !data}
    <div class="skeleton" style="height:140px"></div>
  {:else if locationError && !data}
    <p class="state-msg error"><span class="dot down"></span>{locationError}</p>
  {:else if data}
    <div class="weather-hero">
      <img class="weather-icon" src={weatherIconUrl(data.icon)} alt="" width="72" height="72" />
      <div class="weather-main">
        <div class="weather-temp">{data.temp}{tempUnit(data.units)}</div>
        <div class="weather-desc">{data.description}</div>
        <div class="weather-range">
          H {data.tempMax}{tempUnit(data.units)} · L {data.tempMin}{tempUnit(data.units)}
        </div>
      </div>
    </div>

    <div class="gauges weather-stats">
      <div class="gauge">
        <div class="v">{data.feelsLike}{tempUnit(data.units)}</div>
        <div class="k">Feels like</div>
      </div>
      <div class="gauge">
        <div class="v">{data.humidity}%</div>
        <div class="k">Humidity</div>
      </div>
      <div class="gauge">
        <div class="v">{data.windSpeed} {windUnit(data.units)}</div>
        <div class="k">Wind {windLabel(data.windDeg)}</div>
      </div>
      <div class="gauge">
        <div class="v accent">{data.forecast.length ? `${data.forecast[0].tempMax}°` : '—'}</div>
        <div class="k">Today high</div>
      </div>
    </div>

    {#if data.forecast.length > 1}
      <div class="weather-forecast">
        {#each data.forecast.slice(1) as day}
          <div class="weather-day">
            <span class="weather-day-label">{day.label}</span>
            <img class="weather-day-icon" src={weatherIconUrl(day.icon)} alt="" width="32" height="32" />
            <span class="weather-day-temps">
              <span class="hi">{day.tempMax}°</span>
              <span class="lo">{day.tempMin}°</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
{/if}
