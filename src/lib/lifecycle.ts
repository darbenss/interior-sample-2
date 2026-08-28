/* ---------------------------------------------------------------------------
 * The lifecycle registry.
 *
 * WHY THIS EXISTS AT ALL
 * Before view transitions, every script on this site could assume it ran once,
 * against a document that would never be replaced under it. `ClientRouter`
 * breaks that assumption in a specific and quiet way: the DOM is swapped, but
 * the JavaScript module graph is not. A module script is evaluated ONCE per
 * session no matter how many times you navigate back to the page that declares
 * it — so an initialiser that ran at module scope simply never runs again, and
 * whatever it built is left pointing at elements that no longer exist.
 *
 * The mirror-image failure is worse because it accumulates. Listeners bound to
 * ELEMENTS die with the swapped DOM and clean themselves up. Listeners bound to
 * `window` or `document` do not. Every navigation adds another anchor-click
 * handler, another `rr:scroll` subscriber, another GSAP ticker callback driving
 * a Lenis instance whose document was thrown away three pages ago. Nothing
 * visibly breaks on navigation two. By navigation twenty the page is doing
 * twenty times the per-frame work and the "smooth" scroll is a slideshow.
 *
 * So: one registry, one teardown per initialiser, driven by Astro's own events.
 * Anything that touches the DOM or subscribes to a global registers here rather
 * than running at module scope.
 *
 * THE CONTRACT
 *   register('name', () => {  ...set up...;  return () => { ...tear down... } })
 *
 * The teardown must undo EVERYTHING the init did to anything that outlives the
 * document: window/document listeners, ticker callbacks, observers, library
 * instances. It does not need to touch the elements themselves — those are
 * about to be replaced wholesale.
 * ------------------------------------------------------------------------- */

export type Teardown = () => void;
type Init = () => Teardown | void;

/* Keyed by name so a module that somehow registers twice replaces its own
   entry instead of installing two copies of itself. */
const inits = new Map<string, Init>();
const teardowns: Teardown[] = [];

/** Is the CURRENT document booted? Drives late registration, below. */
let live = false;
let wired = false;
let pagesBooted = 0;

function bootOne(init: Init): void {
  try {
    const teardown = init();
    if (teardown) teardowns.push(teardown);
  } catch (error) {
    /* One broken initialiser must not prevent the rest of the page from
       booting — least of all the smooth scroll. */
    console.error('[lifecycle] init failed', error);
  }
}

function bootAll(): void {
  live = true;
  for (const init of inits.values()) bootOne(init);
}

function tearAll(): void {
  live = false;
  /* Reverse order: later initialisers may depend on earlier ones (the GSAP
     layer attaches to the Lenis instance), so they have to let go first. */
  while (teardowns.length) {
    const teardown = teardowns.pop()!;
    try {
      teardown();
    } catch (error) {
      console.error('[lifecycle] teardown failed', error);
    }
  }
}

function wire(): void {
  if (wired) return;
  wired = true;

  /* Fires on the initial load AND after every client-side navigation, once the
     new document is in place. Tearing down first covers the case where a swap
     happened without `astro:before-swap` reaching us. */
  document.addEventListener('astro:page-load', () => {
    tearAll();
    bootAll();
    pagesBooted += 1;
  });

  document.addEventListener('astro:before-swap', tearAll);

  /* FALLBACK FOR A BUILD WITHOUT ClientRouter. `astro:page-load` only exists
     when the router is mounted; if it is ever removed, every script on the site
     would silently stop running. `load` always fires and always fires after
     `astro:page-load`, so when the router IS present this sees `live === true`
     and does nothing. */
  window.addEventListener('load', () => {
    if (!live) {
      bootAll();
      pagesBooted += 1;
    }
  });
}

/**
 * Register an initialiser. Safe to call at module scope — that is the point.
 *
 * @param name  Stable identifier, used only to make double-registration a
 *              replacement rather than a duplicate.
 * @param init  Runs on every page. MUST be a no-op when the elements it targets
 *              are absent, because module scripts declared by one page keep
 *              running on every other page for the rest of the session.
 */
export function register(name: string, init: Init): void {
  inits.set(name, init);
  wire();

  /* LATE REGISTRATION. A script declared by /portfolio is only evaluated the
     first time the visitor lands there — which is AFTER that page's
     `astro:page-load` has already fired. Without this, the filter would be dead
     on the first visit and only start working on the second. */
  if (live) bootOne(init);
}

/**
 * How many pages this session has booted. Exposed as `isFirstBoot` because
 * that is the only question anyone asks of it.
 *
 * The preloader runs exactly once per session, so the things that wait for it
 * (Lenis, the GSAP layer) must wait ONLY on the first page. On every subsequent
 * navigation `rr:preloader-done` will never fire again, and anything still
 * listening for it would wait forever — which, for the module that owns the
 * scroll, means a page that never becomes scrollable.
 */
export function isFirstBoot(): boolean {
  return pagesBooted === 0;
}
