// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://down-to-the-pixel.pages.dev',
  devToolbar: { enabled: false },
  vite: { build: { assetsInlineLimit: 0 } }, // every script is a file, so the CSP can stay script-src 'self'
});
