---
layout: home

hero:
  name: Labby
  text: Self-hosted homelab dashboard
  tagline: One Bun process, one container, live widgets, and in-app configuration backed by SQLite.
  image:
    src: /icons/labby.svg
    alt: Labby logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Integrations
      link: /guide/integrations

features:
  - title: Lightweight
    details: Labby runs as a single container with a Bun server, Svelte frontend, SQLite config, and no separate services.
  - title: Live Widgets
    details: The server polls integrations and streams updates to the browser over SSE.
  - title: In-App Setup
    details: Manage service URLs, credentials, refresh intervals, themes, and layout from the dashboard.
---

![Labby dashboard](./screenshot-v1.6.0.png)
