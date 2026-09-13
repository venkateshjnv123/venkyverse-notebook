// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';

// Keystatic admin (/keystatic) is a local-only authoring UI. Enable it only
// for `astro dev` so production `astro build` stays a pure static site with
// no server adapter and no public admin route.
const isDev = process.env.npm_lifecycle_event === 'dev';

export default defineConfig({
  site: 'https://venkyverse.space',
  integrations: [
    mdx(),
    sitemap(),
    ...(isDev ? [react(), keystatic()] : []),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
