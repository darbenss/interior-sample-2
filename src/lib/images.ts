/* ---------------------------------------------------------------------------
 * Resolving CMS image paths to optimizable assets
 *
 * Keystatic stores an image field as a string path ("/src/assets/images/
 * portfolio/project-01.jpg"). Astro's <Image /> needs an ImageMetadata object
 * to resize and re-encode at build time — handing it a raw string means the
 * original file ships untouched, which on interior photography is the
 * difference between a 20 KB AVIF and a 370 KB JPEG.
 *
 * import.meta.glob with `eager` gives us that mapping at build time with no
 * runtime cost: Vite resolves every file under src/assets into a module whose
 * default export is the ImageMetadata Astro wants.
 * ------------------------------------------------------------------------- */
import type { ImageMetadata } from 'astro';

/* Extensions are listed in both cases. Vite's glob is case-sensitive, and
   Cloudflare builds on Linux where "photo.JPG" and "photo.jpg" are different
   files — a client uploading from a camera roll routinely produces uppercase
   extensions, and on macOS/Windows the mismatch is invisible until CI. */
const assets = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/images/**/*.{jpeg,jpg,png,webp,avif,JPEG,JPG,PNG,WEBP,AVIF}',
  { eager: true }
);

/* Second index keyed on the lowercased path, so lookup tolerates any casing
   the CMS happens to write. */
const byLowerKey = new Map<string, { default: ImageMetadata }>(
  Object.entries(assets).map(([key, mod]) => [key.toLowerCase(), mod])
);

/**
 * Look up an ImageMetadata by the path Keystatic wrote.
 *
 * Returns undefined ONLY when the field is genuinely empty (an optional image
 * the client chose not to set). If the CMS recorded a path and that file is not
 * on disk, this throws and fails the build.
 *
 * That is deliberate. The previous behaviour — degrade to a skipped <img> —
 * meant a client renaming or removing a photo produced a case study that built
 * green and shipped with no hero image. Nobody would notice until a lead
 * mentioned it. A build that fails loudly is recoverable in a minute; a page
 * that silently lost its photography is not.
 */
export function resolveImage(path?: string | null): ImageMetadata | undefined {
  if (!path || path.trim() === '') return undefined;

  // Normalise: Keystatic may or may not include the leading slash.
  const key = path.startsWith('/') ? path : `/${path}`;
  const entry = assets[key] ?? byLowerKey.get(key.toLowerCase());

  if (!entry) {
    throw new Error(
      `[images] "${path}" is referenced by content but does not exist under src/assets/images/.\n` +
        `  - If the file was renamed or deleted, update the entry in /keystatic.\n` +
        `  - If the extension is unusual (.gif, .svg, .heic), add it to the glob in src/lib/images.ts.\n` +
        `  Known assets: ${Object.keys(assets).length}`
    );
  }

  return entry.default;
}

/* AVIF is the right production format for smooth-gradient interior photography
   (measured 371 KB JPEG -> 16 KB AVIF here). But Astro's dev image endpoint
   re-encodes on every request and does not apply the same quality pipeline —
   measured dev output was ~538 KB per variant, i.e. larger than the source.
   WebP in dev keeps the browser payload small and the endpoint fast; the
   production build is unaffected.

   Exported rather than inlined in MaterialImage because a <link rel="preload">
   must name the byte-identical URL the <img> will request. If these two drifted,
   the preload would warm a variant the browser never asks for and the hero would
   be downloaded twice. */
export const IMAGE_FORMAT = import.meta.env.DEV ? 'webp' : 'avif';
export const IMAGE_QUALITY = 72;

/** Aspect ratio classes.
 *
 *  `vertical` (4:5) and `horizontal` (3:2) are the two DESIGN.md calls for and
 *  the only two the CMS exposes. `square` and `wide` are layout-only ratios
 *  used by the Curated Spaces grid on the homepage — they are never written by
 *  an editor, so the content schema stays a strict subset of these keys.
 *
 *  Every ratio here is enforced by an aspect-ratio box rather than a fixed
 *  height. That is what stops a tall source image from producing a two-screen
 *  tall card: the box dictates the height, and object-cover crops to fit. */
export const ratioClass = {
  vertical: 'aspect-[4/5]',
  horizontal: 'aspect-[3/2]',
  square: 'aspect-square',
  wide: 'aspect-[16/9]',
  portraitTall: 'aspect-[3/4]',
  /* Editorial grid only. Defers to `--rr-card-ratio`, which the grid CELL sets
     (see .rr-ratio-slot in global.css).
     
     WHY THE RATIO IS NOT BAKED IN FOR THESE
     The portfolio grid is filterable. When a category hides half the cards, the
     remaining ones are re-slotted so the composition stays deliberate instead of
     collapsing into whatever the survivors happened to be built as — and a slot
     carries BOTH a column span and a shape. If the shape were a class on the
     image, the script would have to know how to rewrite Tailwind aspect classes
     on a descendant; as an inherited custom property, moving a card to a new
     slot re-shapes it for free. */
  slot: 'rr-ratio-slot',
} as const;

export type Ratio = keyof typeof ratioClass;

/**
 * Clamp a requested srcset width list to what the source file can actually
 * deliver.
 *
 * The seeded photography is 512px on its longest edge. Asking Astro for a
 * 1920px variant of a 512px file makes sharp UPSCALE it — burning encode time
 * at build and in dev to produce a larger, blurrier file than the original.
 * Nothing warns you; the build just gets slower and the images get softer.
 *
 * So: keep only widths the source can serve, and if every requested width is
 * too large, fall back to the intrinsic width. Always returns at least one.
 */
export function clampWidths(requested: number[], intrinsicWidth: number): number[] {
  const usable = requested.filter((w) => w <= intrinsicWidth);
  return usable.length > 0 ? usable : [intrinsicWidth];
}
