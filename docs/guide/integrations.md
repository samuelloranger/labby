# Integrations

Each enabled integration renders as a dashboard widget. You can add multiple integrations of the same type, and each row gets its own poll interval and SSE channel.

## Built-In Integrations

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
| [Rawkoon](https://github.com/samuelloranger/reelward) | `rawkoon` | URL, API key |
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
