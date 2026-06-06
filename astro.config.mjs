// @ts-check
import { defineConfig } from 'astro/config';

// leerness.com — 정적 사이트 (Cloudflare Pages)
export default defineConfig({
  site: 'https://leerness.com',
  output: 'static',
  build: { format: 'directory' },
  trailingSlash: 'ignore',
});
