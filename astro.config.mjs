import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({ site: 'https://gaege.fyi', output: 'static', integrations: [sitemap()] });
