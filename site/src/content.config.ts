import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // Markdown rendered by /privacy and /terms inside the Marketing layout.
  legal: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/legal' }) }),
}
