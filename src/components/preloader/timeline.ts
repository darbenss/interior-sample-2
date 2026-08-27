/* ---------------------------------------------------------------------------
 * Preloader timeline — the single source of truth for every timing.
 *
 * The CSS reads these as custom properties (emitted onto #rr-preloader by
 * Preloader.astro) and the inline script reads `TIMELINE.total`, so the
 * stylesheet and the unmount can never drift apart. Change a number here and
 * the whole sequence stays internally consistent.
 *
 *   0ms ──────────────────────────────────── 2000ms   outer outline draws
 *        320ms ────────────────────────────  2000ms   inner lines draw (staggered)
 *                        1500ms ─────────── 2300ms    "RUANG RASA" reveals
 *                                  2500ms ─ 3000ms    overlay fades + unmounts
 * ------------------------------------------------------------------------- */

/** Rendered letter by letter. The stagger below is derived from its length. */
export const WORDMARK = 'RUANG RASA';

/**
 * Show the title card once per browser session rather than on every internal
 * navigation. This is a multi-page site: without it, every link costs three
 * seconds.
 *
 * Read in two places, which is why it lives here rather than in the component:
 * the head script in BaseLayout (which stamps `html.rr-skip-preloader` before
 * first paint, so a repeat view never even flashes) and the body script in
 * Preloader.astro. Flip it to `false` and the card plays on every page load.
 *
 * To re-arm it while developing without touching this file:
 * `sessionStorage.removeItem('rr-seen')`, or open a fresh tab.
 */
export const ONCE_PER_SESSION = true;

export const TIMELINE = {
  /** Everything is gone by here. */
  total: 3000,
  /** Outer outline AND inner lines both finish drawing on this frame. */
  drawEnd: 2000,
  /** Inner lines hang back so the outline reads as the lead element... */
  innerStart: 320,
  /** ...and each subsequent inner line starts this much later than the last,
      shortening its own duration so the group still lands on `drawEnd`. */
  innerStep: 45,
  textStart: 1500,
  textEnd: 2300,
  /** Per-letter fade+rise. The stagger fills whatever window is left over. */
  textDuration: 400,
  fadeStart: 2500,
} as const;

/** Non-space glyphs — spaces are laid out, not animated. */
const letterCount = WORDMARK.replace(/\s+/g, '').length;

/* Derived rather than hard-coded: the last letter must land exactly on
   `textEnd` even if the wordmark is re-typed to a different length. */
export const TEXT_STAGGER =
  letterCount > 1
    ? (TIMELINE.textEnd - TIMELINE.textStart - TIMELINE.textDuration) / (letterCount - 1)
    : 0;

export const FADE_DURATION = TIMELINE.total - TIMELINE.fadeStart;
export const INNER_DURATION = TIMELINE.drawEnd - TIMELINE.innerStart;

/** Emitted as the `style` attribute of #rr-preloader; children inherit them. */
export const TIMELINE_CSS_VARS: Record<string, string> = {
  '--rr-draw-end': `${TIMELINE.drawEnd}ms`,
  '--rr-outer-dur': `${TIMELINE.drawEnd}ms`,
  '--rr-inner-delay': `${TIMELINE.innerStart}ms`,
  '--rr-inner-step': `${TIMELINE.innerStep}ms`,
  '--rr-text-start': `${TIMELINE.textStart}ms`,
  '--rr-text-dur': `${TIMELINE.textDuration}ms`,
  '--rr-text-stagger': `${TEXT_STAGGER}ms`,
  '--rr-fade-start': `${TIMELINE.fadeStart}ms`,
  '--rr-fade-dur': `${FADE_DURATION}ms`,
};

export const timelineStyleAttr = Object.entries(TIMELINE_CSS_VARS)
  .map(([key, value]) => `${key}:${value}`)
  .join(';');
