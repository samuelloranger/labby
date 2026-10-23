// biome-ignore lint/correctness/noUnusedImports: classic JSX factory (tsconfig jsxFactory: h).
import { h, type Node } from './h';
import {
  COLS,
  type Decision,
  type Issue,
  minutesToNextEvent,
  type Placement,
  ROWS,
} from './layout';
import type { ArtRef, Cond, PanelSnapshot } from './snapshot';

// Satori renders a CSS subset: any element with more than one child needs
// display:flex, there is no grid, and padding is added on top of an explicit
// width, so sizes below come from flex or from the grid geometry.

export const WIDTH = 800;
export const HEIGHT = 480;

const C = {
  bg: '#0c0a08',
  glass: 'rgba(30, 32, 42, 0.72)',
  brd: 'rgba(255, 255, 255, 0.14)',
  surface: 'rgba(255, 255, 255, 0.07)',
  ink: '#f5f5f7',
  dim: '#a9abb3',
  faint: '#81848d',
  accent: '#ff9f0a',
  ok: '#30b85f',
  warn: '#f2a33c',
  down: '#ff6b60',
};
const WALL =
  'radial-gradient(42% 52% at 18% 16%, #3d2a14 0%, transparent 60%), radial-gradient(42% 52% at 84% 12%, #3a201a 0%, transparent 60%), radial-gradient(48% 58% at 76% 84%, #2f2611 0%, transparent 58%), linear-gradient(160deg, #110e0a, #0c0a08)';

const PAD = 18;
const GAP = 12;
const HEADER = 44;
const TOP = PAD + HEADER + GAP;
const CELL_W = (WIDTH - PAD * 2 - GAP * (COLS - 1)) / COLS;
const CELL_H = (HEIGHT - TOP - PAD - GAP * (ROWS - 1)) / ROWS;
/** Inner width of a one-column card (16 px padding + 1 px border on each side). */
const CARD_INNER_W = Math.floor(CELL_W - 34);

export type ArtLookup = (ref: ArtRef | undefined) => string | undefined;
type Ctx = { s: PanelSnapshot; issues: Issue[]; art: ArtLookup };

// ---------- formatting ----------
const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const dateLine = (d: Date) =>
  d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const rate = (bps: number) =>
  bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} MB/s` : `${Math.round(bps / 1e3)} KB/s`;
const eta = (s: number | null) =>
  s === null || s < 0 || s > 8_640_000
    ? '–'
    : s >= 3600
      ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
      : `${Math.max(1, Math.round(s / 60))}m`;
const bytes = (b: number) =>
  b >= 1e12 ? `${(b / 1e12).toFixed(b >= 1e13 ? 0 : 1)} TB` : `${Math.round(b / 1e9)} GB`;
const ago = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60
    ? `${m} min ago`
    : m < 1440
      ? `${Math.round(m / 60)} h ago`
      : `${Math.round(m / 1440)} d ago`;
};
const eventTime = (start: number, now: Date) => {
  const d = new Date(start);
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? clock(d) : `${d.toLocaleDateString('en-CA', { weekday: 'short' })} ${clock(d)}`;
};
const level = (p: number) => (p >= 92 ? C.down : p >= 80 ? C.warn : C.ok);
const ellipsis = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as const;
const initials = (t: string) =>
  t
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
const hash = (t: string) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const PLACEHOLDERS = [
  ['#3b5bdb', '#862e9c', '#e8590c'],
  ['#0b7285', '#2b8a3e', '#fab005'],
  ['#c2255c', '#5f3dc4', '#1c7ed6'],
  ['#e67700', '#c92a2a', '#5c940d'],
];

// ---------- primitives ----------
const Dot = ({ color, size = 10 }: { color: string; size?: number }) => (
  <div
    style={{ width: size, height: size, borderRadius: size, background: color, flexShrink: 0 }}
  />
);

const Bar = ({
  value,
  color = C.accent,
  height = 8,
}: {
  value: number;
  color?: string;
  height?: number;
}) => (
  <div
    style={{ display: 'flex', width: '100%', height, borderRadius: height, background: C.surface }}
  >
    <div
      style={{
        width: `${Math.max(2, Math.min(100, value))}%`,
        height,
        borderRadius: height,
        background: color,
      }}
    />
  </div>
);

const Card = ({
  children,
  style = {},
}: {
  children?: unknown;
  style?: Record<string, unknown>;
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      background: C.glass,
      border: `1px solid ${C.brd}`,
      borderRadius: 18,
      padding: 16,
      ...style,
    }}
  >
    {children}
  </div>
);

const Label = ({ children, color = C.faint }: { children?: unknown; color?: string }) => (
  <div
    style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.2, color, textTransform: 'uppercase' }}
  >
    {children}
  </div>
);

const Meter = ({ k, v }: { k: string; v: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <div style={{ color: C.dim, ...ellipsis }}>{k}</div>
      <div style={{ fontWeight: 700 }}>{`${Math.round(v)}%`}</div>
    </div>
    <Bar value={v} color={level(v)} />
  </div>
);

/** Real artwork when we have it, else a gradient with initials. */
const Art = ({
  title,
  src,
  width,
  height,
  font,
}: {
  title: string;
  src?: string;
  width: number;
  height: number;
  font: number;
}) => {
  if (src)
    return (
      <img
        src={src}
        alt={title}
        width={width}
        height={height}
        style={{ borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  const [a, b, c] = PLACEHOLDERS[hash(title) % PLACEHOLDERS.length];
  return (
    <div
      style={{
        display: 'flex',
        width,
        height,
        borderRadius: 12,
        alignItems: 'flex-end',
        backgroundImage: `linear-gradient(160deg, ${a}, ${b} 60%, ${c})`,
        flexShrink: 0,
      }}
    >
      <div style={{ padding: 12, fontSize: font, fontWeight: 800 }}>{initials(title)}</div>
    </div>
  );
};

/** Weather drawn from shapes: the loaded fonts have no icon glyphs. */
const Wx = ({ cond, size = 28 }: { cond: Cond; size?: number }) => (
  <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
    {cond !== 'snow' && (
      <div
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: size,
          background: '#ffc23d',
        }}
      />
    )}
    {cond !== 'sun' && (
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: size * 0.12,
          right: 0,
          width: size * 0.8,
          height: size * 0.42,
          borderRadius: size,
          background: '#d9dbe2',
        }}
      />
    )}
    {(cond === 'rain' || cond === 'snow') && (
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: -size * 0.14,
          left: size * 0.3,
          gap: size * 0.12,
        }}
      >
        {[0, 1].map(() => (
          <div
            style={{
              width: cond === 'snow' ? 4 : 3,
              height: cond === 'snow' ? 4 : size * 0.22,
              borderRadius: 2,
              background: cond === 'snow' ? '#ffffff' : '#6fb3ff',
            }}
          />
        ))}
      </div>
    )}
  </div>
);

// ---------- cards ----------
function ServerCard({ s }: Ctx) {
  const sys = s.system!;
  return (
    <Card style={{ gap: 10 }}>
      <Label>{sys.name}</Label>
      <Meter k="CPU" v={sys.cpu} />
      <Meter k="RAM" v={sys.mem} />
      <Meter k="Disk" v={sys.disk} />
    </Card>
  );
}

function StorageCard({ s }: Ctx) {
  const disks = [...s.disks].sort((a, b) => b.usedPercent - a.usedPercent).slice(0, 3);
  return (
    <Card style={{ gap: 10 }}>
      <Label>Storage</Label>
      {disks.map((d) => (
        <Meter
          k={d.capacityBytes ? `${d.name} · ${bytes(d.capacityBytes)}` : d.name}
          v={d.usedPercent}
        />
      ))}
    </Card>
  );
}

function ContainersCard({ s }: Ctx) {
  const c = s.containers!;
  const all = c.stopped.length === 0;
  return (
    <Card style={{ gap: 6 }}>
      <Label>Containers</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <div style={{ fontSize: 54, fontWeight: 800, color: all ? C.ink : C.down }}>
          {String(c.running)}
        </div>
        <div style={{ fontSize: 22, color: C.dim }}>{`/ ${c.total}`}</div>
      </div>
      <div style={{ fontSize: 14, color: all ? C.dim : C.down }}>
        {all ? 'all running' : `${c.stopped.length} stopped`}
      </div>
    </Card>
  );
}

function SitesCard({ s }: Ctx) {
  const x = s.sites!;
  const all = x.down.length === 0;
  return (
    <Card style={{ gap: 6 }}>
      <Label>Services</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <div style={{ fontSize: 54, fontWeight: 800, color: all ? C.ink : C.down }}>
          {String(x.up)}
        </div>
        <div style={{ fontSize: 22, color: C.dim }}>{`/ ${x.total}`}</div>
      </div>
      <div style={{ fontSize: 14, color: all ? C.dim : C.down }}>
        {all ? 'all responding' : `${x.down.length} down`}
      </div>
    </Card>
  );
}

function WeatherCard({ s }: Ctx) {
  const w = s.weather!;
  return (
    <Card style={{ gap: 8 }}>
      <Label>Weather</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Wx cond={w.cond} size={40} />
        <div style={{ fontSize: 40, fontWeight: 800 }}>{`${w.temp}°`}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
        {w.days.map((d) => (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              fontSize: 13,
            }}
          >
            <div style={{ color: C.dim }}>{d.label}</div>
            <Wx cond={d.cond} size={20} />
            <div style={{ fontWeight: 700 }}>{`${d.max}°/${d.min}°`}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DownloadsCard({ s }: Ctx, size: Placement['size']) {
  const d = s.downloads!;
  if (size === 'tall') {
    return (
      <Card style={{ gap: 10 }}>
        <Label>Downloads</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{rate(d.dl)}</div>
          <div style={{ fontSize: 13, color: C.dim }}>{`↑ ${rate(d.up)}`}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
          {d.items.slice(0, 4).map((t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 14, fontWeight: 600, ...ellipsis }}>{t.name}</div>
              <Bar value={t.progress} />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: C.dim,
                }}
              >
                <div>{`${Math.round(t.progress)}%`}</div>
                <div>{`${eta(t.eta)} left`}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }
  const top = d.items[0];
  return (
    <Card style={{ gap: 8 }}>
      <Label>Downloads</Label>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{rate(d.dl)}</div>
      <div
        style={{ fontSize: 14, color: C.dim }}
      >{`${d.items.length} active · ${eta(top.eta)} left`}</div>
      <div style={{ fontSize: 13, ...ellipsis, marginTop: 'auto' }}>{top.name}</div>
      <Bar value={top.progress} />
    </Card>
  );
}

function PlayingCard({ s, art }: Ctx, size: Placement['size']) {
  const [main, ...rest] = s.sessions;
  if (size !== 'tall') {
    return (
      <Card style={{ gap: 14, flexDirection: 'row', alignItems: 'center' }}>
        <Art title={main.title} src={art(main.poster)} width={76} height={114} font={26} />
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, flexBasis: 0 }}
        >
          <Label color={C.accent}>Now playing</Label>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{main.title}</div>
          <div style={{ fontSize: 13, color: C.dim }}>{main.user}</div>
          <div style={{ display: 'flex', marginTop: 4 }}>
            <Bar value={main.progress} color={C.ink} height={6} />
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10, border: '1px solid rgba(255,159,10,0.45)' }}>
      <Art
        title={main.title}
        src={art(main.backdrop) ?? art(main.poster)}
        width={CARD_INNER_W}
        height={Math.round((CARD_INNER_W * 9) / 16)}
        font={44}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <Dot color={C.accent} size={8} />
        <Label color={C.accent}>Now playing</Label>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{main.title}</div>
      <div style={{ fontSize: 14, color: C.dim }}>{main.subtitle}</div>
      <div style={{ fontSize: 14, color: C.dim }}>{`${main.user} · ${main.device}`}</div>
      <div style={{ display: 'flex', marginTop: 'auto' }}>
        <Bar value={main.progress} color={C.ink} height={6} />
      </div>
      {rest.length > 0 && (
        <div style={{ fontSize: 12, color: C.faint, ...ellipsis }}>
          {`also: ${rest.map((r) => `${r.title} (${r.user})`).join(', ')}`}
        </div>
      )}
    </Card>
  );
}

function AlertCard({ issues }: Ctx, size: Placement['size']) {
  const shown = issues.slice(0, size === 'wide' ? 3 : 2);
  return (
    <Card style={{ gap: 10, background: 'rgba(255,107,96,0.13)', border: `1px solid ${C.down}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label color={C.down}>Needs attention</Label>
        <div
          style={{ fontSize: 13, color: C.dim }}
        >{`${issues.length} issue${issues.length > 1 ? 's' : ''}`}</div>
      </div>
      {shown.map((b) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          <Dot color={b.severity === 'down' ? C.down : C.warn} size={12} />
          <div style={{ fontSize: size === 'wide' ? 20 : 16, fontWeight: 800, ...ellipsis }}>
            {b.title}
          </div>
          {size === 'wide' && (
            <div style={{ fontSize: 15, color: C.dim, marginLeft: 'auto' }}>{b.detail}</div>
          )}
        </div>
      ))}
      {issues.length > shown.length && (
        <div style={{ fontSize: 13, color: C.dim }}>{`+${issues.length - shown.length} more`}</div>
      )}
    </Card>
  );
}

function EventCard({ s }: Ctx) {
  const soon = minutesToNextEvent(s);
  if (soon !== null) {
    const next = s.events.find((e) => !e.allDay && e.start > s.now.getTime())!;
    return (
      <Card
        style={{ gap: 6, border: `1px solid ${C.accent}`, background: 'rgba(255,159,10,0.12)' }}
      >
        <Label color={C.accent}>Coming up</Label>
        <div style={{ fontSize: 44, fontWeight: 800, marginTop: 6 }}>{`${soon} min`}</div>
        <div style={{ fontSize: 20, fontWeight: 700, ...ellipsis }}>{next.title}</div>
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Label>Next up</Label>
      {s.events.slice(0, 3).map((e, i) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: i === 0 ? C.accent : C.faint, fontWeight: 700 }}>
            {e.allDay ? 'All day' : eventTime(e.start, s.now)}
          </div>
          <div
            style={{ fontSize: i === 0 ? 17 : 14, fontWeight: i === 0 ? 700 : 400, ...ellipsis }}
          >
            {e.title}
          </div>
        </div>
      ))}
    </Card>
  );
}

function RecentCard({ s, art }: Ctx, _size: Placement['size'], fresh: boolean) {
  const r = s.recent[0];
  if (fresh) {
    return (
      <Card
        style={{
          gap: 14,
          flexDirection: 'row',
          alignItems: 'center',
          border: `1px solid ${C.ok}`,
          background: 'rgba(48,184,95,0.10)',
        }}
      >
        <Art title={r.title} src={art(r.poster)} width={84} height={126} font={28} />
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, flexBasis: 0 }}
        >
          <Label color={C.ok}>Just added</Label>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{r.title}</div>
          <div
            style={{ fontSize: 13, color: C.dim }}
          >{`${r.kind === 'movie' ? 'Movie' : 'Series'} · ${ago(s.now.getTime() - r.addedAt)}`}</div>
        </div>
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Label>Recently added</Label>
      {s.recent.slice(0, 3).map((x) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
          <div style={{ fontWeight: 600, ...ellipsis }}>{x.title}</div>
          <div style={{ color: C.faint, fontSize: 13, flexShrink: 0 }}>
            {ago(s.now.getTime() - x.addedAt)}
          </div>
        </div>
      ))}
    </Card>
  );
}

function DnsCard({ s }: Ctx) {
  const d = s.dns!;
  return (
    <Card style={{ gap: 6 }}>
      <Label>DNS</Label>
      <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>
        {d.queries.toLocaleString('en-CA')}
      </div>
      <div
        style={{ fontSize: 14, color: C.dim }}
      >{`queries · ${d.blockedPercent.toFixed(1)}% blocked`}</div>
    </Card>
  );
}

function card(p: Placement, ctx: Ctx): Node {
  switch (p.id) {
    case 'alert':
      return AlertCard(ctx, p.size);
    case 'playing':
      return PlayingCard(ctx, p.size);
    case 'downloads':
      return DownloadsCard(ctx, p.size);
    case 'event':
      return EventCard(ctx);
    case 'recent':
      return RecentCard(ctx, p.size, p.score >= 75);
    case 'server':
      return ServerCard(ctx);
    case 'storage':
      return StorageCard(ctx);
    case 'containers':
      return ContainersCard(ctx);
    case 'sites':
      return SitesCard(ctx);
    case 'weather':
      return WeatherCard(ctx);
    case 'dns':
      return DnsCard(ctx);
  }
}

const rect = (p: Placement) => ({
  left: PAD + p.rect.col * (CELL_W + GAP),
  top: TOP + p.rect.row * (CELL_H + GAP),
  width: p.rect.w * CELL_W + (p.rect.w - 1) * GAP,
  height: p.rect.h * CELL_H + (p.rect.h - 1) * GAP,
});

function Night({ s, issues }: Ctx) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: WIDTH,
        height: HEIGHT,
        background: '#000',
        color: '#5a5d66',
        fontFamily: 'Manrope',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <div
        style={{
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: -6,
          lineHeight: 1,
          color: issues.length ? '#8a8d96' : '#4a4d55',
        }}
      >
        {clock(s.now)}
      </div>
      {issues.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18 }}>
          <Dot color="#1f5a33" size={10} />
          <div>
            {s.weather?.days[0]
              ? `all good · ${s.weather.days[0].label} ${s.weather.days[0].max}°`
              : 'all good'}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 20px',
            borderRadius: 14,
            border: `1px solid ${C.down}`,
            color: C.down,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          <Dot color={C.down} size={12} />
          <div>{`${issues[0].title} ${issues[0].detail}${issues.length > 1 ? ` · +${issues.length - 1}` : ''}`}</div>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div
      style={{
        display: 'flex',
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        color: C.dim,
      }}
    >
      Add integrations in labby to fill this panel.
    </div>
  );
}

export function Panel(s: PanelSnapshot, d: Decision, art: ArtLookup): Node {
  const ctx: Ctx = { s, issues: d.issues, art };
  if (d.mode === 'night') return Night(ctx);
  const bad = d.issues.some((i) => i.severity === 'down');
  const warn = d.issues.length > 0;
  const pillColor = bad ? C.down : warn ? C.warn : C.ok;
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: WIDTH,
        height: HEIGHT,
        backgroundImage: WALL,
        backgroundColor: C.bg,
        color: C.ink,
        fontFamily: 'Manrope',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: PAD,
          top: PAD,
          width: WIDTH - PAD * 2,
          height: HEADER,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{clock(s.now)}</div>
          <div style={{ fontSize: 16, color: C.dim }}>{dateLine(s.now)}</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: `${pillColor}29`,
          }}
        >
          <Dot color={pillColor} />
          <div style={{ fontSize: 15, fontWeight: 700, color: pillColor }}>
            {warn
              ? `${d.issues.length} issue${d.issues.length > 1 ? 's' : ''}`
              : 'All systems normal'}
          </div>
        </div>
      </div>
      {d.placements.length === 0 ? (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: PAD,
            top: TOP,
            width: WIDTH - PAD * 2,
            height: HEIGHT - TOP - PAD,
          }}
        >
          <Empty />
        </div>
      ) : (
        d.placements.map((p) => (
          <div style={{ display: 'flex', position: 'absolute', ...rect(p) }}>{card(p, ctx)}</div>
        ))
      )}
    </div>
  );
}
