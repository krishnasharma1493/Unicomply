import { useReducedMotion, type Transition } from 'motion/react';

/**
 * The house motion (docs/design/DIRECTION.md, Motion). Critically damped springs: no overshoot,
 * because nothing in this app is thrown. Springs start from the on-screen value, so any of these
 * can be interrupted mid-flight.
 */
export const SPRING: Transition = { type: 'spring', bounce: 0, duration: 0.35 };
export const SPRING_QUICK: Transition = { type: 'spring', bounce: 0, duration: 0.24 };
/** The reduced-motion stand-in: a short cross-fade, no movement. */
export const FADE: Transition = { duration: 0.15, ease: 'easeOut' };

/** Movement when allowed, a cross-fade when the user asked for less motion. */
export function useMotionPrefs() {
  const reduce = Boolean(useReducedMotion());
  return {
    reduce,
    spring: reduce ? FADE : SPRING,
    quick: reduce ? FADE : SPRING_QUICK,
    /** `initial` for something arriving: a little rise, or only opacity. */
    enter: (y = 6) => (reduce ? { opacity: 0 } : { opacity: 0, y }),
  };
}
