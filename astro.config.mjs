import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import tailwind from '@astrojs/tailwind'
import icon from 'astro-icon'

export default defineConfig({
    site: 'https://qingccl.github.io',
    integrations: [mdx(),  tailwind(),icon()],
    markdown: {
        shikiConfig: {
          themes: {
            light: 'poimandres',
            dark: 'catppuccin-latte',
          },
        },
      },
    
})
