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
        { label: 'Home', items: [{ autogenerate: { directory: 'docs/home' } }] },
        { label: 'Meetings & agendas', items: [{ autogenerate: { directory: 'docs/meetings' } }] },
        { label: 'Callings', items: [{ autogenerate: { directory: 'docs/callings' } }] },
        { label: 'Sacrament meeting', items: [{ autogenerate: { directory: 'docs/sacrament' } }] },
        { label: 'Appointments', items: [{ autogenerate: { directory: 'docs/appointments' } }] },
        { label: 'Requests', items: [{ autogenerate: { directory: 'docs/requests' } }] },
        { label: 'Settings', items: [{ autogenerate: { directory: 'docs/settings' } }] },
        { label: 'Roles & privacy', items: [{ autogenerate: { directory: 'docs/roles-and-privacy' } }] },
        { label: 'Running it for your ward', items: [{ autogenerate: { directory: 'docs/self-hosting' } }] },
      ],
    }),
  ],
})
