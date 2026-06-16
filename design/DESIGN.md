# Labby — UI declaration (LOCKED)

**Aesthetic: Apple glassmorphism on a warm wallpaper, full-bleed.**
Friendly Airbnb-style bones (rounded cards, generous spacing, the search pill)
rendered as **frosted glass** over a soft amber/peach gradient-mesh wallpaper,
**Apple system orange** accent, edge-to-edge (no centered container).

`labby-ui.html` (in this folder) is the canonical visual reference — open it and
match it. This doc is the portable token + behavior spec for the Svelte build.

## Tokens — port verbatim into `web/src/app.css`

```css
:root{
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","Manrope",system-ui,sans-serif;
  --ease:cubic-bezier(.2,.7,.2,1);
  --radius:20px; --radius-sm:12px; --pill:999px;
  --blur:saturate(180%) blur(20px);
  /* accent = Apple system orange (var is named --coral for brevity in the mock) */
  --accent:#FF9500; --accent-soft:rgba(255,149,0,.15);
  --ok:#30B85F; --warn:#F2A33C; --down:#FF453A; --idle:#B6BAC2;
}
:root[data-theme="light"]{
  --wall:
    radial-gradient(40% 50% at 18% 18%, #ffe2c2 0%, transparent 60%),
    radial-gradient(40% 50% at 82% 12%, #ffd9c9 0%, transparent 60%),
    radial-gradient(45% 55% at 75% 82%, #fff0c4 0%, transparent 58%),
    radial-gradient(40% 50% at 12% 88%, #ffe6cf 0%, transparent 55%),
    linear-gradient(160deg,#fbf5ee,#f6efe8);
  --glass:rgba(255,255,255,.55); --glass-2:rgba(255,255,255,.42);
  --glass-brd:rgba(255,255,255,.7); --glass-hi:rgba(255,255,255,.85);
  --surface:rgba(120,120,140,.10); --surface-2:rgba(120,120,140,.16);
  --ink:#1d1d1f; --ink-dim:#62636a; --ink-faint:#9b9da6;
  --shadow:0 10px 34px rgba(40,40,60,.12); --shadow-hi:0 14px 40px rgba(40,40,60,.18);
}
:root[data-theme="dark"]{
  --wall:
    radial-gradient(42% 52% at 18% 16%, #3d2a14 0%, transparent 60%),
    radial-gradient(42% 52% at 84% 12%, #3a201a 0%, transparent 60%),
    radial-gradient(48% 58% at 76% 84%, #2f2611 0%, transparent 58%),
    radial-gradient(40% 50% at 10% 90%, #301c12 0%, transparent 55%),
    linear-gradient(160deg,#110e0a,#0c0a08);
  --accent:#FF9F0A; --accent-soft:rgba(255,159,10,.18);
  --glass:rgba(30,32,42,.55); --glass-2:rgba(30,32,42,.42);
  --glass-brd:rgba(255,255,255,.14); --glass-hi:rgba(255,255,255,.22);
  --surface:rgba(255,255,255,.06); --surface-2:rgba(255,255,255,.10);
  --ink:#f5f5f7; --ink-dim:#a9abb3; --ink-faint:#70727b;
  --shadow:0 12px 40px rgba(0,0,0,.5); --shadow-hi:0 16px 48px rgba(0,0,0,.62);
}
```

- `body{ background:var(--wall) fixed; background-size:cover }`
- **Glass recipe** (cards, header, search pill, icon buttons):
  `background:var(--glass); backdrop-filter:var(--blur); -webkit-backdrop-filter:var(--blur);
   border:1px solid var(--glass-brd); box-shadow:var(--shadow), inset 0 1px 0 var(--glass-hi)`
  The `inset 0 1px 0` light-edge highlight is essential — it's what makes it read as glass.

## Type
- Apple **SF system stack** with **Manrope** as the cross-platform fallback (self-host
  Manrope in the build for offline/local-only). Bold headings (700–800), tabular numerics
  on all data (`font-variant-numeric:tabular-nums`).

## Layout — full bleed
- **No max-width container.** Header, page, footer span 100% width with `40px` side padding.
- Body grid: `grid-template-columns:1fr 1.5fr 1fr; gap:20px`, collapses to 1 column < 1080px.
- Sticky frosted header: brand mark · centered **search pill** · up/warn/down summary · theme toggle.

## First-paint theming (REQUIRED — no flash)
The server bakes the theme into the first byte; an inline script is the resolver/fallback.
1. `index.html` ships `<html data-theme="__LABBY_THEME__">` **and**, as the FIRST thing in
   `<head>`, this blocking inline script (runs before `<body>` paints):
   ```html
   <script>(function(){var s="__LABBY_THEME__",t;try{t=localStorage.getItem("labby-theme")}catch(e){}
   var sys=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
   document.documentElement.dataset.theme=(s==="light"||s==="dark")?s:(t||sys);})();</script>
   ```
2. **Hono middleware** string-replaces `__LABBY_THEME__` in the served HTML from the
   `labby_theme` cookie; if absent, from `config/dashboard.json` `theme.default` (`"light"`/`"dark"`/`"system"` → emit `""` for system so the script falls back to OS).
3. Resolution order: **server value → `localStorage['labby-theme']` → system**.
4. Toggle: set `data-theme`, write `localStorage`, and `POST /api/theme` so the server bakes
   the right theme on the next first paint.

## Widget → Svelte component map (each = a glass `.card`)
| `dashboard.json` type | Component | Notes |
|---|---|---|
| `monitor` | `Monitor.svelte` | dot · name · latency rows; `bad` → red dot + red value. `compact` variant for the small "Core" card. |
| `docker` | `Docker.svelte` | row: dot · name/image · CPU pill-meter · controls (play/stop/restart/logs as SVG icon buttons). Stopped → exit code + start button only. Button flashes accent while POST in flight. |
| `downloads` | `Downloads.svelte` | torrent: live-dot · name · % · pill progress bar · ↓dn/↑up/eta. Seeding → green bar. Header meta = aggregate ↓ speed. |
| `adguard` | `AdGuard.svelte` | 2×2 stat gauges (blocked% in accent) + pill protection toggle (accent when on, white knob). |
| `jellyfin` | `Jellyfin.svelte` | session cards: poster · title · quality/transcode · user·device · progress. `.empty` when idle. |
| launcher | `Launcher.svelte` | 4-col tiles, rounded icon container, status dot top-right, lift + bigger shadow on hover. |

## Icons — dashboard-icons + custom URLs
Every `icon` field (services, launcher tiles, monitor rows, container rows, single-service
card headers) accepts a prefixed string; the resolver picks how to render it:

| `icon` value | Source | Render |
|---|---|---|
| `di:<slug>` | **dashboard-icons** (homarr-labs set) — the default for known services | `<img class="logo">` |
| `https://…` / `http://…` | **custom remote image URL** (user's own) | `<img class="logo">` |
| `/icons/…` or relative path | **custom local image** the user drops in `config/`/`public` | `<img class="logo">` |
| `sh:<slug>` | selfh.st icons (optional) | `<img class="logo">` |
| `lucide:<name>` | built-in **Lucide** line icon | inline `<svg>` (currentColor) |

- **Custom image URLs are first-class** — any `icon` starting with `http(s)://` or `/` is treated
  as an image and rendered directly. Document this so users can point at their own logos.
- **Vendor the `di:` SVGs you use** into `web/public/icons/di/<slug>.svg` at build (resolve
  `di:slug` → `/icons/di/slug.svg`) so it works offline/local-only; the jsDelivr CDN
  (`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/<slug>.svg`) is a fallback only.
- `img.logo` = `object-fit:contain`, sized per context (rows 20px, tiles 28px, header chip 20px),
  sat in a rounded `--surface` chip for contrast in both themes.
- **`lucide:`** is for UI controls (search, theme, container start/stop/restart/logs) and as the
  **fallback glyph** when a service has no logo. Always set `onerror` on `<img>` to swap to the
  configured `lucide:` fallback (or hide) so a missing/broken logo never breaks layout.
- Not every service exists in dashboard-icons (e.g. `kan`, custom apps) — those use a `lucide:`
  glyph or a custom URL. No emoji as icons.

## States (every widget) — loading (skeleton) · error (red-dot line + terse msg, rest stays alive) · empty · ready.

## Live data (SSE) — auto-refresh, no client polling
- The browser opens ONE `EventSource('/api/stream')`; the **server** is the only poller. Widgets
  update reactively from named events (`monitor`, `docker`, `downloads:*`, `adguard`, `jellyfin`).
- `refreshSeconds` (in `dashboard.json`) is the **server-side poll cadence per channel**, not a
  client timer. On connect the server replays the cached snapshot so widgets fill instantly.
- Numeric/bar changes should **transition smoothly** (no jarring snaps) as live values arrive —
  CPU meters and download bars animate width/value; live dots keep breathing.
- **Connection state:** `EventSource` auto-reconnects. While the stream is down, show a subtle
  "reconnecting" indicator in the header (e.g. the brand dot pulses amber); on re-open it self-heals.
  Never blank the board on a dropped connection — keep the last known values, just mark them stale.

## Motion — `rise` (translateY+scale, .5s, staggered by column) on load; live dots breathe;
progress bars transition width; buttons scale 0.93 on press. All gated by `prefers-reduced-motion`.

## A11y / perf
- Protection toggle is `role="switch"` + keyboard (Space/Enter); visible accent focus rings; status never color-only (add title/aria).
- Maintain 4.5:1 text contrast **on the glass** (test both themes independently).
- **Perf:** `backdrop-filter` is GPU-costly. Frost the **header + cards**, but if scroll jank
  appears with ~12 live cards, drop card blur to a near-opaque `--glass` fallback (looks ~identical, scrolls smooth). Keep `will-change` off; animate transform/opacity only.
