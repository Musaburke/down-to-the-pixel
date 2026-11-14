/* Pure data for the walkthrough's camera and parts. No imports, so the sample page and the site share it.
   Shot: { id, t, pos, target, fov, roll (degrees), ease }. Progress runs 0..1 over the pinned travel.
   Since v3.3 the camera reads one monotone cubic through every shot's t, so `ease` is kept only as a note. */
export type Ease = 'linear' | 'in' | 'out' | 'inOut';
export type Vec3 = [number, number, number];
export interface Shot { id: string; t: number; pos: Vec3; target: Vec3; fov: number; roll: number; ease: Ease }
export const SHOTS: Shot[] = [
  { id: 'hero',         t: 0.00, pos: [5.6, 6.6, 7.4],   target: [0, 0.55, 0], fov: 38, roll: 0,  ease: 'linear' }, // high angle, wide
  { id: 'hero-hold',    t: 0.08, pos: [5.3, 6.2, 7.1],   target: [0, 0.55, 0], fov: 38, roll: 0,  ease: 'linear' }, // hero dwell, slow creep
  { id: 'key',          t: 0.32, pos: [3.1, 2.9, 3.8],   target: [0, 1.4, 0],  fov: 34, roll: 0,  ease: 'inOut'  }, // macro over the spacebar (v3: raised from y 1.55, a full board hides the side face)
  { id: 'key-hold',     t: 0.44, pos: [2.9, 2.8, 3.55],  target: [0, 1.35, 0], fov: 34, roll: 0,  ease: 'inOut'  }, // macro dwell, creep in (v3: raised with the macro)
  { id: 'swing',        t: 0.62, pos: [4.2, 0.9, 8.6],   target: [0, 0.9, 0],  fov: 28, roll: -4, ease: 'in'     }, // swinging down to the side, rolled
  { id: 'section',      t: 0.80, pos: [0, 0.85, 19.6],   target: [0, 0.85, 0], fov: 20, roll: 0,  ease: 'out'    }, // side-on cross-section, narrow lens
  { id: 'section-hold', t: 1.00, pos: [0, 0.85, 18.8],   target: [0, 0.82, 0], fov: 20, roll: 0,  ease: 'linear' }, // dwell on the closed switch
];
// Part windows [a, b] in progress p. Each starts before the previous move ends (about 25% overlap).
export const PARTS: Record<string, [number, number]> = {
  capPress:   [0.10, 0.36], // cap sinks while the camera pushes in
  deskAway:   [0.46, 0.62], // plate and ground fall away as the swing starts
  explode:    [0.46, 0.74], // housing halves split during the swing
  beadToStem: [0.50, 0.64], // bead leaves the cap for the stem
  spring:     [0.62, 0.82], // stem rides down, spring compresses
  beadToA:    [0.76, 0.85], // bead rides off the stem onto the first contact
  contacts:   [0.80, 0.89], // contacts slide together and close
  beadJump:   [0.87, 0.94], // bead jumps the gap
};
export const TEXT: [string, number][] = [['hero', 0], ['key', 0.17], ['switch', 0.60]]; // which group the panel shows from p onward
// v3.2: the desk opening runs first, over P0 of the pinned travel. Everything above runs after it, unchanged,
// and every part window keeps reading v2's progress through old(p).
export const P0 = 0.2;
export const old = (p: number): number => Math.min(1, Math.max(0, (p - P0) / (1 - P0)));
export const at = (t: number): number => P0 + t * (1 - P0);
export const ROOM_SHOTS: Shot[] = [
  { id: 'desk',      t: 0.00, pos: [44, 25, 54], target: [5, -1, -4],   fov: 30, roll: 0, ease: 'linear' }, // the whole board on the desk, low three-quarter
  { id: 'desk-hold', t: 0.06, pos: [41, 24, 50], target: [5, -1, -4],   fov: 30, roll: 0, ease: 'linear' }, // dwell, slow creep
  { id: 'desk-in',   t: 0.13, pos: [17, 13, 21], target: [2, 0.2, -1.5], fov: 34, roll: 0, ease: 'inOut'  }, // closing on the M, on the line into the hero
];
export const RIG: Shot[] = [...ROOM_SHOTS, ...SHOTS.map((s): Shot => ({ ...s, t: at(s.t), ease: s.id === 'hero' ? 'out' : s.ease }))];
export const TEXT_RIG: [string, number][] = TEXT.map(([id, t], i) => [id, i ? at(t) : 0]);
