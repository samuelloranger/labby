import type { WeatherForecastDay, WeatherLocationData } from '../types';

export type WeatherQuery = {
  key: string;
  city?: string;
  lat?: number;
  lon?: number;
  units: 'metric' | 'imperial';
};

type OwmCurrent = {
  name?: string;
  sys?: { country?: string; sunrise?: number; sunset?: number };
  main?: {
    temp?: number;
    feels_like?: number;
    temp_min?: number;
    temp_max?: number;
    humidity?: number;
  };
  wind?: { speed?: number; deg?: number };
  weather?: Array<{ description?: string; icon?: string }>;
};

type OwmForecast = {
  list?: Array<{
    dt: number;
    main?: { temp?: number; temp_min?: number; temp_max?: number };
    weather?: Array<{ icon?: string }>;
  }>;
};

function apiKey(): string | null {
  return process.env.OPENWEATHER_API_KEY?.trim() || null;
}

function locationParams(query: WeatherQuery): URLSearchParams {
  const params = new URLSearchParams({ units: query.units });
  if (query.city) params.set('q', query.city);
  else if (query.lat != null && query.lon != null) {
    params.set('lat', String(query.lat));
    params.set('lon', String(query.lon));
  }
  return params;
}

const DAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });

export function aggregateForecastDays(
  list: NonNullable<OwmForecast['list']>,
  limit = 4,
): WeatherForecastDay[] {
  const byDay = new Map<string, { temps: number[]; icons: Array<{ icon: string; dt: number }> }>();

  for (const item of list) {
    const date = new Date(item.dt * 1000);
    const key = date.toISOString().slice(0, 10);
    const temps = [
      Number(item.main?.temp),
      Number(item.main?.temp_min),
      Number(item.main?.temp_max),
    ].filter((n) => Number.isFinite(n));
    const icon = item.weather?.[0]?.icon ?? '01d';
    const bucket = byDay.get(key) ?? { temps: [], icons: [] };
    bucket.temps.push(...temps);
    bucket.icons.push({ icon, dt: item.dt });
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([date, bucket]) => {
      const noonish =
        bucket.icons.reduce(
          (best, cur) =>
            Math.abs((cur.dt % 86400) - 43200) < Math.abs((best.dt % 86400) - 43200) ? cur : best,
          bucket.icons[0],
        ) ?? bucket.icons[0];
      return {
        date,
        label: DAY_FMT.format(new Date(`${date}T12:00:00`)),
        tempMin: Math.round(Math.min(...bucket.temps)),
        tempMax: Math.round(Math.max(...bucket.temps)),
        icon: noonish?.icon ?? '01d',
      };
    });
}

export function parseCurrentWeather(
  json: OwmCurrent,
  forecast: WeatherForecastDay[],
  units: 'metric' | 'imperial',
): WeatherLocationData {
  const main = json.main ?? {};
  const weather = json.weather?.[0];
  return {
    city: json.name ?? 'Unknown',
    country: json.sys?.country,
    temp: Math.round(Number(main.temp ?? 0)),
    feelsLike: Math.round(Number(main.feels_like ?? main.temp ?? 0)),
    tempMin: Math.round(Number(main.temp_min ?? main.temp ?? 0)),
    tempMax: Math.round(Number(main.temp_max ?? main.temp ?? 0)),
    humidity: Math.round(Number(main.humidity ?? 0)),
    windSpeed: Math.round(Number(json.wind?.speed ?? 0) * 10) / 10,
    windDeg: Math.round(Number(json.wind?.deg ?? 0)),
    description: weather?.description ?? '',
    icon: weather?.icon ?? '01d',
    sunrise: Number(json.sys?.sunrise ?? 0),
    sunset: Number(json.sys?.sunset ?? 0),
    units,
    forecast,
  };
}

export async function getOpenWeather(
  query: WeatherQuery,
): Promise<WeatherLocationData | { error: string }> {
  const key = apiKey();
  if (!key) return { error: 'OPENWEATHER_API_KEY not configured' };
  if (!query.city && (query.lat == null || query.lon == null)) {
    return { error: 'Weather location not configured' };
  }

  try {
    const params = locationParams(query);
    params.set('appid', key);

    const [currentRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?${params}`, {
        signal: AbortSignal.timeout(15000),
      }),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?${params}&cnt=32`, {
        signal: AbortSignal.timeout(15000),
      }),
    ]);

    if (!currentRes.ok) {
      const body = await currentRes.text().catch(() => '');
      if (currentRes.status === 401) {
        return {
          error:
            'OpenWeather rejected the API key (401). New keys can take up to 2 hours to activate; confirm the key at home.openweathermap.org/api_keys and recreate the container after updating .env.',
        };
      }
      return {
        error: `OpenWeather error: ${currentRes.status}${body ? ` — ${body.slice(0, 80)}` : ''}`,
      };
    }
    if (!forecastRes.ok) {
      return { error: `OpenWeather forecast error: ${forecastRes.status}` };
    }

    const current = (await currentRes.json()) as OwmCurrent;
    const forecastJson = (await forecastRes.json()) as OwmForecast;
    const forecast = aggregateForecastDays(forecastJson.list ?? []);

    return parseCurrentWeather(current, forecast, query.units);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'OpenWeather unreachable' };
  }
}
