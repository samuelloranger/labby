import { describe, expect, mock, test } from 'bun:test';
import { aggregateForecastDays, getOpenWeather, parseCurrentWeather } from './openweather';

describe('aggregateForecastDays', () => {
  test('groups 3-hour steps into daily min/max', () => {
    const base = Date.UTC(2026, 5, 16, 12, 0, 0) / 1000;
    const list = [
      { dt: base, main: { temp: 20, temp_min: 18, temp_max: 22 }, weather: [{ icon: '01d' }] },
      {
        dt: base + 3 * 3600,
        main: { temp: 24, temp_min: 22, temp_max: 26 },
        weather: [{ icon: '02d' }],
      },
      {
        dt: base + 24 * 3600,
        main: { temp: 15, temp_min: 12, temp_max: 16 },
        weather: [{ icon: '10d' }],
      },
    ];
    const days = aggregateForecastDays(list, 2);
    expect(days).toHaveLength(2);
    expect(days[0].tempMin).toBe(18);
    expect(days[0].tempMax).toBe(26);
    expect(days[1].tempMin).toBe(12);
    expect(days[1].tempMax).toBe(16);
  });
});

describe('parseCurrentWeather', () => {
  test('maps OpenWeather fields', () => {
    const data = parseCurrentWeather(
      {
        name: 'Paris',
        sys: { country: 'FR', sunrise: 100, sunset: 200 },
        main: { temp: 21.4, feels_like: 20.1, temp_min: 18, temp_max: 24, humidity: 55 },
        wind: { speed: 3.2, deg: 180 },
        weather: [{ description: 'clear sky', icon: '01d' }],
      },
      [],
      'metric',
    );
    expect(data.city).toBe('Paris');
    expect(data.temp).toBe(21);
    expect(data.windSpeed).toBe(3.2);
    expect(data.description).toBe('clear sky');
    expect(data.units).toBe('metric');
  });
});

describe('getOpenWeather', () => {
  test('reports missing config', async () => {
    expect(await getOpenWeather({})).toEqual({ error: 'OPENWEATHER_API_KEY not configured' });
    expect(await getOpenWeather({ apiKey: 'key' })).toEqual({
      error: 'Weather location not configured',
    });
  });

  test('maps current weather and forecast', async () => {
    const config = { apiKey: 'owm-key', city: 'Paris', units: 'metric' as const };
    const base = Date.UTC(2026, 5, 16, 12, 0, 0) / 1000;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/data/2.5/weather')) {
        return Response.json({
          name: 'Paris',
          sys: { country: 'FR', sunrise: 100, sunset: 200 },
          main: { temp: 21.4, feels_like: 20.1, temp_min: 18, temp_max: 24, humidity: 55 },
          wind: { speed: 3.2, deg: 180 },
          weather: [{ description: 'clear sky', icon: '01d' }],
        });
      }
      if (url.includes('/data/2.5/forecast')) {
        return Response.json({
          list: [
            {
              dt: base,
              main: { temp: 20, temp_min: 18, temp_max: 22 },
              weather: [{ icon: '01d' }],
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getOpenWeather(config);
    globalThis.fetch = originalFetch;

    expect('city' in result).toBe(true);
    if ('city' in result) {
      expect(result.city).toBe('Paris');
      expect(result.temp).toBe(21);
      expect(result.forecast.length).toBeGreaterThan(0);
    }
  });

  test('returns error on 401 response', async () => {
    const config = { apiKey: 'bad', city: 'Paris' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/weather')) return new Response('Unauthorized', { status: 401 });
      if (url.includes('/forecast')) return Response.json({ list: [] });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await getOpenWeather(config);
    globalThis.fetch = originalFetch;

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('401');
    }
  });

  test('returns error when fetch throws', async () => {
    const config = { apiKey: 'key', lat: 1, lon: 2 };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error('owm down');
    }) as unknown as typeof fetch;

    const result = await getOpenWeather(config);
    globalThis.fetch = originalFetch;

    expect(result).toEqual({ error: 'owm down' });
  });
});
