// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/**
 * ARCHITECTURE NOTE — why `output: 'static'` *and* an adapter.
 *
 * Every page is prerendered to flat HTML at build time: no database, no
 * origin server, no runtime query surface. That is the whole security argument
 * versus WordPress — there is nothing to inject into and nothing to escalate.
 * There are no on-demand routes at all; the adapter is kept only so
 * `imageService: 'compile'` can use Cloudflare's image pipeline at build time.
 *
 * Content (projects, journal essays) lives as YAML in src/content and is
 * edited by hand — there is no admin UI. See README.md §4.
 */
export default defineConfig({
  site: 'https://interior-sample2.kokowebsite.com',
  output: 'static',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [react(), sitemap()],

  /* Cloudflare Pages normalises directory-style URLs by 308-redirecting
     /portfolio -> /portfolio/. Emitting real .html files instead means
     /portfolio is served directly, removing a redirect round-trip from the
     site's most-travelled navigation path. */
  trailingSlash: 'never',
  build: { format: 'file' },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      /* React 19 resolves `react-dom/server` to the *browser* build, whose
         scheduler constructs a MessageChannel at module scope. workerd has no
         MessageChannel, so the Worker throws
         "ReferenceError: MessageChannel is not defined" the moment the renderer
         chunk initialises — before a single request is served.

         `react-dom/server.edge` is React's build for exactly this runtime: Web
         Streams, no MessageChannel. Scoped to the production build so `astro
         dev` (plain Node) keeps the standard resolution.

         Caught by `wrangler pages dev`, not by `astro build` — the build
         succeeds either way. This is why §5 of the README insists on testing
         against the real runtime before deploying. */
      alias: import.meta.env.PROD
        ? { 'react-dom/server': 'react-dom/server.edge' }
        : {},
    },
  },
  image: {
    // 4:5 (vertical) and 3:2 (horizontal) are the two ratios DESIGN.md calls for
    // in the masonry grid. Pre-declaring widths keeps srcset generation tight.
    responsiveStyles: true,
  },
  /* `defaultStrategy: 'viewport'` set an IntersectionObserver on every link on
     the page and fired a prefetch for each one that came into view. On the
     homepage that is the nav, three project cards, and the whole footer — a
     dozen HTML documents queued against the hero image during the first
     seconds of load. Astro requests these at low priority, so this was never
     the primary cause of the stutter, but it is free contention to remove.

     'hover' keeps the payoff (a navigation that feels instant, because the
     document is already cached by the time the click lands ~200ms after the
     pointer arrives) and pays nothing until the visitor signals intent.
     Touch devices trigger on `touchstart`, so mobile is covered too. */
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
