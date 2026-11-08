import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import starlight from '@astrojs/starlight'

// Static site served at https://warddesk.app (www redirects to it). See README "Overview site".
export default defineConfig({
  site: 'https://warddesk.app',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    sitemap(),
    starlight({
      title: 'Ward Desk',
      description: 'Ward administration in one place: agendas, callings, sacrament meeting, appointments and requests.',
      logo: { src: './src/assets/logo.svg', alt: 'Ward Desk' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/ward-desk/ward-desk' }], // keep in sync with REPO_URL in src/site.config.ts
      customCss: ['@fontsource-variable/lexend', './src/styles/tokens.css', './src/styles/starlight.css'],
      sidebar: [
        { label: 'Getting started', items: [{ autogenerate: { directory: 'docs/getting-started' } }] },
        { label: 'Home', collapsed: true, items: [{ autogenerate: { directory: 'docs/home' } }] },
        { label: 'Meetings & agendas', collapsed: true, items: [{ autogenerate: { directory: 'docs/meetings' } }] },
        { label: 'Callings', collapsed: true, items: [{ autogenerate: { directory: 'docs/callings' } }] },
        { label: 'Sacrament meeting', collapsed: true, items: [{ autogenerate: { directory: 'docs/sacrament' } }] },
        { label: 'Appointments', collapsed: true, items: [{ autogenerate: { directory: 'docs/appointments' } }] },
        { label: 'Requests', collapsed: true, items: [{ autogenerate: { directory: 'docs/requests' } }] },
        { label: 'Settings', collapsed: true, items: [{ autogenerate: { directory: 'docs/settings' } }] },
        { label: 'Leadership changes', collapsed: true, items: [{ autogenerate: { directory: 'docs/leadership-changes' } }] },
        { label: 'Roles & privacy', collapsed: true, items: [{ autogenerate: { directory: 'docs/roles-and-privacy' } }] },
        { label: 'Running it for your ward', collapsed: true, items: [{ autogenerate: { directory: 'docs/self-hosting' } }] },
        { label: 'Operations', collapsed: true, items: [{ autogenerate: { directory: 'docs/operations' } }] },
      ],
    }),
  ],
})
