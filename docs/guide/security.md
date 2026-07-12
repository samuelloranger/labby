# Security

Labby has no authentication.

Run it behind a reverse proxy restricted to your LAN or VPN. Anyone who can reach the app can read status and control integrated services.

Do not expose Labby to the public internet without network-level access control.

## Credentials

Service credentials are stored server-side in `config/labby.db`. The browser receives sanitized integration metadata and widget data, not the saved secret values.

## Backups

Backups (including stored credentials, in plain text) are written under `config/backups/` on the server. The browser only ever receives the file path, never the backup contents — back up that directory like you would `config/labby.db`.
