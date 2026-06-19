export type Site = {
  title: string;
  url?: string;
  checkUrl: string;
  icon?: string;
  okCodes?: number[];
};

export type Widget =
  | {
      type: 'monitor';
      title: string;
      integrationId: number;
      style?: 'compact' | 'default';
      variant?: 'rows' | 'tiles';
    }
  | { type: 'docker'; title: string; integrationId: number }
  | { type: 'downloads'; title: string; integrationId: number; max?: number }
  | { type: 'adguard'; title: string; integrationId: number }
  | { type: 'jellyfin'; title: string; integrationId: number }
  | { type: 'beszel'; title: string; integrationId: number; systems?: string[]; max?: number }
  | { type: 'radarr'; title: string; integrationId: number; max?: number }
  | { type: 'sonarr'; title: string; integrationId: number; max?: number }
  | { type: 'reelward'; title: string; integrationId: number; max?: number }
  | { type: 'reddit'; title: string; integrationId: number; max?: number }
  | { type: 'hackernews'; title: string; integrationId: number; max?: number }
  | { type: 'weather'; title: string; integrationId: number }
  | { type: 'calendar'; title: string; integrationId: number; max?: number }
  | { type: 'speedtest'; title: string; integrationId: number; max?: number };

export type Column = { size: 'small' | 'full'; widgets: Widget[] };
export type Page = { name: string; columns: Column[] };

export type LayoutType = 'masonry' | 'columns';

export type ThemeName =
  | 'system'
  | 'light'
  | 'light-slate'
  | 'light-mint'
  | 'light-rose'
  | 'light-nord'
  | 'light-peach'
  | 'dark'
  | 'dark-graphite'
  | 'dark-ocean'
  | 'dark-forest'
  | 'dark-dracula'
  | 'dark-nord'
  | 'dark-cyberpunk'
  | 'dark-slate'
  | 'dark-mint'
  | 'dark-rose'
  | 'dark-peach'
  | 'light-graphite'
  | 'light-ocean'
  | 'light-forest'
  | 'light-dracula'
  | 'light-cyberpunk';

export type Dashboard = {
  title: string;
  theme: {
    default: ThemeName;
    layout: LayoutType;
    density?: 'default' | 'compact';
    customCss?: string;
  };
  pages: Page[];
};

export type IntegrationRow = {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  refreshSeconds: number | null;
};

export type FieldDef = {
  key: string;
  label: string;
  secret?: boolean;
  kind?: 'text' | 'number' | 'list' | 'select';
  options?: string[];
};

export type IntegrationTypeMeta = {
  type: string;
  label: string;
  defaultRefreshSeconds: number;
  fields: FieldDef[];
};
