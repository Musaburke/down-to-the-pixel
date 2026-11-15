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
// Pinned travel, in vh: the opening and the approved shots keep their 250, then 150 each for the cable and the processor.
// Everything above runs over the first SPAN, so the approved shots keep exactly their scroll distance; `pre(p)`
// reads progress in those units.
const TRAVEL = { approved: 250, cable: 150, cpu: 150, gfx: 150 };
const TOTAL = TRAVEL.approved + TRAVEL.cable + TRAVEL.cpu + TRAVEL.gfx;
export const SPAN = TRAVEL.approved / TOTAL;
export const CABLE_END = (TRAVEL.approved + TRAVEL.cable) / TOTAL;
export const CPU_END = (TRAVEL.approved + TRAVEL.cable + TRAVEL.cpu) / TOTAL;
export const pre = (p: number): number => Math.min(1, p / SPAN);
const after = (t: number): number => SPAN + t * (CABLE_END - SPAN); // 0..1 across the cable's share of the travel
export const inCpu = (t: number): number => CABLE_END + t * (CPU_END - CABLE_END); // 0..1 across the processor's share
export const inGfx = (t: number): number => CPU_END + t * (1 - CPU_END);       // 0..1 across the graphics share
export const CABLE_SHOTS: Shot[] = [ // the lead falls straight down, so the camera travels down with the scroll
  { id: 'drop',  t: after(0.16), pos: [3.0, -2.0, 9.0],  target: [0.3, -4.2, 0],  fov: 28, roll: 0, ease: 'inOut'  }, // follows the bead out of the switch onto the lead
  { id: 'run',   t: after(0.36), pos: [2.2, -6.6, 5.0],  target: [0.2, -8.6, 0],  fov: 30, roll: 0, ease: 'inOut'  }, // down the braid
  { id: 'strip', t: after(0.56), pos: [1.7, -10.3, 3.7], target: [0.15, -11.6, 0], fov: 30, roll: 0, ease: 'inOut'  }, // the stepped cut: braid, jacket, foil
  { id: 'wires', t: after(0.76), pos: [1.7, -14.5, 3.7], target: [0.15, -15.8, 0], fov: 30, roll: 0, ease: 'inOut'  }, // the twisted pair carrying the bits
  { id: 'plug',  t: after(1),    pos: [2.4, -22.4, 5.8], target: [0.3, -25.4, 0], fov: 30, roll: 0, ease: 'linear' }, // into the plug
];
// Stop 4: down into the socket, along the tracks over the board, round to the processor as its lid lifts, then down onto the die.
export const CPU_SHOTS: Shot[] = [
  { id: 'socket', t: inCpu(0.2),  pos: [2.2, -24.3, 4.4],  target: [0.8, -27.05, -0.9], fov: 32, roll: 0, ease: 'inOut'  }, // the plug in its socket, the tracks leaving it
  { id: 'tracks', t: inCpu(0.44), pos: [2.0, -22.4, 3.0],  target: [4.8, -27.05, -3.6], fov: 34, roll: 0, ease: 'inOut'  }, // higher, looking along the tracks to the chip, the plug still at the edge of frame
  { id: 'over',   t: inCpu(0.7),  pos: [5.0, -22.4, -0.4], target: [9.4, -26.9, -7.4],  fov: 32, roll: 0, ease: 'inOut'  }, // a three-quarter view of the package, so the lid's lift reads
  { id: 'die',    t: inCpu(1),    pos: [7.4, -22.4, -3.0], target: [9.2, -27.0, -7.1],  fov: 30, roll: 0, ease: 'inOut'  }, // in over the die as it lights, still at an angle so its edge and sheen show
];
export const CPU_PARTS: Record<string, [number, number]> = {
  tracks: [inCpu(0.08), inCpu(0.62)], // the bead runs the tracks to the package
  lid:    [inCpu(0.5), inCpu(0.8)],   // the lid lifts and slides off
  into:   [inCpu(0.62), inCpu(0.8)],  // the bead crosses onto the die
  wave:   [inCpu(0.74), inCpu(1)],    // the die lights from where it came in
  notes:  [inCpu(0.44), inCpu(0.52)], // labels arrive over the package, the lid's just as it starts to lift
};
// Stop 5: down into the lit die, through its light, and into the dark below where the letter is drawn: its outline from
// the font, a grid of pixels over it, then the pixels it covers. The drawing lies flat at y -48, under the processor.
export const GFX_SHOTS: Shot[] = [
  { id: 'dive',    t: inGfx(0.16), pos: [9.0, -25.7, -6.4], target: [9.0, -27.0, -7.05], fov: 30, roll: 0, ease: 'inOut'  }, // close over the die, its light filling the frame
  { id: 'through', t: inGfx(0.3),  pos: [9.0, -29.5, -6.2], target: [9.0, -48, -7.45],   fov: 34, roll: 0, ease: 'inOut'  }, // through it, looking down into the dark
  { id: 'outline', t: inGfx(0.46), pos: [9.0, -37.4, -5.4], target: [9.0, -48, -7.6],    fov: 32, roll: 0, ease: 'inOut'  }, // over the letter as its outline is drawn
  { id: 'grid',    t: inGfx(0.72), pos: [8.7, -38.6, -5.1], target: [9.0, -48, -7.55],   fov: 32, roll: 0, ease: 'inOut'  }, // creeping in as the grid and pixels arrive
  { id: 'pixels',  t: 1,           pos: [9.1, -41.0, 0.6],  target: [9.1, -48, -7.35],   fov: 32, roll: 0, ease: 'linear' }, // tipping back, letter still upright, so the pixels stand up
];
export const GFX_PARTS: Record<string, [number, number]> = {
  flash:  [inGfx(0.15), inGfx(0.28)], // the die's light floods the frame as the camera passes through it
  draw:   [inGfx(0.3), inGfx(0.58)],  // the outline is traced, point to point
  grid:   [inGfx(0.5), inGfx(0.62)],  // the grid of pixels fades in over it
  fill:   [inGfx(0.6), inGfx(0.9)],   // the covered pixels rise and light, edges only partly
  notes:  [inGfx(0.36), inGfx(0.44)], // labels arrive
};
// Cable parts, in full progress p.
export const CABLE_PARTS: Record<string, [number, number]> = {
  beadDrop: [after(0.02), after(0.2)], // bead leaves the contacts and falls onto the lead
  ride:     [after(0.16), after(1)],   // bits run along the data pair
  notes:    [after(0.45), after(0.55)], // engraved labels arrive as the stripped section comes into view
};
export const RIG: Shot[] = [...[...ROOM_SHOTS, ...SHOTS.map((s): Shot => ({ ...s, t: at(s.t), ease: s.id === 'hero' ? 'out' : s.ease }))].map((s): Shot => ({ ...s, t: s.t * SPAN })), ...CABLE_SHOTS, ...CPU_SHOTS, ...GFX_SHOTS];
export const TEXT_RIG: [string, number][] = [...TEXT.map(([id, t], i): [string, number] => [id, i ? at(t) * SPAN : 0]), ['cable', after(0.22)], ['cpu', inCpu(0.28)], ['gfx', inGfx(0.22)]];
