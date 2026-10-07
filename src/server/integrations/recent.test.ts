import { describe, expect, test } from 'bun:test';
import { groupSeasons, type RecentCandidate } from './recent';

const episode = (id: string, season: string, subtitle: string): RecentCandidate => ({
  id,
  kind: 'tv',
  title: 'Series',
  subtitle,
  addedAt: '',
  season: { key: `series:${season}`, label: `S${season}` },
});

describe('groupSeasons', () => {
  test('collapses a season into one tile at its newest position', () => {
    const movie: RecentCandidate = {
      id: 'm',
      kind: 'movie',
      title: 'Film',
      subtitle: '2025',
      addedAt: '',
    };
    const result = groupSeasons([
      episode('e3', '02', 'S02E03 · C'),
      movie,
      episode('e2', '02', 'S02E02 · B'),
      episode('x1', '01', 'S01E01 · A'),
      episode('e1', '02', 'S02E01 · A'),
    ]);
    expect(result.map((i) => [i.id, i.subtitle])).toEqual([
      ['e3', 'S02 · 3 episodes'],
      ['m', '2025'],
      ['x1', 'S01E01 · A'],
    ]);
    expect(result.some((i) => 'season' in i)).toBe(false);
  });
});
