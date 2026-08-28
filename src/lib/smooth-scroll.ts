/* ---------------------------------------------------------------------------
 * Smooth scrolling (Lenis) + the single scroll signal the rest of the site reads.
 *
 * WHY THIS MODULE OWNS BOTH JOBS
 * Lenis does not replace the scrollbar — it intercepts wheel/touch input and
 * drives `window.scrollTo` itself on every frame. That means a component could
 * listen to the native `scroll` event and mostly work. The problem is the
 * *mostly*: under reduced motion Lenis is never constructed, so every consumer
 * would need its own "is Lenis here?" branch, and each one would add another
 * listener to the hottest event on the page.
 *
 * So this module emits exactly one signal — `rr:scroll` on `window` — whether
 * the frames come from Lenis or from the native scrollbar. Consumers (the
 * navbar state machine) subscribe to that and never know which is running.
 *
 * NOT BLOCKING THE MAIN THREAD
 *   - Loaded from a `<script>` in BaseLayout, which Astro emits as
 *     `type="module"` — deferred by default, so it never blocks the parser.
 *   - Lenis is imported DYNAMICALLY and only after the preloader has released
 *     the page. During the 3s title card the main thread belongs to the
 *     preloader's `stroke-dashoffset` draw, which is a paint-bound animation;
 *     parsing and executing a scroll library in that window is exactly the
 *     contention HeroHeadline.astro was rewritten to avoid.
 *   - The event carries the values it already computed. No consumer calls
 *     `scrollY`, so nothing forces a synchronous layout mid-frame.
 *   - Lenis runs its own rAF (`autoRaf: true`). Replacing it with a loop that
 *     parks when idle looks like free savings and is not — see the long note on
 *     that option below, which cost this site its scrollbar once already.
 * ------------------------------------------------------------------------- */

/** Payload of the `rr:scroll` CustomEvent. */
export type ScrollSignal = {
  /** Current scroll offset in px. */
  y: number;
  /** 1 = moving down the page, -1 = moving up, 0 = at rest. */
  direction: 1 | -1 | 0;
};

declare global {
  interface WindowEventMap {
    'rr:scroll': CustomEvent<ScrollSignal>;
    /** Dispatched by Preloader.astro on the frame the title card unmounts. */
    'rr:preloader-done': CustomEvent<void>;
  }
}

import { register, isFirstBoot, type Teardown } from './lifecycle';

const REDUCED = '(prefers-reduced-motion: reduce)';

/* Direction is derived here rather than read from Lenis, so the native
   fallback below produces an identical signal. Sub-pixel deltas are ignored:
   momentum easing emits a long tail of ~0.01px frames, and letting those set a
   direction makes the navbar flicker between hide and show at the end of every
   flick. */
let lastY = 0;

function emit(y: number): void {
  const delta = y - lastY;
  const direction: ScrollSignal['direction'] = delta > 0.5 ? 1 : delta < -0.5 ? -1 : 0;
  // Only update the reference when the move was big enough to count, or a slow
  // drift of sub-threshold frames would never accumulate into a direction.
  if (direction !== 0) lastY = y;

  window.dispatchEvent(
    new CustomEvent<ScrollSignal>('rr:scroll', { detail: { y, direction } })
  );
}

/**
 * Native-scroll signal. Runs immediately on every page (the navbar must work
 * before Lenis exists), stays permanently under `prefers-reduced-motion`, and
 * is the fallback if the Lenis chunk fails to load.
 *
 * rAF-coalesced: `scroll` can fire many times per frame, but the navbar can
 * only change once per frame, so anything beyond the first is wasted work.
 *
 * Returns its own teardown. This matters more than it looks: Lenis scrolls by
 * calling `window.scrollTo`, so the native listener keeps firing *underneath*
 * it. Two emitters sharing `lastY` means whichever fires second always sees a
 * delta of ~0 and reports `direction: 0`, and the navbar spends every frame
 * being told the page is at rest. Lenis detaches this before it takes over.
 */
function useNativeScroll(): () => void {
  let queued = false;

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      emit(window.scrollY);
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  emit(window.scrollY);

  return () => window.removeEventListener('scroll', onScroll);
}

/**
 * Boot Lenis and bridge its frames onto `rr:scroll`.
 *
 * The dynamic import is what keeps Lenis off the critical path — it becomes its
 * own chunk, requested after the preloader is gone rather than alongside the
 * hero image.
 */
/**
 * Boot Lenis and bridge its frames onto `rr:scroll`.
 *
 * Returns a teardown. THIS IS THE WHOLE BACK-BUTTON FIX, and it is worth being
 * explicit about why the obvious cheaper version does not work.
 *
 * The tempting approach is to build Lenis once and keep it across navigations,
 * nudging it back into sync after each swap. It desynchronises in a way that is
 * hard to chase: Astro restores the previous scroll offset with `window.scrollTo`
 * on a back-navigation, but Lenis holds its own `animatedScroll` and
 * `targetScroll` from the page you just left. The next wheel event animates from
 * THOSE numbers, so the page lurches from wherever the old page was to wherever
 * the new one actually is. It also measured the old document, so its scroll limit
 * is wrong until something forces a resize.
 *
 * A fresh instance per page has neither problem: it measures the document in
 * front of it and reads the current offset as its starting point, for free. The
 * library is already parsed, so the second construction costs almost nothing.
 */
async function useLenis(detachNative: () => void): Promise<Teardown | null> {
  try {
    const { default: Lenis } = await import('lenis');

    /* Only now that the library is definitely here. Detaching earlier would
       leave the navbar deaf for the length of the chunk request if it 404s. */
    detachNative();

    const lenis = new Lenis({
      /* ~1s to settle. Long enough to read as "smooth", short enough that the
         page still feels like it obeys the wheel. */
      duration: 1.05,
      /* Exponential ease-out — the standard Lenis curve. */
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      /* TOUCH IS LEFT ALONE ON PURPOSE. Mobile browsers already scroll on the
         compositor; hijacking that hands a 60fps native gesture to JavaScript
         and makes it worse on the devices least able to absorb it. */
      smoothWheel: true,
      syncTouch: false,
      /* AUTORAF STAYS ON HERE. Read the long note below before changing it.

         The GSAP layer sets this to false once it has Lenis on GSAP's ticker,
         and that handoff is safe because the ticker is already running by the
         time the flag flips. Constructing with it false is NOT safe: if the
         gsap chunk 404s, or the page has no [data-gsap] markup and the layer
         deliberately never loads, nothing would ever call raf() and the page
         would swallow every wheel event while sitting at scrollY 0.

         That exact failure shipped here once, from a hand-rolled loop that
         parked itself when idle and deadlocked against Lenis's own input
         handling. It is invisible in code review and invisible in a
         screenshot — the page looks perfect, it just cannot move. */
      autoRaf: true,
    });

    const onScroll = ({ scroll }: { scroll: number }) => emit(scroll);
    lenis.on('scroll', onScroll);

    /* Anchor links and "Skip to content" still have to work. Lenis owns the
       scroll position now, so handing these to it keeps them smooth and keeps
       its internal target in sync — a raw `scrollIntoView` would teleport the
       page out from under it.

       NAMED, NOT INLINE. This is a `document` listener, so it outlives the DOM
       it was registered against. Left unremoved it would accumulate one copy
       per navigation, each closing over a destroyed Lenis instance, and every
       anchor click would fire all of them. */
    const onAnchorClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute('href');
      if (!id || id === '#') return;

      const target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -100 });
    };
    document.addEventListener('click', onAnchorClick);

    /* Exposed for the GSAP layer, which reads it synchronously when it boots
       after Lenis, and for any future island that needs to stop the page. */
    (window as unknown as { __rrLenis?: unknown }).__rrLenis = lenis;

    /* Hand the instance to the GSAP layer. The flag stays TRUE until that
       layer has the ticker running — see the autoRaf note above. */
    window.dispatchEvent(
      new CustomEvent('rr:lenis-ready', { detail: { lenis } })
    );

    emit(window.scrollY);

    return () => {
      document.removeEventListener('click', onAnchorClick);
      lenis.off('scroll', onScroll);
      lenis.destroy();
      delete (window as unknown as { __rrLenis?: unknown }).__rrLenis;
    };
  } catch {
    /* Chunk failed to load. The page still scrolls natively — only the easing
       is lost — and `detachNative` was never reached, so the fallback signal is
       still attached and the navbar is unaffected. */
    return null;
  }
}

/**
 * Entry point. Called once from BaseLayout; the registry re-runs it per page.
 *
 * WAITING FOR THE PRELOADER, BUT ONLY ONCE. The title card holds
 * `html.rr-loading { overflow: hidden }` for 3s on the first page of a session.
 * Lenis measures the document on construction, and measuring a page locked at
 * zero height gives it the wrong limit — so on that first page it waits.
 *
 * On every page after it, `rr:preloader-done` will never fire again (the card is
 * once per session). Waiting for it there would leave the site permanently
 * unscrollable from the second page onward, which is exactly the class of bug
 * that survives a code review.
 */
export function initSmoothScroll(): void {
  register('smooth-scroll', () => {
    if (window.matchMedia(REDUCED).matches) {
      /* No easing under reduced motion — but the navbar still needs to know
         where the page is, so the native signal runs in Lenis's place. */
      return useNativeScroll();
    }

    /* Reset between pages. `lastY` is module state and survives the swap; left
       alone, the first emit on a new page would compute its delta against the
       old page's offset and hand the navbar a direction it never travelled.

       TWICE, BECAUSE OF SCROLL RESTORATION. On a back-navigation the router
       restores the previous offset with window.scrollTo, and whether that lands
       before or after astro:page-load is not something to bet the navbar on. If
       it lands after, this first assignment reads 0 while the page is about to
       jump to 2000px, and the navbar gets one bogus "scrolling down" and hides
       itself on arrival. The rAF re-sync runs after the browser has settled the
       position either way. */
    lastY = window.scrollY;
    requestAnimationFrame(() => {
      lastY = window.scrollY;
    });

    /* The navbar has to respond from the first frame, even while the overlay is
       still up. Lenis hands this teardown back once it is ready to take over. */
    const detachNative = useNativeScroll();

    let lenisTeardown: Teardown | null = null;
    let cancelled = false;

    const boot = () => {
      void useLenis(detachNative).then((teardown) => {
        /* The visitor may have navigated away during the dynamic import. If so
           this page is already torn down and the instance we just built has no
           document — drop it immediately rather than leaking it. */
        if (cancelled) {
          teardown?.();
          return;
        }
        lenisTeardown = teardown;
      });
    };

    const waitingOnPreloader = isFirstBoot() && document.getElementById('rr-preloader');

    if (waitingOnPreloader) {
      window.addEventListener('rr:preloader-done', boot, { once: true });
    } else {
      boot();
    }

    return () => {
      cancelled = true;
      window.removeEventListener('rr:preloader-done', boot);
      lenisTeardown?.();
      detachNative();
    };
  });
}
