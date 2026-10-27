# Integrations

Each enabled integration renders as a dashboard widget. You can add multiple integrations of the same type, and each row gets its own poll interval and SSE channel.

## Built-In Integrations

<div class="integration-grid">
  <a class="integration-tile" href="#built-in-integrations">
    <img src="/icons/labby.svg" alt="Monitor" />
    <span>Monitor</span>
  </a>
  <a class="integration-tile" href="https://www.docker.com/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/docker.svg" alt="Docker" />
    <span>Docker</span>
  </a>
  <a class="integration-tile" href="https://www.qbittorrent.org/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/qbittorrent.svg" alt="qBittorrent" />
    <span>qBittorrent</span>
  </a>
  <a class="integration-tile" href="https://transmissionbt.com/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/transmission.svg" alt="Transmission" />
    <span>Transmission</span>
  </a>
  <a class="integration-tile" href="https://sabnzbd.org/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/sabnzbd.svg" alt="SABnzbd" />
    <span>SABnzbd</span>
  </a>
  <a class="integration-tile" href="https://adguard.com/en/adguard-home/overview.html" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/adguard-home.svg" alt="AdGuard Home" />
    <span>AdGuard Home</span>
  </a>
  <a class="integration-tile" href="https://jellyfin.org/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/jellyfin.svg" alt="Jellyfin" />
    <span>Jellyfin</span>
  </a>
  <a class="integration-tile" href="https://emby.media/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/emby.svg" alt="Emby" />
    <span>Emby</span>
  </a>
  <a class="integration-tile" href="https://www.plex.tv/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/plex.svg" alt="Plex" />
    <span>Plex</span>
  </a>
  <a class="integration-tile" href="https://beszel.dev/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/beszel.svg" alt="Beszel" />
    <span>Beszel</span>
  </a>
  <a class="integration-tile" href="https://radarr.video/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/radarr.svg" alt="Radarr" />
    <span>Radarr</span>
  </a>
  <a class="integration-tile" href="https://sonarr.tv/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/sonarr.svg" alt="Sonarr" />
    <span>Sonarr</span>
  </a>
  <a class="integration-tile" href="https://github.com/samuelloranger/rawkoon" target="_blank" rel="noreferrer noopener">
    <img :src="'/labby/icons/rawkoon.png'" alt="Rawkoon" />
    <span>Rawkoon</span>
  </a>
  <a class="integration-tile" href="https://openweathermap.org/" target="_blank" rel="noreferrer noopener">
    <img src="https://api.iconify.design/lucide/cloud-sun.svg?color=%23f97316" alt="OpenWeather" />
    <span>OpenWeather</span>
  </a>
  <a class="integration-tile" href="https://icalendar.org/" target="_blank" rel="noreferrer noopener">
    <img src="https://api.iconify.design/lucide/calendar-days.svg?color=%23f97316" alt="iCalendar" />
    <span>iCalendar</span>
  </a>
  <a class="integration-tile" href="https://docs.speedtest-tracker.dev/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/speedtest-tracker.svg" alt="Speedtest Tracker" />
    <span>Speedtest Tracker</span>
  </a>
  <a class="integration-tile" href="#built-in-integrations">
    <img src="https://api.iconify.design/lucide/bookmark.svg?color=%23f97316" alt="Bookmarks" />
    <span>Bookmarks</span>
  </a>
  <a class="integration-tile" href="https://www.reddit.com/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/reddit.svg" alt="Reddit" />
    <span>Reddit</span>
  </a>
  <a class="integration-tile" href="https://news.ycombinator.com/" target="_blank" rel="noreferrer noopener">
    <img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/hacker-news.svg" alt="Hacker News" />
    <span>Hacker News</span>
  </a>
</div>

| Project | Type | What to configure |
| --- | --- | --- |
| [Monitor](#built-in-integrations) | `monitor` | HTTP sites to check, including title, URL, and optional icon per site |
| [Docker](https://www.docker.com/) | `docker` | Read/write Docker hosts and container filter |
| [qBittorrent](https://www.qbittorrent.org/) | `qbittorrent` | URL, username, password |
| [Transmission](https://transmissionbt.com/) | `transmission` | URL, username, password |
| [SABnzbd](https://sabnzbd.org/) | `sabnzbd` | URL, API key |
| [AdGuard Home](https://adguard.com/en/adguard-home/overview.html) | `adguard` | URL, username, password |
| [Jellyfin](https://jellyfin.org/) | `jellyfin` | URL, API key |
| [Emby](https://emby.media/) | `emby` | URL, API key |
| [Plex](https://www.plex.tv/) | `plex` | URL, token |
| [Beszel](https://beszel.dev/) | `beszel` | URL, username, password, token |
| [Radarr](https://radarr.video/) | `radarr` | URL, API key |
| [Sonarr](https://sonarr.tv/) | `sonarr` | URL, API key |
| [Rawkoon](https://github.com/samuelloranger/rawkoon) | `rawkoon` | URL, API key |
| [C411](https://c411.org/) | `c411` | API token with `profile:read` scope |
| [OpenWeather](https://openweathermap.org/) | `weather` | OpenWeather API key, city or latitude/longitude, units |
| [iCalendar](https://icalendar.org/) | `calendar` | ICS feed URLs |
| [Speedtest Tracker](https://docs.speedtest-tracker.dev/) | `speedtest` | Speedtest Tracker URL, API token |
| [Bookmarks](#built-in-integrations) | `bookmarks` | Links with title, URL, and optional icon |
| [Reddit](https://www.reddit.com/) | `reddit` | Subreddits to merge into one feed |
| [Hacker News](https://news.ycombinator.com/) | `hackernews` | No config |

Jellyfin and Plex cards show active sessions plus a scrollable **Recently added** strip of movies and TV episodes. Posters are served through Labby so media server credentials stay on the server. The strip uses the same integration settings; no extra configuration is needed.

## Icons

The `icon` field accepts prefixed strings:

| Prefix | Example |
| --- | --- |
| `di:` | `di:jellyfin` for dashboard-icons |
| `sh:` | `sh:immich` for selfh.st icons |
| `lucide:` | `lucide:film` for built-in line icons |
| URL / path | `https://example.com/icon.svg` or `/icons/custom.svg` |

## Docker Host

Docker integrations accept either a TCP endpoint, such as `tcp://host:2375`, or a mounted unix socket such as `/var/run/docker.sock`.

The Docker socket grants root-equivalent control of the Docker daemon. For read/write separation, use a Docker socket proxy and point Labby's read and write hosts at proxies with different permissions.

### C411

Add **C411** from Manage Services and enter an API token created with the **Profil (lecture)** (`profile:read`) scope in [C411 Integrations](https://c411.org/user/integrations). Existing keys cannot have scopes changed; create a new key if needed.

The Progress card shows your avatar, username, class and grade, XP toward the next level, Zen balance, credited upload/download totals, ratio, download permission, and freeleech status. Expand **Class quests** to see all four paths, earned stars, and the tree bonus. An unavailable avatar falls back to your initial. Transfer sizes use decimal units (1 TB = 1,000,000,000,000 bytes). It refreshes every five minutes by default. Tokens stay in Labby’s server-side database and are omitted from browser responses; avatars load through Labby’s backend so their authentication never reaches the browser.

C411 refreshes profile data at most once every 30 seconds. Labby shares requests and cached results across widgets using the same API key, enforcing at least 30 seconds between upstream requests even with faster polling or manual refreshes. The endpoint allows 30 requests per minute per key; these also count toward the key's shared 120 requests per minute with Torznab. Other applications using that key consume the same allowance.

On `429`, Labby waits at least one minute before another upstream request (longer when C411 supplies a longer `Retry-After`). `401` reports a missing or invalid key; `403` reports that `profile:read` permission is required. Existing data stays visible when a refresh fails.

Profile data also retains nullable `class` and `team`, all four class paths (including inactive `0 / 0` paths), earned stars, grade (`bronze`, `argent`, `or`; levels 1–4), and `treeBonusBp` in basis points (250 means +2.50%). Stars are taken from the API even when new quests have reopened a path. Transfer breakdowns preserve measured `actual`, purchased/gifted `credit`, and credited `total` values in bytes: uploaded total adds credit; downloaded total subtracts credit and is never negative. The ratio uses these credited totals. Blocked download reasons and Freeleech sources (`personal`, `campaign`, `window`) are preserved separately from their boolean status.

C411’s `/api/auth/me` checks browser sessions and does not accept API keys. Labby uses the documented `GET https://c411.org/api/user/profile` endpoint with `Authorization: Bearer <token>`; see the [C411 integrations guide](https://c411.org/user/integrations/guide).
