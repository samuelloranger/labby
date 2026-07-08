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
    <img src="https://api.iconify.design/lucide/clapperboard.svg?color=%23f97316" alt="Rawkoon" />
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
| [OpenWeather](https://openweathermap.org/) | `weather` | OpenWeather API key, city or latitude/longitude, units |
| [iCalendar](https://icalendar.org/) | `calendar` | ICS feed URLs |
| [Speedtest Tracker](https://docs.speedtest-tracker.dev/) | `speedtest` | Speedtest Tracker URL, API token |
| [Bookmarks](#built-in-integrations) | `bookmarks` | Links with title, URL, and optional icon |
| [Reddit](https://www.reddit.com/) | `reddit` | Subreddits to merge into one feed |
| [Hacker News](https://news.ycombinator.com/) | `hackernews` | No config |

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
