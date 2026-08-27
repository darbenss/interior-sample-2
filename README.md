# Ruang Rasa — Interior Design Studio

Static-first company profile and portfolio site. Astro 5 (SSG) · Tailwind 4 · React islands · Cloudflare Pages. No CMS — content is hand-edited YAML, deployed by the developer on a retainer basis. See §4.

Design tokens and art direction are transcribed from `../stitch_ruang_rasa_interior_studio_final/ruang_rasa/DESIGN.md`.

---

## 1. Directory structure

```
ruang-rasa/
├── astro.config.mjs           # output:'static' + Cloudflare adapter (build-time image pipeline only)
├── wrangler.jsonc             # Pages project config
│
├── public/
│   ├── _headers               # CSP, HSTS, cache-control
│   ├── robots.txt
│   ├── favicon.svg
│   └── og-default.jpg
│
└── src/
    ├── content.config.ts      # Zod schema — validates content/*.yaml at build time
    │
    ├── content/               # ◀ everything an update touches — hand-edited YAML
    │   ├── projects/*.yaml    #   one case study per file
    │   ├── journal/*.yaml
    │   └── settings/site.json #   WhatsApp number, analytics provider, contact details
    │
    ├── assets/images/         # project/essay photography lands here so astro:assets can optimise it
    │   ├── portfolio/  home/  studio/  expertise/  journal/  contact/
    │
    ├── lib/
    │   ├── analytics.ts       # ◀ data-cta tracking: delegated listener + shared dispatch
    │   ├── whatsapp.ts        # number normalisation + wa.me link builder
    │   ├── images.ts          # maps a content image path → ImageMetadata for optimisation
    │   └── site.ts            # typed accessor over settings/site.json
    │
    ├── layouts/
    │   └── BaseLayout.astro   # head, fonts, analytics bootstrap, scroll reveal
    │
    ├── components/
    │   ├── Nav.astro          # static CTA (data-cta, no island)
    │   ├── Footer.astro       # static CTA (data-cta, no island)
    │   ├── MaterialImage.astro# AVIF + responsive srcset + "material label"
    │   ├── ProjectCard.astro
    │   ├── BeforeAfterSlider.astro # two-plate wipe: clip-path + a real range input
    │   ├── ResultGallery.astro     # full-bleed plates, offset vertical pairs
    │   ├── CtaBand.astro
    │   └── react/             # ◀ islands only
    │       ├── WhatsAppButton.tsx   # ◀ CTA primitive + Framer Motion + tracking
    │       ├── MotionRoot.tsx       # LazyMotion wrapper (drops 13.5 KB gz)
    │       ├── HeroHeadline.tsx     # SSR-settled staggered reveal
    │       └── InquiryForm.tsx      # floating labels → composed WhatsApp message
    │
    └── pages/
        ├── index.astro
        ├── studio.astro
        ├── expertise.astro
        ├── inquiries.astro
        ├── 404.astro
        ├── portfolio/
        │   ├── index.astro          # filterable gallery (vanilla JS, deliberately)
        │   └── [slug].astro         # ◀ dynamic case study via getStaticPaths
        └── journal/
            ├── index.astro
            └── [slug].astro
```

There is no admin UI and no on-demand route of any kind — every request is a flat prerendered file. This is verifiable, not a claim: `dist/_routes.json` lists what the Worker is allowed to see.

```jsonc
// dist/_routes.json — generated, checked after every build
{
  "include": ["/_server-islands/*"],
  "exclude": ["/", "/_astro/*", "/404", "/expertise", "/inquiries",
              "/journal/*", "/portfolio/*", "/studio", ...]
}
```

Every page is on the `exclude` list — **17 static pages, zero executable routes**. A request for `/portfolio/nocturne-lounge` never reaches executable code.

---

## 2. Architecture: why this is not hackable the way WordPress is

A WordPress install answers every request by executing PHP against a MySQL database. That is the attack surface: plugin RCE, SQL injection, credential stuffing on `/wp-admin`, XML-RPC amplification.

This site has **no database and no request-time code path at all**. A visitor requesting `/portfolio/nocturne-lounge` receives a file that was written to disk at build time and cached on Cloudflare's edge. There is no query to inject into, no admin login to brute-force, and no plugin to exploit — content lives in Git, and there is no credential anywhere in the deployed system.

**Layers, outermost first:**

1. **Cloudflare WAF / bot management / rate limiting** — in front of everything.
2. **`public/_headers`** — HSTS (2yr, preload), CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
3. **Static delivery** — all 17 pages are files. There is no on-demand route to attack — nothing executes on a public request.

> **One honest caveat:** the CSP includes `'unsafe-inline'` on `script-src`, because Astro's island-hydration bootstrap and the `define:vars` analytics config are inline scripts. Removing it requires per-request nonce injection, which a prerendered site does not have. It is documented in `public/_headers` rather than silently accepted. If you need a nonce-based CSP, move the two inline blocks to external modules and add a Pages Function that stamps the nonce header.

---

## 3. Conversion tracking — the `data-cta` layer

Every WhatsApp CTA on the site carries `data-cta`, plus optional `data-cta-location`, `data-cta-project` and `data-cta-label`.

### Why tracking is not inside the React component

Most CTAs are **plain `<a>` tags in prerendered `.astro` markup** — nav, footer, inquiries page, 404. Only a few are React islands. If tracking lived only in `WhatsAppButton.tsx`, the majority of CTAs would silently report nothing.

So `src/lib/analytics.ts` provides two entry points into one dispatch function:

- `initCtaTracking()` — a **delegated listener on `document`** (capture phase, passive) that catches any `[data-cta]` click, including `auxclick` for middle-click.
- `trackCta(el, nativeEvent)` — called directly by `WhatsAppButton.tsx` and `InquiryForm.tsx`.

A `WeakSet` of native events dedupes them, so whichever fires first wins and the other is a no-op. **A click is never double-counted, and never missed.**

### Why it does not `preventDefault()`

Intercepting the click and then setting `window.location` adds latency and, on iOS Safari, breaks the `wa.me` deep-link handoff — the navigation leaves the user-gesture window and the WhatsApp app may refuse to open.

Instead the event ships via `navigator.sendBeacon()` (and `transport_type: 'beacon'` for gtag), which browsers guarantee to flush during unload. **The click proceeds completely untouched.**

### Activating a provider — required before any event is recorded

`BaseLayout.astro` emits the vendor tag itself, but **only when `analyticsId` in Site Settings is non-empty**. Out of the box that field is blank, which means no third-party script loads, no cookie is set, and `dispatch()` no-ops. That is the correct default for a site that has not launched its campaigns — but it also means *tracking is inert until you fill it in*.

To go live: open `src/content/settings/site.json` and set `analyticsProvider` + `analyticsId`.

| Provider | What goes in `analyticsId` |
|---|---|
| `gtag` | GA4 measurement ID, `G-XXXXXXXXXX` |
| `dataLayer` | GTM container ID, `GTM-XXXXXXX` |
| `plausible` | the site domain, e.g. `ruangrasa.com` |
| `cloudflare` | the Web Analytics beacon token |

Adding Meta Pixel or TikTok is a new `case` in `dispatch()` plus a snippet in `BaseLayout.astro` — not a refactor. Remember to add the vendor domain to `script-src`/`connect-src` in `public/_headers` or the browser blocks it.

For a record that survives ad blockers, set `endpoint` in the `__RR_ANALYTICS__` block in `BaseLayout.astro` to a Pages Function that logs to D1 or Workers Analytics Engine.

### Verifying tracking works

```bash
npm run build && npx wrangler pages dev
```

Open DevTools → Console. `import.meta.env.DEV` is false in a build, so flip `debug: true` in the `__RR_ANALYTICS__` block temporarily, or just watch the Network tab filtered to `beacon`. Click each CTA and confirm one event per click:

```bash
# Confirm every page carries at least one CTA before you ship
for f in $(find dist -name '*.html'); do
  n=$(grep -c 'data-cta="' "$f"); [ "$n" -eq 0 ] && echo "NO CTA: $f";
done
```

---

## 4. Content model and the update workflow

There is no CMS. The client is on a **flat monthly retainer** for content changes (project additions, journal essays, contact-detail tweaks); the developer makes every edit by hand and deploys it. This section is the developer's runbook for doing that quickly.

### Why the content is still structured YAML, not just "edit the HTML"

`src/content.config.ts` defines a Zod schema that every file under `src/content/projects/*.yaml` and `src/content/journal/*.yaml` must satisfy at build time — this is what used to double-check Keystatic's saves, and it still does the same job for a hand edit. A case study's `problem` / `designApproach` / `result` / `closingStatement` chapters are enforced as separate required fields with character ceilings, because this page is visual-first for a luxury audience: photography carries the argument, and prose that runs long breaks the layout it was tuned for.

| Chapter | Shape | Limit the schema enforces |
|---|---|---|
| `problem` | array of plain strings | **2–3 items, 60 characters each** — fragments ("Zero natural light"), never prose |
| `designApproach` | one paragraph | **60–320 characters** — materials and the spatial move, nothing about the meetings |
| `result` | object | `beforeAfter` (two plates, optional), `gallery[]` (**min 1**), `outcomes[]`, `clientQuote` |
| `closingStatement` | one line | **12–120 characters** — it is set at 80px Playfair on a charcoal band |

Break a bound and `npm run build` fails loudly with the offending file and field named — far better than a client-facing typo shipping to the live site.

### Adding a new portfolio project (fastest path)

1. Copy the YAML file closest in shape to the new project, e.g.:
   ```bash
   cp src/content/projects/az-padel-serpong.yaml src/content/projects/new-project-slug.yaml
   ```
   The filename becomes the URL slug (`/portfolio/new-project-slug`).
2. Drop the photography into `src/assets/images/portfolio/` (any reasonable name — `astro:assets` re-encodes and fingerprints it at build time, so raw exports are fine).
3. Edit the copied YAML top to bottom — every field's real-world example is already visible in whichever file you copied from. `coverImage`/gallery `image` values are paths like `/src/assets/images/portfolio/whatever.jpg`, matched against `src/lib/images.ts`'s glob of `src/assets/images/**`.
4. `npm run dev`, open `/portfolio/new-project-slug`, check it renders (hero, gallery, stats, closing line) and that `/portfolio` shows the new card.
5. Commit, push to `main`, done — see §5 for the deploy step.

### Updating an existing project or a journal essay

Just open the `.yaml` file and edit the field in place — `summary`, `outcomes`, a `gallery` entry, `body` (journal essays are plain paragraphs separated by a blank line, per `src/content/journal/*.yaml`). No structural boilerplate to touch.

### A build failure is your safety net, not a blocker

If `npm run build` errors, the message names the exact file and constraint — e.g. a `problem` array with 4 items, or a `gallery` image path that doesn't exist under `src/assets/images/`. Fix the named field and rebuild; this is the same check Keystatic used to enforce on save, just surfaced one step later.

---

## 5. Build budget — staying inside 500 builds/month, and the deploy step

The developer is the only one who ever pushes to `main`, so **every content update costs exactly one build** — batch several YAML edits into a single commit when a client sends multiple requests in one message, rather than pushing after each file.

Deploying an update, end to end:

```bash
git add src/content/...
git commit -m "Add <project/essay name>"
git push origin main
```

Cloudflare Pages is connected to this GitHub repo (`origin`) and builds `main` automatically on push — no manual `wrangler deploy` step needed. Confirm this is still true for your Cloudflare project under **Workers & Pages → your project → Settings → Builds & deployments** before relying on it for a client-facing update.

> **Preview branches**: if Cloudflare Pages is set to build preview deployments for every branch, a feature branch or experiment also spends quota. Settings → Builds & deployments → Branch control → set Preview branches to **None** unless you specifically want them.

### Step-by-step: test the build without spending one

**1. Measure a cold local build (this is what Cloudflare will do):**
```bash
rm -rf dist .astro node_modules/.astro
time npm run build
```
Record wall time. Free-tier builds are capped at **20 minutes**; this project builds in ~35 s with 23 images, so there is generous headroom. Image optimisation dominates, and it scales with photo count — re-measure after a large portfolio upload.

**2. Serve the real build output through the real runtime — costs zero builds:**
```bash
npx wrangler pages dev
```
Run it with **no directory argument** — passing `./dist` positionally makes wrangler ignore `wrangler.jsonc`, and with it the `nodejs_compat` flag. That is exactly how a fatal `MessageChannel is not defined` in the Worker stayed hidden during this build. It runs the Pages runtime locally, including `_headers` and `_routes.json`. Verify here, not on a deployed preview.

**3. Sanity-check the output before pushing:**
```bash
find dist -name '*.html' | wc -l     # expect 17 with the seeded content
cat dist/_routes.json                # confirm static paths are excluded from the Worker
du -sh dist                          # watch this grow as photography is added

# every page must carry at least one tracked CTA
for f in $(find dist -name '*.html'); do
  n=$(grep -c 'data-cta="' "$f"); [ "$n" -eq 0 ] && echo "NO CTA: $f";
done
```

A missing image now **fails the build loudly** (`src/lib/images.ts` throws) rather than shipping a case study with no hero photograph. You find out at `npm run build`, not from a customer.

**4. Estimate your real monthly spend:**

| Source | Builds/month |
|---|---|
| Content updates (batched per client request) | ~5 — matches the retainer's included-updates cap |
| Dependency/security bumps | ~2–5 |
| **Typical total** | **~7–10** |

That is comfortably under 5% of the 500 allowance.

**5. Guard rails if you get close:**

- **Skip CI builds for docs-only commits** — add `[skip ci]`… Cloudflare Pages does not honour that, so instead use **Build watch paths** (Settings → Builds & deployments) and exclude `README.md`, `docs/**`.
- **Never enable preview builds for every branch.** This is the single most common way projects blow the quota.
- **Batch dependency updates** — one weekly Dependabot PR, not one per package.
- Monitor usage under **Workers & Pages → your project → Metrics**.

---

## 6. Local dev performance

Removing Keystatic dropped ~268 packages (~5.8 MB of Vite pre-bundle: `react-aria`,
`@keystar/ui`, `graphql`, `slate`, `slate-react`, `urql`, `emotion`) that used to be
pulled in on every cold `npm run dev` start whether or not `/keystatic` was ever opened —
`@keystatic/astro` wrote its own entry into Vite's `optimizeDeps.entries`, forcing the
scan regardless. There is no longer a `dev` vs. `dev:fast` split: one `npm run dev`
command, and it is fast on a cold cache too — re-measured after removal at **~2.4s to
"ready"** from a cleared `.astro`/Vite cache, down from the ~16.5s documented before this
change. `npm run build`'s server-bundling step dropped similarly, from ~39s to ~9s,
since there's no longer a 410 KB Keystatic API route to compile.

### Two things that were *not* the problem

- **Image size.** The source photography is 512×512 max — 5.5 megapixels total across 23
  files. Astro was not chewing through high-res originals. Image encoding measured 0.3s
  for all seven homepage variants combined.
- **Over-hydration.** All eight islands were already `client:visible`; there is no
  `client:load` anywhere in `src/`. Framer Motion was already imported as `m` +
  `LazyMotion` rather than the full `motion` bundle.

### What the audit *did* find

- **Silent upscaling.** Call sites requested `widths={[768, 1024, 1440, 1920]}` from 512px
  sources, so sharp upscaled every variant — slower to encode and blurrier than the
  original, with no warning. `clampWidths()` in `src/lib/images.ts` now filters the list
  against the intrinsic width. The homepage srcset went from `768w…1920w` to
  `343w/480w/512w`.
- **Dev-mode AVIF.** Astro's dev image endpoint re-encodes per request without the build's
  quality pipeline — measured output was ~538 KB per variant, *larger than the source*,
  while the production build emits 16–24 KB. `MaterialImage` now uses WebP in dev and
  AVIF in production.

---

## 7. Commands

```bash
npm install
npm run dev        # localhost:4321
npm run build      # → dist/
npm run preview    # wrangler pages dev — the real Workers runtime, not a static file server
npm run check      # astro check (TypeScript + template diagnostics)
```

---

## 8. Performance notes

- **Images**: `astro:assets` emits AVIF with a responsive `srcset`. Measured on the seed set: 371 KB JPEG → 16 KB AVIF. CMS uploads land in `src/assets/` (not `public/`) specifically so they go through this pipeline; `src/lib/images.ts` resolves the CMS path string to `ImageMetadata` via `import.meta.glob`.
- **JS**: ~60 KB gz entry on the homepage. React is 57 KB of that. Framer Motion is loaded via `LazyMotion` + the `m` component (`MotionRoot.tsx`) with only the `domAnimation` feature set — **26.5 KB gz instead of 40 KB**, with `strict` mode making the saving enforceable.
- **Islands**: only `WhatsAppButton`, `HeroHeadline` and `InquiryForm`, all `client:visible`. The portfolio filter is deliberately vanilla JS — show/hide on six prerendered cards does not justify a React root, and the cards' build-time-optimised images would have to be given up to hand them to React.
- **No layout-shift animations**: elements render *settled* in the HTML and are only armed for reveal once `IntersectionObserver` is confirmed available. Crawlers, reader modes and no-JS visitors see finished content, never `opacity: 0`.
- **Fonts**: only the four weights actually used are requested, with `display=swap` and preconnect. The mockups pull the full 100–900 variable range.
- **No redirect on navigation**: `build.format: 'file'` emits `portfolio/nocturne-lounge.html` rather than `.../index.html`. With directory-style output, Cloudflare Pages 308-redirects `/portfolio` → `/portfolio/`, putting an extra round trip on the site's most-travelled path. Verified with `curl -o /dev/null -w '%{http_code}'` against `wrangler pages dev`.
- **Sitemap**: `@astrojs/sitemap` emits `sitemap-index.xml`, which `public/robots.txt` points at.
