import { describe, expect, test } from 'bun:test';
import { aggregateForecastDays, parseCurrentWeather } from './openweather';

describe('aggregateForecastDays', () => {
  test('groups 3-hour steps into daily min/max', () => {
    const base = Date.UTC(2026, 5, 16, 12, 0, 0) / 1000;
    const list = [
      { dt: base, main: { temp: 20, temp_min: 18, temp_max: 22 }, weather: [{ icon: '01d' }] },
      { dt: base + 3 * 3600, main: { temp: 24, temp_min: 22, temp_max: 26 }, weather: [{ icon: '02d' }] },
      { dt: base + 24 * 3600, main: { temp: 15, temp_min: 12, temp_max: 16 }, weather: [{ icon: '10d' }] },
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
