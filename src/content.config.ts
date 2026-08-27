import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* ---------------------------------------------------------------------------
 * Astro content collections mirror the Keystatic schema.
 *
 * These two definitions must stay in step: Keystatic validates on WRITE (in the
 * admin panel) and Zod validates on READ (at build time). The second check is
 * what turns "a client saved something malformed" into a loud build failure
 * instead of a broken page in production — which matters precisely because the
 * client, not a developer, is the one editing.
 * ------------------------------------------------------------------------- */

const galleryItem = z.object({
  image: z.string(),
  alt: z.string(),
  materialLabel: z.string().optional().nullable(),
  ratio: z.enum(['vertical', 'horizontal']).default('vertical'),
});

/* One plate of the Before & After comparison. Both fields are tolerant because
   the pair is optional as a whole: Keystatic writes the object with null values
   for a project that has no before photography, and that must parse rather than
   fail the build. The template renders the slider only when BOTH images
   resolve — half a comparison is worse than none. */
const comparisonPlate = z
  .object({
    image: z.string().optional().nullable(),
    alt: z.string().optional().nullable(),
  })
  .optional()
  .nullable();

const projects = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['residential', 'commercial', 'hospitality']),
    location: z.string(),
    year: z.number(),
    featured: z.boolean().default(false),
    order: z.number().default(100),
    summary: z.string(),
    coverImage: z.string(),
    coverAlt: z.string(),
    materialLabel: z.string().optional().nullable(),
    /* z.coerce.string(): a client typing a bare number ("34") makes the YAML
       parser hand us a number, not a string. Coercing here means the CMS stays
       forgiving instead of failing the build on a formatting technicality. */
    facts: z
      .array(z.object({ label: z.string(), value: z.coerce.string() }))
      .default([]),

    /* ---- The three mandated chapters. All required. ----
       The bounds below are not defensive programming, they are the layout
       contract. Four Problem fragments break the editorial column they render
       in, and a 900-character Design Approach turns a visual case study back
       into the wall of text this page was rebuilt to escape. Keystatic blocks
       both on save; these are the same limits enforced at build time, for
       content that arrived by hand or predates the schema. */
    problem: z.array(z.string()).min(2).max(3),

    designApproach: z.string(),

    result: z.object({
      /* Optional as a whole — see comparisonPlate. */
      beforeAfter: z
        .object({ before: comparisonPlate, after: comparisonPlate })
        .optional()
        .nullable(),
      /* The centrepiece. A case study with no finished photography has nothing
         to say, so an empty gallery fails the build rather than shipping a
         Result chapter that is a stat row and a quote. */
      gallery: z.array(galleryItem).min(1),
      outcomes: z
        .array(z.object({ value: z.coerce.string(), label: z.string() }))
        .default([]),
      clientQuote: z
        .object({
          quote: z.string().optional().nullable(),
          attribution: z.string().optional().nullable(),
        })
        .optional(),
    }),

    closingStatement: z.string(),

    ctaMessage: z.string().optional().nullable(),
    seoTitle: z.string().optional().nullable(),
  }),
});

const journal = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['lighting', 'materials', 'architecture', 'interior-rhythm']),
    publishedAt: z.coerce.date(),
    featured: z.boolean().default(false),
    excerpt: z.string(),
    coverImage: z.string(),
    coverAlt: z.string(),
    body: z.string(),
  }),
});

export const collections = { projects, journal };
