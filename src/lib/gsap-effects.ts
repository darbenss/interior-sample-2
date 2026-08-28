/* ---------------------------------------------------------------------------
 * The three scroll effects, as GSAP timelines.
 *
 * THE PROPERTY RULE, AND WHY IT IS NOT NEGOTIABLE
 * Everything below animates `transform` and `opacity` and nothing else. Those
 * two are the only properties a browser can change without re-running layout or
 * paint — they are handed to the compositor and applied to an existing texture.
 * Touch `height`, `top`, `margin` or `width` on a scrubbed animation and every
 * frame re-runs layout for the whole document, which is the single most
 * reliable way to turn a 60fps scroll into a 20fps one.
 *
 * The one deliberate exception is ScrollTrigger's `pin`, which writes padding
 * to a spacer element. That happens ONCE at setup and on refresh, never
 * per-frame, so it costs a layout at creation and nothing thereafter.
 *
 * THE ADDITIVE CONTRACT
 * This site's existing reveal system renders elements SETTLED in the HTML and
 * only *arms* them (hides them) from script, so a crawler, a reader-mode
 * parser, or a visitor whose bundle failed sees finished content rather than an
 * empty page. GSAP's `from()` tweens preserve that: the hidden state is written
 * by JS at creation time, so it can only ever be reached by a runtime that is
 * also capable of undoing it. Do not move these start states into CSS.
 *
 * WILL-CHANGE
 * Applied on enter, removed on complete. Every element holding
 * `will-change: transform` is a permanent compositor layer with its own texture
 * in VRAM; a dozen left armed after their reveal finished is a dozen textures
 * held for the rest of the session, which on a mid-range phone is exactly the
 * jank the property was supposed to prevent. Scrubbed effects hold it for as
 * long as they are on screen (they genuinely are animating that whole time) and
 * drop it on the way out.
 * ------------------------------------------------------------------------- */

import type { GsapBundle } from './gsap-scroll';

/* Toggled by ScrollTrigger rather than written inline, so the compositor hint
   lives with the rest of the styling. See .rr-gsap-active in gsap.css. */
const ACTIVE = 'rr-gsap-active';

/* ---------------------------------------------------------------- 1. SPLIT

   Line-masked text reveal. Each line is wrapped in its own overflow-clipped
   box and slid up from beneath its own bottom edge, so the type appears to be
   uncovered rather than to fly in.

   SplitText's `mask: 'lines'` builds those wrappers itself. Doing it by hand
   means cloning each line element, moving the original inside, and setting
   overflow — which is what the plugin does at line ~273 of SplitText.js, only
   it also knows how to tear it all down again.

   `autoSplit: true` is the part that matters for correctness rather than
   convenience. A line split is only valid for one particular set of line
   breaks: rotate the phone, resize the window, or let the display font swap in,
   and the text rewraps while the wrappers stay where they were, which leaves
   words clipped in half. `autoSplit` re-runs the split on font load and on
   resize, and `onSplit` rebuilds the tween against the new lines.
   ------------------------------------------------------------------------ */
function initSplitReveals({ gsap, SplitText, ScrollTrigger }: GsapBundle): void {
  const targets = gsap.utils.toArray<HTMLElement>('[data-gsap="split"]');

  targets.forEach((el) => {
    const stagger = Number(el.dataset.gsapStagger ?? 0.08);
    const delay = Number(el.dataset.gsapDelay ?? 0);

    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      linesClass: 'rr-line',
      /* Keeps the element readable to assistive tech after it has been
         shredded into per-line spans. Without this a screen reader announces
         the fragments as separate, unrelated strings. */
      aria: 'auto',

      /* Returning a tween from onSplit hands GSAP ownership of it: on the next
         re-split the old one is reverted for us, so resizing does not
         accumulate a new timeline on every event. */
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 110,
          /* Opacity is here for the tail of the motion, not the reveal itself —
             the mask already does the hiding. Without it the last few pixels of
             travel read as a hard edge.

             NOT autoAlpha. That would also write `visibility: hidden`, which
             takes the lines out of the accessibility tree for as long as they
             are armed — and leaves them there permanently in the one case that
             matters, a trigger that never fires. */
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger,
          delay,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            /* An entrance, not a state. Once it has played the trigger is
               killed and the lines are ordinary text again. */
            once: true,
          },
          onStart: () => gsap.set(self.lines, { willChange: 'transform' }),
          onComplete: () => gsap.set(self.lines, { clearProps: 'willChange' }),
        });
      },
    });
  });

  /* Splitting rewrites the DOM of every target, which changes their heights.
     Anything measured before this point — including the curtain and parallax
     triggers set up below — is now measuring stale bounds. */
  ScrollTrigger.refresh();
}

/* --------------------------------------------------------------- 2. CURTAIN

   Sticky-scroll reveal: a section pins under the viewport while an overlying
   panel is drawn away, uncovering the content beneath it.

   PINNING AND LENIS. ScrollTrigger's default pin mechanism is `position:
   fixed`, and that is the correct one here. Lenis does not transform a wrapper
   element the way a transform-based smoother does — it drives the real
   scroll position via `window.scrollTo` — so fixed positioning stays
   registered with the page. (`pinType: 'transform'` is the setting for
   transform-based smoothers, and using it here would make the pin drift.)

   `anticipatePin: 1` lets ScrollTrigger apply the pin a frame early. With
   eased scrolling the page can travel a long way in one frame, and without it
   the pin visibly catches up after the fact.
   ------------------------------------------------------------------------ */
function initCurtains({ gsap }: GsapBundle): void {
  const sections = gsap.utils.toArray<HTMLElement>('[data-gsap="curtain"]');

  sections.forEach((section) => {
    const panel = section.querySelector<HTMLElement>('[data-gsap-curtain-panel]');
    const behind = section.querySelector<HTMLElement>('[data-gsap-curtain-behind]');
    if (!panel) return;

    /* Distance the curtain travels, as a multiple of viewport height. Longer
       means a slower, more deliberate draw for the same scroll input. */
    const travel = Number(section.dataset.gsapTravel ?? 1);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${window.innerHeight * travel}`,
        pin: true,
        /* Snaps the timeline's progress to the scroll position on every
           frame. `scrub: 1` adds a one-second catch-up so the curtain lags
           the wheel slightly and settles, which matches the easing Lenis is
           applying to the page itself. `true` would be rigid and, next to
           eased scrolling, reads as stiff. */
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onToggle: ({ isActive }) => {
          panel.classList.toggle(ACTIVE, isActive);
          behind?.classList.toggle(ACTIVE, isActive);
        },
      },
    });

    /* The curtain itself. yPercent, not `top` or `height` — the panel keeps its
       box and is simply moved off the compositor's copy of it. */
    tl.to(panel, { yPercent: -100, ease: 'none' }, 0);

    /* The content behind settles as it is uncovered. Scale from 1.08 rather
         than translating it, so the two layers move at different rates and the
         reveal reads as depth instead of as one sheet sliding off another. */
    if (behind) {
      tl.from(behind, { scale: 1.08, ease: 'none' }, 0);
    }
  });
}

/* -------------------------------------------------------------- 3. PARALLAX

   Depth by differential rate. The element travels a percentage of its own
   height across the window in which it is visible, against the page's travel.

   `yPercent` rather than `y` is what makes this resolution-independent: a
   pixel offset tuned on a 1440px desktop is a wildly different effect on a
   360px phone, whereas a percentage of the element's own height is the same
   gesture at every size.

   ONE TRIGGER PER ELEMENT, NO SHARED SCROLL HANDLER. ScrollTrigger batches
   every trigger on the page into a single update pass per frame, so twenty
   parallax elements cost one pass, not twenty listeners.
   ------------------------------------------------------------------------ */
function initParallax({ gsap }: GsapBundle): void {
  const targets = gsap.utils.toArray<HTMLElement>('[data-gsap="parallax"]');

  targets.forEach((el) => {
    /* Negative depth moves the element against the scroll (it appears further
       away); positive moves it with the scroll, slightly faster. */
    const depth = Number(el.dataset.gsapDepth ?? -12);

    gsap.fromTo(
      el,
      { yPercent: -depth / 2 },
      {
        yPercent: depth / 2,
        /* Linear, always. Any other ease means the element's rate no longer
           has a fixed relationship to the page's, which is the entire illusion
           — it stops looking like depth and starts looking like a mistake. */
        ease: 'none',
        scrollTrigger: {
          trigger: el.dataset.gsapTrigger
            ? el.closest<HTMLElement>(el.dataset.gsapTrigger) ?? el
            : el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
          /* Held for as long as the element is on screen, because for that
             whole span it genuinely is animating on every frame. Dropped the
             moment it leaves, so the texture is released. */
          onToggle: ({ isActive }) => el.classList.toggle(ACTIVE, isActive),
        },
      }
    );
  });
}

/**
 * Wire up whatever this page happens to contain. Each initialiser is a no-op
 * on a page with none of its markup, so this is safe to call everywhere.
 */
export function initEffects(bundle: GsapBundle): void {
  initSplitReveals(bundle);
  initCurtains(bundle);
  initParallax(bundle);
}
