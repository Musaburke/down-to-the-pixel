/* One monotone cubic (PCHIP, Fritsch-Carlson weights) through every shot's t. It maps scroll progress to a
   place along the camera curves, so the camera's speed never jumps at a shot: it flows through each one
   instead of easing in and out of it. Pure maths, no Three, so it can be tested on its own. */
import { clamp, seg } from './seg.ts';

export interface Flow {
  /** Index of the segment p falls in (shot i to shot i + 1). */
  segment: (p: number) => number;
  /** Place along the curves, 0..1 (shot k sits at k / (n - 1)). */
  at: (p: number) => number;
}

export function makeFlow(knots: number[]): Flow {
  const n1 = knots.length - 1;
  if (n1 < 1) throw new Error('makeFlow needs at least two knots');
  const h = (j: number) => knots[j + 1]! - knots[j]!;
  const d = (j: number) => 1 / h(j);
  const slope = knots.map((_, k) => {
    if (k === 0) return d(0);
    if (k === n1) return d(n1 - 1);
    const w1 = 2 * h(k) + h(k - 1), w2 = h(k) + 2 * h(k - 1);
    return (w1 + w2) / (w1 / d(k - 1) + w2 / d(k));
  });
  const segment = (p: number) => {
    let i = 0;
    while (i < n1 - 1 && p >= knots[i + 1]!) i++;
    return i;
  };
  const at = (p: number) => {
    const i = segment(p), hi = h(i), x = seg(p, knots[i]!, knots[i + 1]!), x2 = x * x, x3 = x2 * x;
    const v = (2 * x3 - 3 * x2 + 1) * i + (x3 - 2 * x2 + x) * hi * slope[i]!
      + (-2 * x3 + 3 * x2) * (i + 1) + (x3 - x2) * hi * slope[i + 1]!;
    return clamp(v / n1);
  };
  return { segment, at };
}
