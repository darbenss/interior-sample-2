/* ---------------------------------------------------------------------------
 * Scroll reveal.
 *
 * Moved out of an inline <script> in BaseLayout so it can hold a teardown. The
 * behaviour is unchanged; what is new is that it un-arms itself before the
 * document is swapped.
 *
 * DELIBERATELY ADDITIVE, AND THAT MATTERS MORE UNDER VIEW TRANSITIONS, NOT LESS.
 * Elements render SETTLED in the HTML and are only *armed* (hidden) by this
 * script once we know the browser can un-hide them. A crawler, a reader-mode
 * parser, or a visitor whose bundle failed sees finished content rather than an
 * empty page. Never move `reveal-armed` into the markup.
 *
 * THE FAILURE THIS PREVENTS. `is-visible` is added to elements and left there.
 * With a client-side router the observer would otherwise keep running against
 * the old page's elements while the new page's elements sit armed and hidden,
 * observed by nobody — a blank page below the fold, on the second navigation
 * only, which is exactly the kind of thing that survives a manual test of the
 * homepage.
 * ------------------------------------------------------------------------- */

import { register, type Teardown } from './lifecycle';

const REDUCED = '(prefers-reduced-motion: reduce)';

export function initReveal(): void {
  register('reveal', (): Teardown | void => {
    if (window.matchMedia(REDUCED).matches) return;
    if (!('IntersectionObserver' in window)) return;

    const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!targets.length) return;

    targets.forEach((el) => el.classList.add('reveal-armed'));

    /* Tracked so the teardown can cancel any stagger still in flight. A swap
       that lands mid-stagger would otherwise fire `is-visible` onto elements
       that have already been removed from the document. */
    const pending = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        /* Elements that cross in the same frame AND share a parent are revealed
           one after another rather than as a block, so a group (a heading and
           its paragraph, the services panels) reads as a sequence. An explicit
           data-reveal-delay still wins outright; the 90ms auto-step only fills
           in where none was set. Grouping by parent keeps the stagger local —
           two unrelated elements that happen to enter together are not
           chained. */
        const groups = new Map<Element, HTMLElement[]>();
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const parent = el.parentElement ?? document.body;
          const bucket = groups.get(parent) ?? [];
          bucket.push(el);
          groups.set(parent, bucket);
        }

        for (const members of groups.values()) {
          members.sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
          );
          members.forEach((el, i) => {
            const explicit = el.dataset.revealDelay;
            const delay = explicit ? Number(explicit) : i * 90;
            const timer = window.setTimeout(() => {
              pending.delete(timer);
              el.classList.add('is-visible');
            }, delay);
            pending.add(timer);
            observer.unobserve(el);
          });
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );

    targets.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  });
}
