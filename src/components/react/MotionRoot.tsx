import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/* ---------------------------------------------------------------------------
 * Framer Motion, but only the parts we use.
 *
 * Importing `motion` pulls Framer's entire feature set — drag, layout
 * projection, scroll, SVG path morphing — into the bundle whether or not a
 * component touches any of it. On this site the animation budget is a hover
 * wipe and a headline reveal, and that full bundle measured 40 KB gzipped.
 *
 * `LazyMotion` + the `m` component invert that: `m` ships the renderer with no
 * features attached, and `domAnimation` adds back exactly animations, variants
 * and the hover/tap/focus gestures. Drag and layout projection never load.
 *
 * `strict` makes the saving enforceable rather than aspirational — importing
 * `motion` anywhere downstream now throws at runtime instead of quietly
 * re-adding the weight the next time someone reaches for the familiar API.
 * ------------------------------------------------------------------------- */

export default function MotionRoot({ children }: { children: ReactNode }) {
  // Renders no DOM element of its own — pure context, so layout is untouched.
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
