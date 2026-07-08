import { defineConfig } from 'vitepress';

const base = process.env.VITEPRESS_BASE ?? '/';

export default defineConfig({
  title: 'Labby',
  description: 'A lightweight self-hosted homelab dashboard.',
  base,
  cleanUrls: true,
  ignoreDeadLinks: true,
  srcExclude: ['superpowers/**'],
  head: [
    ['link', { rel: 'icon', href: `${base}icons/labby.svg` }],
    ['meta', { name: 'theme-color', content: '#111827' }],
  ],
  themeConfig: {
    logo: '/icons/labby.svg',
    siteTitle: 'Labby',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Integrations', link: '/guide/integrations' },
      { text: 'GitHub', link: 'https://github.com/samuelloranger/labby' },
    ],
    sidebar: [
      { text: 'Getting Started', link: '/guide/getting-started' },
      { text: 'Integrations', link: '/guide/integrations' },
      { text: 'Security', link: '/guide/security' },
      { text: 'Development', link: '/guide/development' },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/samuelloranger/labby' },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Labby contributors',
    },
  },
});
