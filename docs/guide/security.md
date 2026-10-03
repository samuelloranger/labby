# Security

Labby has no login by default. Either keep it behind a reverse proxy restricted to your LAN or VPN (or forward-auth at the proxy), or turn on the built-in OIDC login below. Anyone who can reach an unprotected Labby can read status and control integrated services.

## OIDC login (optional)

Labby can require sign-in through any OpenID Connect provider. It is off unless you set the variables below; existing installs are unaffected.

| Variable | Required | Description |
|---|---|---|
| `LABBY_OIDC_ISSUER` | yes | Provider issuer URL (`https://` only). Setting it turns login on. |
| `LABBY_OIDC_CLIENT_ID` | yes | Client ID |
| `LABBY_OIDC_CLIENT_SECRET` | yes | Client secret (confidential client) |
| `LABBY_URL` | yes | Public URL of Labby, origin only, e.g. `https://labby.example.com` |
| `LABBY_OIDC_SCOPES` | no | Default `openid email profile`. Add `offline_access` when your provider supports it — Labby keeps sessions alive with the provider's refresh token, which many providers only issue when `offline_access` is requested. Without it, users pass back through the provider about every 15 minutes (silent while the provider session is valid, but the page reloads). `offline_access` must be listed in the provider's supported scopes or login fails with a scope error. |
| `LABBY_OIDC_ALLOWED_EMAILS` | no | Comma-separated emails allowed in (case-insensitive) |
| `LABBY_OIDC_ALLOWED_GROUPS` | no | Comma-separated groups allowed in (from the `groups` claim) |
| `LABBY_OIDC_SESSION_SECRET` | no | ≥ 32 characters. Keeps sessions valid across restarts. Unset: a restart sends users back through the provider (silent while their provider session is valid). |

- Register the redirect URI `https://<your LABBY_URL>/auth/callback` with the provider, and `https://<your LABBY_URL>/` as the post-logout redirect URI.
- HTTPS is required: session cookies are `Secure`.
- With neither allowlist set, anyone your provider authenticates for this client gets in — restrict access in the provider, or set an allowlist. A user matching either list is allowed.
- The email allowlist trusts the email claim your provider sends; if users can register themselves or change their email without verification, use `LABBY_OIDC_ALLOWED_GROUPS` instead.
- If any `LABBY_OIDC_*` variable is set but the configuration is incomplete or invalid, Labby refuses to start and logs which variable is wrong. It never falls back to running without login.
- The sign-out icon in the header ends the Labby session and, when the provider supports it, the provider session.
- Scripts calling the API are not supported while login is on: every `/api` request needs a browser session.

### Authentik

1. Applications → Providers → create an **OAuth2/OpenID Provider**: client type *Confidential*, redirect URI `https://<LABBY_URL>/auth/callback` (strict), signing key set.
2. Create an **Application** using that provider. Bind users or groups to it to control who can sign in.
3. `LABBY_OIDC_ISSUER` is the provider's *OpenID Configuration Issuer*, e.g. `https://auth.example.com/application/o/labby/`.
4. Authentik's `profile` scope includes `groups`, so `LABBY_OIDC_ALLOWED_GROUPS` works with the default scopes.
5. Set `LABBY_OIDC_SCOPES=openid email profile offline_access`. On the provider, select the `offline_access` scope mapping.

### Authelia

```yaml
identity_providers:
  oidc:
    claims_policies:
      labby:
        id_token: ['email', 'name', 'groups']
    clients:
      - client_id: 'labby'
        client_name: 'Labby'
        client_secret: '<hashed secret>'
        authorization_policy: 'two_factor'
        claims_policy: 'labby'
        redirect_uris: ['https://labby.example.com/auth/callback']
        scopes: ['openid', 'email', 'profile', 'groups', 'offline_access']
        grant_types: ['authorization_code', 'refresh_token']
        token_endpoint_auth_method: 'client_secret_basic'
```

- `LABBY_OIDC_ISSUER` is your Authelia URL, e.g. `https://auth.example.com`.
- Set `LABBY_OIDC_SCOPES=openid email profile groups offline_access` to use group allowlists. `offline_access` must be listed in the provider's supported scopes.
- Labby reads email and groups from the ID token; recent Authelia versions only put them there when a `claims_policy` lists them, as above.

## Cross-site requests

Labby always rejects `POST`/`PUT`/`PATCH`/`DELETE` requests that a browser sends on behalf of another website (via `Sec-Fetch-Site`, or `Origin` for older browsers). Requests from other subdomains of the same site are refused too — they are same-site, not same-origin. The Labby web app and non-browser clients such as scripts are unaffected.

## Credentials

Service credentials are stored server-side in `config/labby.db`. The browser receives sanitized integration metadata and widget data, not the saved secret values.

## Backups

Backups (including stored credentials, in plain text) are written under `config/backups/` on the server. The browser only ever receives the file path, never the backup contents — back up that directory like you would `config/labby.db`.
