/* ---------------------------------------------------------------------------
 * GSAP runtime — the ticker bridge, plugin registration, and the refresh
 * discipline ScrollTrigger needs on THIS site specifically.
 *
 * WHAT THIS MODULE IS FOR
 * ScrollTrigger and Lenis both want to be the thing that runs once per frame.
 * Left on separate loops, ScrollTrigger reads a scroll position Lenis is about
 * to change, and every pinned or scrubbed element lands one frame behind the
 * page it is attached to. At 60fps that is a 16ms skew, and it reads as "the
 * parallax is swimming". So: one clock, GSAP's, and Lenis rides on it.
 *
 * THE HANDOFF IS DELIBERATELY LATE AND DELIBERATELY REVERSIBLE
 * smooth-scroll.ts carries a long comment about the time `autoRaf: false`
 * shipped here and made the site completely unscrollable — a self-parking rAF
 * loop and Lenis's input handling deadlocked each other. Re-read it before
 * touching anything below, because this module also turns `autoRaf` off. The
 * reason that is safe here is narrow and specific:
 *
 *   1. GSAP's ticker NEVER PARKS while we hold a listener on it. Its autoSleep
 *      path is guarded by `_ticker._listeners.length < 2` (gsap-core.js, in
 *      `Timeline.updateRoot`). GSAP core owns one listener; `ticker.add()`
 *      below makes two. That condition is never true again, so the ticker
 *      cannot fall asleep underneath Lenis the way the parking loop did.
 *   2. Lenis is constructed with `autoRaf: true` and drives ITSELF until GSAP
 *      is on the page and proven. `lenis.raf()` re-schedules itself only
 *      `if (this.options.autoRaf)` (lenis.mjs), so flipping that flag ends the
 *      self-loop cleanly after the in-flight frame — and the ticker is already
 *      running by then, so there is no frame where nothing drives the scroll.
 *   3. If the GSAP chunk 404s, `attachLenis` is never reached, the flag is
 *      never flipped, and the site degrades to exactly what it is today: Lenis
 *      on its own loop. No dead page.
 *
 * WHAT IT COSTS
 * gsap + ScrollTrigger + SplitText is ~43 KB brotli. It sits behind a dynamic
 * import that does not fire until `rr:preloader-done`, for the same reason
 * Lenis does — the title card owns the main thread for 3s painting a
 * stroke-dashoffset animation, and parsing 120 KB of library on that thread is
 * the contention this codebase has repeatedly refused to pay.
 * ------------------------------------------------------------------------- */

import type LenisType from 'lenis';
import { register, isFirstBoot, type Teardown } from './lifecycle';
import type { gsap as GsapType } from 'gsap';
import type { ScrollTrigger as ScrollTriggerType } from 'gsap/ScrollTrigger';
import type { SplitText as SplitTextType } from 'gsap/SplitText';

export type GsapBundle = {
  gsap: typeof GsapType;
  ScrollTrigger: typeof ScrollTriggerType;
  SplitText: typeof SplitTextType;
};

declare global {
  interface WindowEventMap {
    /** Dispatched by smooth-scroll.ts on the frame Lenis is constructed. */
    'rr:lenis-ready': CustomEvent<{ lenis: LenisType }>;
  }
}

const REDUCED = '(prefers-reduced-motion: reduce)';

/* Memoised, so a page running three effect modules parses the library once.
   Every consumer awaits this same promise. */
let bundlePromise: Promise<GsapBundle | null> | null = null;

/* Set once the library is on the page. The `rr:lenis-ready` handler needs it,
   and that handler can fire before or after the import resolves. */
let loadedBundle: GsapBundle | null = null;

/**
 * Load GSAP + ScrollTrigger + SplitText and register them.
 *
 * Returns `null` rather than throwing if the chunk cannot be fetched. Every
 * caller treats `null` as "leave the DOM in its authored, settled state" —
 * which is a complete page, because of the additive contract the effects keep.
 */
export function loadGsap(): Promise<GsapBundle | null> {
  bundlePromise ??= (async () => {
    try {
      const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('gsap/SplitText'),
      ]);

      gsap.registerPlugin(ScrollTrigger, SplitText);

      /* LAG SMOOTHING OFF. GSAP's default on a long frame is to pretend less
         time passed than really did, so tweens do not jump. That is right for a
         timeline on its own clock and wrong for one scrubbed by scroll: the
         scroll offset is ground truth, and a smoothed tween drifts out of
         register with the section it is pinned to, then snaps back. */
      gsap.ticker.lagSmoothing(0);

      /* Mobile browsers fire `resize` every time the URL bar slides away.
         Refreshing on each one recomputes every start/end on the page
         mid-scroll — expensive, and visibly wrong, because pinned sections
         jump as their bounds move under the reader. Orientation changes still
         refresh. */
      ScrollTrigger.config({ ignoreMobileResize: true });

      return { gsap, ScrollTrigger, SplitText };
    } catch {
      return null;
    }
  })();

  return bundlePromise;
}

/**
 * Put Lenis on GSAP's ticker and hand ScrollTrigger the scroll signal.
 */
function attachLenis(bundle: GsapBundle, lenis: LenisType): Teardown {
  const { gsap, ScrollTrigger } = bundle;

  /* Lenis moves the page with `window.scrollTo`, so ScrollTrigger's own
     listener would see the change eventually — but on the browser's schedule,
     not GSAP's. Updating it from Lenis's own event means ScrollTrigger holds
     the new offset in the same frame Lenis produced it, before a tween
     renders. */
  const onLenisScroll = () => ScrollTrigger.update();
  lenis.on('scroll', onLenisScroll);

  /* GSAP's ticker passes seconds; Lenis wants milliseconds. This is the whole
     bridge.

     THE RETURN VALUE IS NOT OPTIONAL HERE. `ticker.add` hands back the
     function it actually registered, and that reference is the only way to
     remove it again. Without the removal below, every navigation adds another
     ticker callback driving a Lenis instance whose document was thrown away —
     they never stop running, and the cost compounds for the whole session. */
  const drive = gsap.ticker.add((time: number) => lenis.raf(time * 1000));

  /* ONLY NOW does Lenis stop driving itself. See note 2 in the header. */
  lenis.options.autoRaf = false;

  /* Keeping the two measurements in step, in the one direction that is safe.

     Lenis has no resize event to subscribe to — it remeasures internally via
     its own ResizeObserver (autoResize). ScrollTrigger DOES already refresh on
     resize, so the reliable ordering is to hang off its refresh and remeasure
     Lenis there. That also covers every refresh ScrollTrigger performs for
     reasons of its own — a font swap, a split, an image finally laying out —
     each of which changes document height and would otherwise leave Lenis
     easing toward a scroll limit that no longer exists. */
  const onRefreshInit = () => lenis.resize();
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);

  return () => {
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    gsap.ticker.remove(drive);
    lenis.off('scroll', onLenisScroll);

    /* Hand the loop back before letting go. The instance is about to be
       destroyed by smooth-scroll's own teardown, which runs after this one —
       but if that ever stops being true, a Lenis left with autoRaf false and
       no ticker driving it is an unscrollable page. */
    lenis.options.autoRaf = true;
  };
}

/**
 * The refresh this site cannot skip.
 *
 * `html.rr-loading { overflow: hidden }` holds the document at viewport height
 * for the length of the title card. A ScrollTrigger created in that window
 * caches a start and end computed against a page 100svh tall instead of several
 * thousand pixels, and stays wrong for the life of the page. smooth-scroll.ts
 * documents the identical hazard for Lenis's own measurement, which is why it
 * waits on the same event.
 *
 * Fonts are the other half: the display face here changes line-box heights
 * noticeably, so anything measured before the swap was measured against the
 * fallback's layout.
 */
/**
 * ScrollTrigger.refresh(), minus its habit of restoring a scroll position from
 * a document that no longer exists.
 *
 * WHAT REFRESH IS DOING, AND WHY IT IS NORMALLY RIGHT. Recalculating every
 * trigger can move content (a pin spacer appears, an image finally lays out), so
 * `refresh()` records the scroller offset first and puts it back afterwards. On
 * a single long-lived page that is exactly what you want: the reader does not
 * get thrown around by a font swap.
 *
 * WHY IT IS WRONG HERE. Under a client-side router the ScrollTrigger MODULE is
 * never re-evaluated — killing every trigger does not reset the scroller cache
 * it reads that offset from. So the value it "restores" on the new page can be
 * the one it memorised on the previous one.
 *
 * MEASURED, on /portfolio scrolled to 2000 -> /:
 *   563ms  the router sets scrollY to 0, correctly
 *   627ms  we refresh
 *   634ms  ScrollTrigger calls scrollTo(0, 2000)
 * and the reader lands halfway down the homepage having clicked "home". It only
 * shows where the destination is long enough for the stale offset to be a legal
 * position, which is why the homepage was the page that looked broken.
 *
 * `clearScrollMemory()` is the documented remedy and did NOT fix it here —
 * verified in a browser, twice. So this takes the position the router chose as
 * the authority and re-asserts it if the refresh moved us. It is not a fight
 * with the library: refresh preserves "where the reader was", and after a
 * navigation that is wherever the router just put them.
 */
export function refreshKeepingScroll(bundle: GsapBundle): void {
  const intended = window.scrollY;

  bundle.ScrollTrigger.clearScrollMemory();
  bundle.ScrollTrigger.refresh();

  /* A pixel of slack: sub-pixel offsets are not the bug being corrected. */
  if (Math.abs(window.scrollY - intended) > 1) {
    window.scrollTo(0, intended);
  }
}

function scheduleRefreshes(bundle: GsapBundle): void {
  /* Two frames, not one. The first frame after the lock lifts is the one the
     browser spends reflowing the now-scrollable document; measuring on it can
     still read the locked height. */
  requestAnimationFrame(() =>
    requestAnimationFrame(() => refreshKeepingScroll(bundle))
  );

  if ('fonts' in document) {
    document.fonts.ready.then(() => refreshKeepingScroll(bundle)).catch(() => {});
  }
}

/**
 * Entry point, called from BaseLayout after `initSmoothScroll()`.
 *
 * Mirrors smooth-scroll.ts's shape on purpose: wait for the preloader, then do
 * the expensive thing. Under reduced motion the library is never fetched — the
 * authored, settled DOM is the reduced-motion experience.
 */
export function initGsapScroll(): void {
  register('gsap-scroll', () => {
    if (window.matchMedia(REDUCED).matches) return;

    /* NOTHING TO ANIMATE, NOTHING TO DOWNLOAD.

       This runs on every page, and the effects are opt-in per element.

       CURRENTLY THIS EXCLUDES NOTHING, and that is worth knowing rather than
       discovering. The footer wordmark carries `data-gsap="chars"` and the
       footer is in BaseLayout, so every page on the site matches and every
       page pays the ~45 KB. The check is kept because it is the thing that
       makes that reversible: drop the footer effect and the guard immediately
       starts excluding again, with no other change. */
    if (!document.querySelector('[data-gsap]')) return;

    let detachLenis: Teardown | null = null;
    let teardownEffects: Teardown | null = null;
    let cancelled = false;

    const bindLenis = (bundle: GsapBundle, lenis: LenisType) => {
      if (cancelled) return;
      detachLenis = attachLenis(bundle, lenis);
    };

    const onLenisReady = (event: WindowEventMap['rr:lenis-ready']) => {
      const bundle = loadedBundle;
      if (bundle) bindLenis(bundle, event.detail.lenis);
    };

    const boot = async () => {
      const bundle = await loadGsap();
      if (!bundle || cancelled) return;
      loadedBundle = bundle;

      /* SCROLLTRIGGER REMEMBERS THE SCROLL POSITION OF A PAGE THAT NO LONGER
         EXISTS, AND PUTS IT BACK.

         `refresh()` records the scroller offset before it recalculates and
         restores it afterwards, so a reader is not thrown around by a layout
         recalculation. That recorded value lives on the ScrollTrigger MODULE,
         which under a client-side router is never re-evaluated — killing the
         triggers does not touch it.

         So the sequence was: router swaps the document, router scrolls to the
         top (correctly), we refresh, and refresh helpfully restores the offset
         it memorised on the PREVIOUS page. Measured on /portfolio -> / : Astro
         set scrollY 0 at 560ms, ScrollTrigger put it back to 2000 at 619ms.
         The reader lands halfway down the new page with no idea why.

         It only shows where the destination is tall enough for the stale offset
         to be a legal scroll position, which is why the homepage — the longest
         page on the site — was the one that looked broken.

         NO ARGUMENT. The optional one sets history.scrollRestoration, which is
         the router's to manage, not ours. (The runtime takes a second `force`
         flag that the typings do not declare; it only matters mid-refresh, and
         neither call site is.) */
      bundle.ScrollTrigger.clearScrollMemory();

      /* Lenis may already be up (it races us off the same event), may still be
         fetching its chunk, or may never arrive if that fetch failed. All three
         are fine — ScrollTrigger works against native scroll perfectly well. */
      const existing = (window as { __rrLenis?: LenisType }).__rrLenis;
      if (existing) {
        bindLenis(bundle, existing);
      } else {
        window.addEventListener('rr:lenis-ready', onLenisReady, { once: true });
      }

      const { initEffects } = await import('./gsap-effects');
      if (cancelled) return;
      teardownEffects = initEffects(bundle);

      scheduleRefreshes(bundle);
    };

    /* The preloader only exists on the first page of a session — see the same
       note in smooth-scroll.ts. Waiting for it on any later page would mean the
       effects simply never initialise there. */
    const waitingOnPreloader = isFirstBoot() && document.getElementById('rr-preloader');
    const start = () => void boot();

    if (waitingOnPreloader) {
      window.addEventListener('rr:preloader-done', start, { once: true });
    } else {
      start();
    }

    return () => {
      cancelled = true;
      window.removeEventListener('rr:preloader-done', start);
      window.removeEventListener('rr:lenis-ready', onLenisReady);
      teardownEffects?.();
      detachLenis?.();
      /* Belt and braces for the same bug: drop the memory on the way out as
         well as on the way in, so it cannot survive even if a refresh lands
         between this teardown and the next boot. */
      loadedBundle?.ScrollTrigger.clearScrollMemory();
    };
  });
}
