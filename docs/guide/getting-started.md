# Getting Started

Labby runs as a single container. Copy the repository `docker-compose.yml` and start it:

```bash
docker compose up -d
```

```yaml
services:
  labby:
    image: ghcr.io/samuelloranger/labby:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./config:/app/config
```

Open `http://localhost:8080`, then add services from the Manage Services page.

## Configuration Storage

Labby stores configuration in SQLite at `config/labby.db`. The mounted `config/` directory must be writable by the user running the container.

If the database reports `SQLITE_READONLY`, set `user: "<uid>:<gid>"` in `docker-compose.yml` to match the owner of `config/`.
