/* Small number helpers shared by the rig and the parts. No imports from Three. */
import { PARTS, type Ease } from './timeline.ts';

export const E: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
/** Where p sits between a and b, clamped to 0..1. */
export const seg = (p: number, a: number, b: number): number => clamp((p - a) / (b - a));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Eased progress through one part window from PARTS. */
export const part = (p: number, k: string, ease: Ease = 'inOut'): number => {
  const w = PARTS[k];
  if (!w) throw new Error(`Unknown part: ${k}`);
  return E[ease](seg(p, w[0], w[1]));
};
