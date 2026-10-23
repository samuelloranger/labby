# Display panel

Labby can render your homelab as a single image for a small screen on a desk or
wall, such as a cheap 7" ESP32 display (800x480 by default,
[configurable](#screen-size)). The device stays simple: it downloads
`GET /api/panel.jpg` every few seconds and draws it. All layout work happens in
Labby.

```
http://labby.local:8080/api/panel.jpg
```

Open that URL in a browser to see exactly what the device will show.

## What it shows

The panel is a 3x2 grid of cards built from the integrations you already have.
Each card scores its own relevance, and the layout changes with what is going on:

| Situation | What the panel does |
|---|---|
| Something is down (container exited, monitored site down, Beszel system offline, disk ≥ 90 %) | A wide **Needs attention** strip across the top right |
| A Jellyfin, Emby or Plex stream is playing | A tall **Now playing** card in the left column, with the backdrop (Jellyfin) |
| Three or more active downloads | A tall **Downloads** list with per-item progress |
| A calendar event starts within the hour | A **Coming up** card in the first cell |
| Something was added to Jellyfin or Plex in the last 15 minutes | A **Just added** card with its poster in the first cell |
| Otherwise | Server, storage, containers, downloads, weather, calendar, recently added and DNS cards, in a fixed order |

Cards only appear for integrations you have configured, and an integration that
is failing simply drops its card. The other cards keep their positions so the
screen doesn't reshuffle when only the numbers change.

From 23:00 to 07:00 the panel switches to a dim clock. Problems still break
through as a red line.

`GET /api/panel/layout` returns the current decision as JSON: every card placed,
its size, its score and why it was chosen.

## Screen size

Set the resolution of your screen under **Customize interface → Display panel
size**: presets for 800x480 (most 7" ESP32 boards), 1024x600, 1280x800 and
480x320, or a custom size. Any landscape size between 5:4 and 12:5 works, from
320x240 up to 1920x1200. The layout is drawn 480 px tall at your screen's
aspect ratio and scaled to the exact size, so a wider screen gets wider cards
rather than a letterboxed image.

## Settings

| Variable | Default | Description |
|---|---|---|
| `LABBY_PANEL_NIGHT` | `23-7` | Night-clock hours as `from-to` (24 h, local time). `off` disables it. |
| `LABBY_PANEL_TOKEN` | unset | With [OIDC login](./security#oidc-login-optional) on, lets a device fetch the panel with `?token=…` or `Authorization: Bearer …` instead of a browser session. It opens the two panel endpoints only. |

The query-string form ends up in reverse-proxy access logs, so use a dedicated
token for the panel (not one reused elsewhere), rotate it if a log leaks, and
prefer the `Authorization` header when your device firmware can set one.

Times use the container's time zone, so set `TZ` (for example `TZ=America/Toronto`)
if the clock is off.

## Device side

Any device that can fetch an image over HTTP and draw a JPEG works. On an ESP32
with an 800x480 RGB panel (for example an Elecrow CrowPanel 7.0" or a Sunton
ESP32-8048S070), a loop like this is enough:

1. Send `GET /api/panel.jpg` with `If-None-Match` set to the last `ETag`.
2. On `304`, do nothing: the frame has not changed.
3. On `200`, decode the JPEG (for example with `TJpg_Decoder`) straight to the screen and remember the new `ETag`.
4. Wait 5–10 seconds and repeat.

At 800x480, frames are about 50–60 KB. Identical frames keep the same `ETag`, so most polls
cost a `304` and no rendering on the server.
