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
function scheduleRefreshes(bundle: GsapBundle): void {
  const { ScrollTrigger } = bundle;

  /* Two frames, not one. The first frame after the lock lifts is the one the
     browser spends reflowing the now-scrollable document; measuring on it can
     still read the locked height. */
  requestAnimationFrame(() => requestAnimationFrame(() => ScrollTrigger.refresh()));

  if ('fonts' in document) {
    document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
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

       This runs on every page, but the effects are opt-in per element and most
       pages carry none of them. Without this check each one would fetch and
       parse ~45 KB of library to find zero targets. It also makes adoption
       incremental: a page starts paying for GSAP on the commit that first adds
       a `data-gsap` attribute to it, not before. */
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
    };
  });
}
