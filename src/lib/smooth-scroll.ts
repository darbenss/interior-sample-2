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
async function useLenis(detachNative: () => void): Promise<void> {
  try {
    const { default: Lenis } = await import('lenis');

    /* Only now that the library is definitely here. Detaching earlier would
       leave the navbar deaf for the length of the chunk request if it 404s. */
    detachNative();

    const lenis = new Lenis({
      /* ~1s to settle. Long enough to read as "smooth", short enough that the
         page still feels like it obeys the wheel. */
      duration: 1.05,
      /* Exponential ease-out — the standard Lenis curve. Matches the shape of
         `--ease-intent` (the cubic-bezier every transition on this site uses),
         so scrolling and the reveal animations feel like one system. */
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      /* TOUCH IS LEFT ALONE ON PURPOSE. Mobile browsers already scroll on the
         compositor; hijacking that hands a 60fps native gesture to JavaScript
         and makes it worse on the devices least able to absorb it. Lenis
         smooths wheel input only. */
      smoothWheel: true,
      syncTouch: false,
      /* AUTORAF STAYS ON. Read this before trying to "optimise" it.

         The obvious saving is to drive the loop yourself and park it whenever
         `lenis.isScrolling` is false, so an idle page costs no frames. That
         version shipped here and made the site COMPLETELY UNSCROLLABLE by
         mouse wheel, because the loop and the input deadlock each other:

           wheel arrives -> Lenis sets a new target and preventDefaults the
           event, so the browser does not scroll natively -> animating to that
           target requires raf() -> raf() is only called while the loop runs ->
           the loop is restarted from the 'scroll' callback -> 'scroll' only
           fires once raf() has moved the page.

         Nothing ever breaks the cycle. The page swallows every wheel event and
         sits at scrollY 0. It is invisible in code review and invisible in a
         screenshot — the page looks perfect, it just cannot move.

         Waking the loop from 'wheel' would patch that one path, but scrollTo,
         scrollbar drags and keyboard paging all need the same treatment, and
         each missed path is another way to hang the page. Lenis's own loop is
         one rAF whose body is a no-op when there is nothing to animate; that is
         a fair price for a scroll that cannot lock up. */
      autoRaf: true,
    });

    lenis.on('scroll', ({ scroll }: { scroll: number }) => emit(scroll));

    /* Anchor links and the "Skip to content" link still have to work. Lenis
       owns the scroll position now, so handing these to it keeps them smooth
       and keeps Lenis's internal target in sync — a raw `scrollIntoView` would
       teleport the page out from under it. */
    document.addEventListener('click', (event) => {
      const link = (event.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute('href');
      if (!id || id === '#') return;

      const target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -100 });
    });

    /* Expose for debugging and for any future island that needs to stop the
       page (a modal, a lightbox). Nothing in the site reads this today. */
    (window as unknown as { __rrLenis?: unknown }).__rrLenis = lenis;

    emit(window.scrollY);
  } catch {
    /* Chunk failed to load. The page still scrolls natively — only the easing
       is lost — and `detachNative` was never reached, so the fallback signal
       is still attached and the navbar is unaffected. */
  }
}

/**
 * Entry point. Called from BaseLayout.
 *
 * Waits for the preloader before constructing Lenis. Two reasons, and the
 * second is the one that actually bites:
 *   1. The title card holds `html.rr-loading { overflow: hidden }` for 3s.
 *      Lenis measures the document on construction; measuring a page that is
 *      locked at zero height gives it the wrong limit.
 *   2. Building it during the draw puts library parse + execute on the thread
 *      the preloader is painting on.
 */
export function initSmoothScroll(): void {
  if (window.matchMedia(REDUCED).matches) {
    /* No easing under reduced motion — but the navbar still needs to know
       where the page is, so the native signal runs in Lenis's place. */
    useNativeScroll();
    return;
  }

  /* The navbar has to respond from the first frame, even while the overlay is
     still up (a visitor can scroll behind it the moment the lock releases).
     Lenis hands this teardown back once it is ready to take over. */
  const detachNative = useNativeScroll();

  if (document.getElementById('rr-preloader')) {
    window.addEventListener('rr:preloader-done', () => void useLenis(detachNative), {
      once: true,
    });
  } else {
    void useLenis(detachNative);
  }
}
