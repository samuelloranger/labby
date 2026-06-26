export type Site = {
  title: string;
  url?: string;
  checkUrl: string;
  icon?: string;
  okCodes?: number[];
};

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
};

export type IntegrationRow = {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  refreshSeconds: number | null;
  position: number;
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
