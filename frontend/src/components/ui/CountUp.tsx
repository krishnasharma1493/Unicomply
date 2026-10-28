import React, { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

const format = new Intl.NumberFormat('en-IN');

/**
 * A number that counts to its value: on first show from zero, afterwards from where it was, so a
 * change (a case resolved, a queue shrinking) is seen happening. The DOM text is always the real value
 * (for assistive tech and search); only the painted digits move. Under reduced motion it simply shows the value.
 */
export const CountUp: React.FC<{ value: number; className?: string; duration?: number }> = ({ value, className, duration = 0.7 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  // The value currently painted: a new animation (or a re-run effect) continues from what is on screen.
  const shown = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.dataset.v = format.format(value);
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.dataset.v = format.format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce, duration]);

  return (
    <span className={['uc-num', className].filter(Boolean).join(' ')}>
      {/* Painted digits come from a data attribute (CSS content), so the DOM text holds the value once. */}
      <span ref={ref} className="uc-countup" aria-hidden="true" data-v={format.format(reduce ? value : 0)} />
      <span className="uc-sr">{format.format(value)}</span>
    </span>
  );
};

export default CountUp;
