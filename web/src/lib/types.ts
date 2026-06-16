export type Site = {
  title: string;
  url?: string;
  checkUrl: string;
  icon?: string;
  okCodes?: number[];
};

export type Widget =
  | { type: 'monitor'; title: string; style?: 'compact' | 'default'; variant?: 'rows' | 'tiles'; sites: Site[] }
  | { type: 'docker'; title: string; show?: 'all' | 'running' }
  | { type: 'downloads'; title: string; client: 'qbittorrent' | 'transmission'; max?: number }
  | { type: 'adguard'; title: string }
  | { type: 'jellyfin'; title: string }
  | { type: 'beszel'; title: string; systems?: string[]; max?: number }
  | { type: 'reddit'; title: string; subreddit: string | string[]; max?: number }
  | { type: 'hackernews'; title: string; max?: number }
  | {
      type: 'weather';
      title: string;
      city?: string;
      lat?: number;
      lon?: number;
      units?: 'metric' | 'imperial';
    }
  | { type: 'calendar'; title: string; max?: number };

export type Column = { size: 'small' | 'full'; widgets: Widget[] };
export type Page = { name: string; columns: Column[] };

export type Dashboard = {
  title: string;
  theme: { default: 'light' | 'dark' | 'system' };
  refreshSeconds: Record<string, number>;
  pages: Page[];
};
