/* Stop 4, the processor. The plug goes into a socket on the computer's main board; the data pair carries on as two
   copper tracks across the board to the processor. Its metal lid lifts away and the silicon underneath lights up,
   block by block, from where the message arrives. One unit is about 10 mm. Board, package and die are drawn once into
   canvases; the small parts on the board are instanced. */
import * as THREE from 'three';
import { roundBox } from '../geometry.ts';

export const BOARD_Y = -27.05;
export const CHIP = new THREE.Vector3(9, BOARD_Y, -7); // centre of the processor package, on the board
const BOARD = { x0: -6, z0: -21, size: 30 };          // the board's square, in world x and z

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const canvas = (n: number) => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); if (!g) throw new Error('2D canvas unavailable'); return [c, g] as const; };
const tex = (cv: HTMLCanvasElement, srgb = false) => { const t = new THREE.CanvasTexture(cv); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

// The data pair's route across the board, centre line, in world x and z: down from the socket, a 45° turn, across, into the package's edge.
const ROUTE: [number, number][] = [[0.2, -0.45], [0.2, -1.8], [1.4, -3.0], [4.6, -3.0], [6.0, -4.4], [6.0, -6.4], [6.6, -7.0], [6.85, -7.0]];

/** Offset a polyline sideways (mitred corners), for the two tracks of the pair. */
const offset = (pts: [number, number][], d: number): [number, number][] => pts.map(([x, z], i) => {
  const n1 = i > 0 ? norm(pts[i - 1]!, pts[i]!) : norm(pts[0]!, pts[1]!), n2 = i < pts.length - 1 ? norm(pts[i]!, pts[i + 1]!) : n1;
  const mx = n1[0] + n2[0], mz = n1[1] + n2[1], ml = Math.hypot(mx, mz) || 1, k = d / Math.max(0.5, (mx * n1[0] + mz * n1[1]) / ml);
  return [x + mx / ml * k, z + mz / ml * k];
});
function norm(a: [number, number], b: [number, number]): [number, number] { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; }
const toRoute = (x: number, z: number) => { let best = 1e9; for (let i = 0; i < ROUTE.length - 1; i++) { const [ax, az] = ROUTE[i]!, [bx, bz] = ROUTE[i + 1]!, dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };

/** A part on the board: centre, footprint (w along its axis, d across), height, which way it turns, what it is. */
interface Part { x: number; z: number; w: number; d: number; h: number; rot: number; kind: 'cap' | 'res' | 'chip' | 'coil' | 'can'; ref: string }

/** Where the small parts go: decoupling round the socket, a power stage and rows of capacitors round the processor,
    two support chips with their own passives, and a scatter along the buses. */
function layout(): Part[] {
  const parts: Part[] = [], r = mulberry(31), n = { C: 0, R: 0, L: 0, U: 0 };
  const ref = (k: Part['kind']) => { const L = k === 'cap' || k === 'can' ? 'C' : k === 'res' ? 'R' : k === 'coil' ? 'L' : 'U'; return L + (++n[L]); };
  const free = (x: number, z: number, rad: number) => toRoute(x, z) > rad + 0.14 && parts.every((p) => Math.hypot(p.x - x, p.z - z) > rad + Math.max(p.w, p.d) * 0.5 + 0.05);
  const add = (x: number, z: number, kind: Part['kind'], rot = 0, force = false) => {
    const [w, d, h] = kind === 'cap' ? [0.16, 0.08, 0.08] : kind === 'res' ? [0.16, 0.08, 0.045] : kind === 'coil' ? [0.6, 0.55, 0.42] : kind === 'can' ? [0.42, 0.42, 0.46] : [0.5, 0.5, 0.08];
    if (!force && !free(x, z, Math.max(w, d) * 0.5)) return;
    parts.push({ x, z, w, d, h, rot, kind, ref: ref(kind) });
  };
  // round the socket: decoupling either side of the pair, a small protection chip
  for (const [x, z] of [[-0.62, -0.75], [-0.62, -1.05], [1.0, -0.75], [1.0, -1.05], [1.0, -1.35]] as const) add(x, z, 'cap', Math.PI / 2, true);
  parts.push({ x: -0.75, z: -1.75, w: 0.32, d: 0.32, h: 0.07, rot: 0, kind: 'chip', ref: ref('chip') });
  // the processor's power stage, behind it: coils, a row of switching chips, polymer capacitors
  for (let i = 0; i < 5; i++) { add(CHIP.x - 2.4 + i * 1.2, CHIP.z - 4.0, 'coil', 0, true); parts.push({ x: CHIP.x - 2.4 + i * 1.2, z: CHIP.z - 3.15, w: 0.42, d: 0.36, h: 0.07, rot: 0, kind: 'chip', ref: ref('chip') }); }
  for (let i = 0; i < 4; i++) add(CHIP.x - 1.8 + i * 1.2, CHIP.z - 5.0, 'can', 0, true);
  // rows of capacitors in front of and beside the package
  for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++) add(CHIP.x - 1.55 + i * 0.28, CHIP.z + 2.75 + row * 0.2, i % 5 === 4 ? 'res' : 'cap', Math.PI / 2, true);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) add(CHIP.x + 2.75 + row * 0.2, CHIP.z - 1.3 + i * 0.28, 'cap', 0, true);
  // two support chips, each with a ring of passives
  for (const [x, z, s] of [[2.6, -6.2, 0.9], [13.6, -2.2, 0.75]] as const) {
    parts.push({ x, z, w: s, d: s, h: 0.09, rot: 0, kind: 'chip', ref: ref('chip') });
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3; add(x + Math.cos(a) * (s * 0.5 + 0.32), z + Math.sin(a) * (s * 0.5 + 0.32), i % 3 ? 'cap' : 'res', a + Math.PI / 2); }
  }
  // a scatter along the buses, mostly in short rows the way they are placed on a real board
  for (let k = 0; k < 90; k++) {
    const x = -4 + r() * 22, z = -15 + r() * 18; if (Math.abs(x - CHIP.x) < 3.1 && Math.abs(z - CHIP.z) < 3.1) continue;
    const rot = r() < 0.5 ? 0 : Math.PI / 2, run = 1 + Math.floor(r() * 4), kind = r() < 0.65 ? 'cap' : 'res';
    for (let j = 0; j < run; j++) add(x + (rot ? j * 0.24 : 0), z + (rot ? 0 : j * 0.24), kind, rot);
  }
  return parts;
}

/** The board: satin coffee-black solder mask, copper tracks under it, tinned pads under every part, cream silkscreen.
    Colour (4096), roughness/metal and bump (2048). */
function boardMaps(parts: Part[]) {
  const [cc, c] = canvas(4096), [mc, m] = canvas(2048), [hc, h] = canvas(2048), r = mulberry(404);
  const layers = [{ g: c, s: 4096 / BOARD.size }, { g: m, s: 2048 / BOARD.size }, { g: h, s: 2048 / BOARD.size }] as const;
  const X = (x: number, s: number) => (x - BOARD.x0) * s, Z = (z: number, s: number) => (z - BOARD.z0) * s;
  c.fillStyle = '#15110d'; c.fillRect(0, 0, 4096, 4096);
  m.fillStyle = 'rgb(0,150,0)'; m.fillRect(0, 0, 2048, 2048);   // G roughness, B metalness
  h.fillStyle = '#000'; h.fillRect(0, 0, 2048, 2048);
  // faint mottling in the mask, so it is not one flat colour
  for (let i = 0; i < 320; i++) { const x = r() * 4096, y = r() * 4096, s = 80 + r() * 420, gr = c.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, `rgba(${38 + r() * 18},${30 + r() * 12},22,0.16)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - s, y - s, s * 2, s * 2); }
  const each = (fn: (g: CanvasRenderingContext2D, s: number, i: number) => void) => layers.forEach(({ g, s }, i) => fn(g, s, i));
  const track = (pts: [number, number][], w: number) => each((g, s, i) => {
    g.beginPath(); pts.forEach(([x, z], k) => (k ? g.lineTo(X(x, s), Z(z, s)) : g.moveTo(X(x, s), Z(z, s))));
    g.lineJoin = g.lineCap = 'round'; g.lineWidth = w * s * (i === 2 ? 0.8 : 1);
    g.strokeStyle = i === 0 ? '#36251a' : i === 1 ? 'rgb(0,110,0)' : '#fff'; g.stroke();
  });
  const disc = (x: number, z: number, rr: number, fills: [string, string, string]) => each((g, s, i) => { g.fillStyle = fills[i]!; g.beginPath(); g.arc(X(x, s), Z(z, s), rr * s, 0, 7); g.fill(); });
  const via = (x: number, z: number, rr = 0.05) => { disc(x, z, rr, ['#b39050', 'rgb(0,80,255)', '#fff']); disc(x, z, rr * 0.45, ['#070605', 'rgb(0,200,0)', '#000']); };
  const rect = (x: number, z: number, w: number, d: number, rot: number, fills: [string, string, string]) => each((g, s, i) => { g.save(); g.translate(X(x, s), Z(z, s)); g.rotate(rot); g.fillStyle = fills[i]!; g.fillRect(-w / 2 * s, -d / 2 * s, w * s, d * s); g.restore(); });
  // buses of tracks running in from the edges with 45° turns
  const step = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  for (let b = 0; b < 56; b++) {
    let x = BOARD.x0 + 1 + r() * (BOARD.size - 2), z = BOARD.z0 + 1 + r() * (BOARD.size - 2);
    if (Math.hypot(x - CHIP.x, z - CHIP.z) < 3.4 || Math.hypot(x - 0.2, z + 1.5) < 2) continue;
    const lanes = 2 + Math.floor(r() * 7), pitch = 0.1 + r() * 0.06, w = 0.035 + r() * 0.03;
    let [dx, dz]: [number, number] = [...step[Math.floor(r() * 4)]!]; const pts: [number, number][] = [[x, z]];
    for (let s = 0; s < 3; s++) { const len = 1 + r() * 4; x += dx * len; z += dz * len; pts.push([x, z]); const turn = r() < 0.5 ? 1 : -1; const d2 = [dx - turn * dz, dz + turn * dx]; const l = Math.hypot(d2[0]!, d2[1]!); x += d2[0]! / l * 0.6; z += d2[1]! / l * 0.6; pts.push([x, z]); [dx, dz] = turn > 0 ? [-dz, dx] : [dz, -dx]; }
    for (let k = 0; k < lanes; k++) { const o = offset(pts, (k - (lanes - 1) / 2) * pitch); track(o, w); via(o[o.length - 1]![0], o[o.length - 1]![1], 0.04 + r() * 0.02); }
  }
  // stitching vias in a loose grid, and a few larger ones
  for (let i = 0; i < 520; i++) { const x = BOARD.x0 + r() * BOARD.size, z = BOARD.z0 + r() * BOARD.size; if (Math.hypot(x - CHIP.x, z - CHIP.z) > 3.2 && toRoute(x, z) > 0.2) via(x, z, r() < 0.9 ? 0.03 + r() * 0.02 : 0.08 + r() * 0.04); }
  // the data pair itself, slightly wider
  for (const sd of [-1, 1]) track(offset(ROUTE, sd * 0.075), 0.07);
  // mounting holes and fiducials
  for (const [x, z] of [[-2.5, -15], [19, 4]] as const) { disc(x, z, 0.62, ['#a68548', 'rgb(0,90,255)', '#fff']); disc(x, z, 0.36, ['#050403', 'rgb(0,230,0)', '#000']); }
  for (const [x, z] of [[-3.2, 2.2], [15.5, -12.5]] as const) { disc(x, z, 0.22, ['#0f0c09', 'rgb(0,90,0)', '#000']); disc(x, z, 0.09, ['#c2a368', 'rgb(0,60,255)', '#fff']); }
  // tinned pads under each part, then the silkscreen: outlines, a pin-one dot on chips, reference names
  const tin: [string, string, string] = ['#a49a86', 'rgb(0,70,255)', '#fff'];
  for (const p of parts) {
    const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
    if (p.kind === 'cap' || p.kind === 'res') for (const e of [-1, 1]) rect(p.x + ca * e * p.w * 0.42, p.z + sa * e * p.w * 0.42, p.w * 0.34, p.d * 1.25, p.rot, tin);
    else if (p.kind === 'chip') for (let k = 0; k < 4; k++) { const q = Math.max(3, Math.round(p.w / 0.11)); for (let j = 0; j < q; j++) { const t = (j - (q - 1) / 2) * (p.w * 0.8 / q), o = p.w * 0.5 + 0.03; const [x, z] = k === 0 ? [t, -o] : k === 1 ? [t, o] : k === 2 ? [-o, t] : [o, t]; rect(p.x + x, p.z + z, k < 2 ? 0.035 : 0.07, k < 2 ? 0.07 : 0.035, 0, tin); } }
    else if (p.kind === 'coil') for (const e of [-1, 1]) rect(p.x + e * 0.24, p.z, 0.2, 0.46, 0, tin);
    else disc(p.x, p.z, 0.25, tin);
  }
  const s = layers[0].s; c.strokeStyle = 'rgba(222,206,176,0.6)'; c.fillStyle = 'rgba(222,206,176,0.62)'; c.lineWidth = 0.012 * s; c.textBaseline = 'middle';
  parts.forEach((p, i) => {
    if ((p.kind === 'cap' || p.kind === 'res') && i % 3) return;
    c.save(); c.translate(X(p.x, s), Z(p.z, s)); c.rotate(p.rot);
    const w = (p.w + 0.12) * s, d = (p.d + 0.12) * s;
    if (p.kind === 'can') { c.beginPath(); c.arc(0, 0, 0.27 * s, 0, 7); c.stroke(); c.fillRect(-0.27 * s, -0.02 * s, 0.1 * s, 0.04 * s); }
    else c.strokeRect(-w / 2, -d / 2, w, d);
    if (p.kind === 'chip') { c.beginPath(); c.arc(-w / 2 - 0.06 * s, -d / 2 - 0.06 * s, 0.025 * s, 0, 7); c.fill(); }
    c.restore();
    c.font = `500 ${Math.round((p.kind === 'cap' || p.kind === 'res' ? 0.085 : 0.12) * s)}px Arial, sans-serif`;
    c.fillText(p.ref, X(p.x + (p.kind === 'cap' || p.kind === 'res' ? 0.16 : p.w * 0.5 + 0.12), s), Z(p.z + (p.kind === 'cap' || p.kind === 'res' ? 0 : -p.d * 0.5 - 0.1), s));
  });
  // the processor's outline and corner mark on the board
  c.strokeRect(X(CHIP.x - 2.42, s), Z(CHIP.z - 2.42, s), 4.84 * s, 4.84 * s);
  c.beginPath(); c.moveTo(X(CHIP.x - 2.6, s), Z(CHIP.z + 2.6, s)); c.lineTo(X(CHIP.x - 2.6, s), Z(CHIP.z + 2.2, s)); c.lineTo(X(CHIP.x - 2.2, s), Z(CHIP.z + 2.6, s)); c.fill();
  return { map: tex(cc, true), mr: tex(mc), bump: tex(hc) };
}

/** The package substrate's top: brown laminate with a faint weave, a gold corner mark, test pads along the edge. */
function substrateMap() {
  const n = 1024, [cv, c] = canvas(n), r = mulberry(9);
  c.fillStyle = '#241a11'; c.fillRect(0, 0, n, n);
  for (let i = 0; i < 2200; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '70,52,34' : '10,7,5'},${0.08 + r() * 0.1})`; c.fillRect(r() * n, r() * n, 2 + r() * 12, 1 + r() * 2); }
  for (let y = 0; y < n; y += 6) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, y, n, 2); }
  c.fillStyle = '#b08c4c';
  for (let i = 0; i < 46; i++) { const t = 40 + i * 20.5; for (const [x, y] of [[t, 10], [t, n - 16], [10, t], [n - 16, t]] as const) c.fillRect(x, y, 6, 6); }
  c.beginPath(); c.moveTo(18, n - 18); c.lineTo(18, n - 70); c.lineTo(70, n - 18); c.fill();
  return tex(cv, true);
}

/** A die shot, drawn: a floorplan of logic blocks (rows of standard cells), memory arrays and a few analogue blocks,
    under a grid of power straps, inside a seal ring and a ring of pads. Also a mask for the light: R is how bright a
    patch glows, G when it switches on (so the light arrives patch by patch, not as a smooth beam). */
function dieMaps() {
  const n = 2048, [cc, c] = canvas(n), [gc, g] = canvas(n), r = mulberry(77);
  c.fillStyle = '#14100c'; c.fillRect(0, 0, n, n); g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  c.strokeStyle = 'rgba(150,118,70,0.55)'; c.lineWidth = 6; c.strokeRect(16, 16, n - 32, n - 32);
  for (let i = 0; i * 26 < n - 120; i++) { const t = 60 + i * 26, o = i % 2 ? 62 : 36; for (const [x, y] of [[t, o], [t, n - o - 14], [o, t], [n - o - 14, t]] as const) { c.fillStyle = '#6d5638'; c.fillRect(x, y, 14, 14); c.fillStyle = '#a68955'; c.fillRect(x + 3, y + 3, 8, 8); } }
  const tones = ['#3a2d20', '#33281c', '#2d2419', '#3f311f', '#372a1b'];
  const glow = (x: number, y: number, w: number, h: number, lo: number, hi: number) => {
    const tx = Math.max(1, Math.round(w / (36 + r() * 40))), ty = Math.max(1, Math.round(h / (36 + r() * 40)));
    for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) { const v = Math.round(lo + r() * (hi - lo)); g.fillStyle = `rgb(${v},${Math.round(r() * 255)},0)`; g.fillRect(x + i * w / tx + 1, y + j * h / ty + 1, w / tx - 2, h / ty - 2); }
  };
  const logic = (x: number, y: number, w: number, h: number) => {
    c.fillStyle = tones[Math.floor(r() * tones.length)]!; c.fillRect(x, y, w, h);
    for (let yy = y; yy < y + h; yy += 5) { let xx = x; while (xx < x + w) { const cw = 3 + r() * 14; c.fillStyle = r() > 0.55 ? `rgba(206,170,112,${0.04 + r() * 0.16})` : `rgba(8,6,4,${0.1 + r() * 0.25})`; c.fillRect(xx, yy, Math.min(cw, x + w - xx), 4); xx += cw; } }
    c.fillStyle = 'rgba(190,150,92,0.05)'; for (let xx = x + 4; xx < x + w; xx += 9) c.fillRect(xx, y, 1, h);
    for (let k = 0; k < 2 + r() * 3; k++) { c.fillStyle = `rgba(${r() > 0.5 ? '120,95,60' : '20,15,10'},0.22)`; c.fillRect(x + r() * w * 0.7, y + r() * h * 0.7, w * (0.1 + r() * 0.25), h * (0.1 + r() * 0.25)); }
    glow(x, y, w, h, 150, 255);
  };
  const sram = (x: number, y: number, w: number, h: number) => {
    c.fillStyle = '#271f16'; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(176,140,90,0.15)'; for (let yy = y; yy < y + h; yy += 4) c.fillRect(x, yy, w, 1);
    c.fillStyle = 'rgba(176,140,90,0.09)'; for (let xx = x; xx < x + w; xx += 4) c.fillRect(xx, y, 1, h);
    const bx = w > h ? 4 : 2, by = w > h ? 2 : 4; c.fillStyle = '#3d3022';
    for (let i = 1; i < bx; i++) c.fillRect(x + i * w / bx - 5, y, 10, h);
    for (let j = 1; j < by; j++) c.fillRect(x, y + j * h / by - 5, w, 10);
    glow(x, y, w, h, 60, 120);
  };
  const analog = (x: number, y: number, w: number, h: number) => {
    c.fillStyle = '#231c14'; c.fillRect(x, y, w, h);
    for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(170,135,80,${0.08 + r() * 0.14})`; c.fillRect(x + r() * w * 0.8, y + r() * h * 0.8, w * (0.06 + r() * 0.2), h * (0.06 + r() * 0.2)); }
    c.strokeStyle = 'rgba(170,135,80,0.18)'; c.lineWidth = 2; for (let yy = y + 8; yy < y + h * 0.4; yy += 7) { c.beginPath(); c.moveTo(x + 8, yy); c.lineTo(x + w * 0.45, yy); c.stroke(); }
    glow(x, y, w, h, 20, 60);
  };
  const split = (x: number, y: number, w: number, h: number, depth: number) => {
    if (depth >= 5 || (w * h < 140000 && r() < 0.45) || w < 140 || h < 140) { const k = r(); (k < 0.26 ? sram : k < 0.36 ? analog : logic)(x, y, w, h); return; }
    const ch = 10, t = 0.3 + r() * 0.4;
    if (w > h) { const a = Math.round(w * t); split(x, y, a - ch / 2, h, depth + 1); split(x + a + ch / 2, y, w - a - ch / 2, h, depth + 1); }
    else { const a = Math.round(h * t); split(x, y, w, a - ch / 2, depth + 1); split(x, y + a + ch / 2, w, h - a - ch / 2, depth + 1); }
  };
  split(110, 110, n - 220, n - 220, 0);
  // the top metal: power straps across the whole core
  c.fillStyle = 'rgba(164,130,80,0.13)'; for (let y = 140; y < n - 110; y += 96) c.fillRect(110, y, n - 220, 8);
  c.fillStyle = 'rgba(164,130,80,0.07)'; for (let x = 150; x < n - 110; x += 192) c.fillRect(x, 110, 4, n - 220);
  const t1 = tex(cc, true), t2 = tex(gc);
  return { map: t1, glow: t2 };
}

/** Brushed metal: fine parallel streaks as a bump map. */
function brushed() {
  const [cv, g] = canvas(512), r = mulberry(5); g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) { const y = r() * 512, v = Math.round(100 + r() * 60); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(0, y, 512, 0.6 + r() * 1.4); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/** Two-terminal parts (capacitors, resistors): one instanced body with per-part colour and one instanced pair of tinned ends. */
function passives(list: { x: number; y: number; z: number; w: number; d: number; h: number; rot: number; color: number }[], tin: THREE.Material) {
  const body = new THREE.InstancedMesh(roundBox(1, 1, 1, 0.12, { seg: [4, 3, 3] }), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }), list.length);
  const ends = new THREE.InstancedMesh(roundBox(1, 1, 1, 0.18, { seg: [3, 3, 3] }), tin, list.length * 2);
  const o = new THREE.Object3D(), col = new THREE.Color();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z); o.rotation.set(0, -p.rot, 0); o.scale.set(p.w * 0.66, p.h * 0.94, p.d * 0.96); o.updateMatrix(); body.setMatrixAt(i, o.matrix); body.setColorAt(i, col.setHex(p.color));
    for (const e of [-1, 1]) { o.position.set(p.x + Math.cos(p.rot) * e * p.w * 0.41, p.y, p.z + Math.sin(p.rot) * e * p.w * 0.41); o.scale.set(p.w * 0.2, p.h, p.d); o.updateMatrix(); ends.setMatrixAt(i * 2 + (e > 0 ? 1 : 0), o.matrix); }
  });
  return [body, ends];
}

export interface Cpu {
  group: THREE.Group;
  /** Lid off (0..1), the light across the die (0..1), and the bits on the tracks. */
  set: (lid: number, wave: number, flow: number, glow: number) => void;
  /** Where the bead is: u 0..1 along the tracks from the socket, then 1..2 from the package edge to the middle of the die. */
  beadAt: (u: number, out: THREE.Vector3) => THREE.Vector3;
  anchors: THREE.Vector3[];
}

export function buildCpu(): Cpu {
  const group = new THREE.Group(), r = mulberry(12);
  const parts = layout(), maps = boardMaps(parts);
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.size, 0.16, BOARD.size), new THREE.MeshPhysicalMaterial({ map: maps.map, roughnessMap: maps.mr, metalnessMap: maps.mr, roughness: 1, metalness: 1, bumpMap: maps.bump, bumpScale: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.38 }));
  board.position.set(BOARD.x0 + BOARD.size / 2, BOARD_Y - 0.08, BOARD.z0 + BOARD.size / 2); board.receiveShadow = true; group.add(board);

  const nickel = new THREE.MeshPhysicalMaterial({ color: 0xcfc6b4, metalness: 1, roughness: 0.3, envMapIntensity: 1.6 });
  const tin = new THREE.MeshPhysicalMaterial({ color: 0xbdb3a0, metalness: 1, roughness: 0.38 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x15110e, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  // The socket the plug goes into: a pressed metal shell standing on the board, with solder tabs.
  const socket = new THREE.Mesh(roundBox(1.0, 0.55, 0.42, 0.12, { seg: [10, 6, 6] }), nickel); socket.position.set(0.18, BOARD_Y, 0); group.add(socket);
  for (const sx of [-0.56, 0.56]) { const tab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.3), nickel); tab.position.set(0.18 + sx, BOARD_Y + 0.02, 0); group.add(tab); }

  /* ---------- the parts on the board ---------- */
  const two = parts.filter((p) => p.kind === 'cap' || p.kind === 'res');
  group.add(...passives(two.map((p) => ({ x: p.x, y: BOARD_Y, z: p.z, w: p.w, d: p.d, h: p.h, rot: p.rot, color: p.kind === 'res' ? 0x17130f : [0x6e5640, 0x7a5f45, 0x655040][Math.floor(r() * 3)]! })), tin));
  for (const p of parts) {
    if (p.kind === 'chip') { const m = new THREE.Mesh(roundBox(p.w, p.h, p.d, 0.012, { seg: [3, 2, 3] }), black); m.position.set(p.x, BOARD_Y, p.z); group.add(m); }
    else if (p.kind === 'coil') { const m = new THREE.Mesh(roundBox(p.w, p.h, p.d, 0.05, { seg: [5, 4, 5] }), new THREE.MeshPhysicalMaterial({ color: 0x2c2722, metalness: 0.4, roughness: 0.5 })); m.position.set(p.x, BOARD_Y, p.z); group.add(m); }
  }
  // polymer capacitors: dark aluminium cans with a rounded top and a scored cross
  const canGeo = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.2, 0.4), new THREE.Vector2(0.19, 0.44), new THREE.Vector2(0.16, 0.455), new THREE.Vector2(0, 0.455)], 32);
  const canMat = new THREE.MeshPhysicalMaterial({ color: 0x3a3029, metalness: 0.8, roughness: 0.35, clearcoat: 0.4 });
  for (const p of parts.filter((q) => q.kind === 'can')) { const m = new THREE.Mesh(canGeo, canMat); m.position.set(p.x, BOARD_Y, p.z); group.add(m); }

  /* ---------- the package: substrate, small parts round the die, the lid ---------- */
  const substrate = new THREE.Mesh(roundBox(4.6, 0.12, 4.6, 0.05, { seg: [8, 4, 8] }), new THREE.MeshPhysicalMaterial({ map: substrateMap(), roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
  { const g = substrate.geometry, p = g.attributes.position!, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 4.6 + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / 4.6; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  substrate.position.copy(CHIP); group.add(substrate);
  const top = CHIP.y + 0.12;
  // capacitors on the package, in clusters between the lid's flange and the edge, clear of where the tracks come in
  const pkg: Parameters<typeof passives>[0] = [];
  for (let side = 0; side < 4; side++) for (const centre of [-1.05, 0.95]) {
    if (side === 2 && Math.abs(centre) < 0.5) continue;
    const count = 4 + Math.floor(r() * 4);
    for (let row = 0; row < 2; row++) for (let k = 0; k < count; k++) {
      const t = centre + (k - (count - 1) / 2) * 0.115, e = 2.03 + row * 0.13;
      const [x, z] = side === 0 ? [t, -e] : side === 1 ? [t, e] : side === 2 ? [-e, t] : [e, t];
      pkg.push({ x: CHIP.x + x, y: top, z: CHIP.z + z, w: 0.1, d: 0.05, h: 0.05, rot: side > 1 ? 0 : Math.PI / 2, color: [0x6e5640, 0x765c43][k % 2]! });
    }
  }
  group.add(...passives(pkg, tin));

  // The die: silicon on a thin dark fillet of underfill, with a thin-film sheen. It lights up patch by patch from where
  // the message comes in (the left edge, the tracks' side), each patch flashing as it switches on, then holding.
  const die = dieMaps(), uWave = { value: 0 };
  const fillet = new THREE.Mesh(roundBox(1.86, 0.035, 1.86, 0.017, { seg: [6, 3, 6] }), new THREE.MeshPhysicalMaterial({ color: 0x0f0b08, roughness: 0.3, clearcoat: 0.6 })); fillet.position.set(CHIP.x, top, CHIP.z); group.add(fillet);
  const dieMat = new THREE.MeshPhysicalMaterial({ map: die.map, bumpMap: die.map, bumpScale: 0.5, metalness: 0.25, roughness: 0.42, envMapIntensity: 0.55, iridescence: 0.2, iridescenceIOR: 1.5, iridescenceThicknessRange: [380, 520], emissive: 0xffc27a, emissiveMap: die.glow, emissiveIntensity: 1 });
  dieMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWave = uWave;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWave;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec4 gm = texture2D(emissiveMap, vEmissiveMapUv);
        float t = uWave * 1.4 - distance(vEmissiveMapUv, vec2(0.0, 0.5)) / 1.12 - gm.g * 0.32; // from the middle of the left edge, each patch at its own moment
        float on = smoothstep(0.0, 0.02, t), flash = on * (1.0 - smoothstep(0.0, 0.16, t));
        float fine = clamp(0.35 + 5.0 * dot(texture2D(map, vMapUv).rgb, vec3(0.333)), 0.35, 1.6); // the cells' own pattern shows through the light
        totalEmissiveRadiance = emissive * gm.r * fine * (on * 0.34 + flash * 1.1);`);
  };
  dieMat.customProgramCacheKey = () => 'die-wave-2';
  const dieMesh = new THREE.Mesh(roundBox(1.7, 0.1, 1.7, 0.012, { seg: [4, 2, 4] }), dieMat); dieMesh.position.set(CHIP.x, top, CHIP.z); group.add(dieMesh);
  { const g = dieMesh.geometry, p = g.attributes.position!, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 1.7 + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / 1.7; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }

  // The lid: a brushed metal spreader with a flange, sealed to the substrate. It lifts, tips and slides away.
  const brush = brushed(); brush.repeat.set(2, 2);
  const lidMat = new THREE.MeshPhysicalMaterial({ color: 0x988a74, metalness: 1, roughness: 0.42, bumpMap: brush, bumpScale: 0.35, envMapIntensity: 0.6 });
  const lid = new THREE.Group();
  const flange = new THREE.Mesh(roundBox(3.9, 0.1, 3.9, 0.04, { seg: [8, 3, 8] }), lidMat);
  const plate = new THREE.Mesh(roundBox(3.1, 0.24, 3.1, 0.1, { seg: [10, 5, 10] }), lidMat); plate.position.y = 0.08;
  [flange, plate].forEach((m) => { const g = m.geometry, p = g.attributes.position!, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 2; uv[i * 2 + 1] = p.getZ(i) / 2; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); });
  const paste = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.01, 1.6), new THREE.MeshPhysicalMaterial({ color: 0x8f8a82, roughness: 0.75 })); paste.position.y = -0.006; // the grey thermal compound left on the lid's underside
  lid.add(flange, plate, paste); lid.position.set(CHIP.x, top, CHIP.z); group.add(lid);

  /* ---------- the pair on the board: two tracks that carry the bits as opposites, one draw each ---------- */
  const uFlow = { value: 0 }, uGlow = { value: 0 };
  const ribbon = (pts: [number, number][], invert: boolean) => {
    const pos: number[] = [], along: number[] = [], across: number[] = [], idx: number[] = []; let len = 0;
    const dense: [number, number][] = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 20; k++) { const t = k / 20; dense.push([pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * t, pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * t]); } dense.push(pts[pts.length - 1]!);
    const l = offset(dense, -0.065), rr = offset(dense, 0.065);
    dense.forEach((p, i) => { if (i) len += Math.hypot(p[0] - dense[i - 1]![0], p[1] - dense[i - 1]![1]); pos.push(l[i]![0], BOARD_Y + 0.004, l[i]![1], rr[i]![0], BOARD_Y + 0.004, rr[i]![1]); along.push(len, len); across.push(-1, 1); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); g.setAttribute('across', new THREE.Float32BufferAttribute(across, 1)); g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb466, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlow = uFlow; sh.uniforms.uGlow = uGlow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float along; attribute float across; varying float vAlong; varying float vAcross;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along; vAcross = across;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlow; uniform float uGlow; varying float vAlong; varying float vAcross;\nfloat bitAt(float c, float p) { float b = step(0.42, fract(sin(c * 12.9898 + p * 78.233) * 43758.5453)); return ' + (invert ? '1.0 - b' : 'b') + '; }')
        .replace('#include <opaque_fragment>', `float x = vAlong - uFlow, f = fract(x / 2.6), packet = floor(x / 2.6);
          float inPacket = smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.56, 0.64, f));
          float c = floor(x / 0.09), k = smoothstep(0.7, 1.0, fract(x / 0.09));
          float level = mix(0.16, 1.0, mix(bitAt(c, packet), bitAt(c + 1.0, packet), k)); // the line swings between two levels, it never goes dark mid-message
          float core = exp(-vAcross * vAcross * 7.0), halo = exp(-vAcross * vAcross * 1.6) * 0.12;
          outgoingLight *= (0.04 + inPacket * level * 0.38) * (core + halo) * uGlow; diffuseColor.a = 1.0;
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => (invert ? 'track-b2' : 'track-a2');
    const m = new THREE.Mesh(g, mat); m.renderOrder = 4; group.add(m); return len;
  };
  const trackLen = ribbon(offset(ROUTE, -0.075), false); ribbon(offset(ROUTE, 0.075), true);

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== board) o.castShadow = o.receiveShadow = true; });

  const routeCurve = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < ROUTE.length - 1; i++) routeCurve.add(new THREE.LineCurve3(new THREE.Vector3(ROUTE[i]![0], BOARD_Y + 0.08, ROUTE[i]![1]), new THREE.Vector3(ROUTE[i + 1]![0], BOARD_Y + 0.08, ROUTE[i + 1]![1])));
  const edge = new THREE.Vector3(ROUTE[ROUTE.length - 1]![0], BOARD_Y + 0.08, ROUTE[ROUTE.length - 1]![1]), centre = new THREE.Vector3(CHIP.x, top + 0.16, CHIP.z);
  const beadAt = (u: number, out: THREE.Vector3) => (u <= 1 ? out.copy(routeCurve.getPointAt(Math.max(0, u))) : out.lerpVectors(edge, centre, Math.min(1, u - 1)).setY(THREE.MathUtils.lerp(edge.y, centre.y, Math.min(1, (u - 1) * 3))));

  const ss = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
  const set = (lidK: number, wave: number, flow: number, glow: number) => {
    const up = ss(0, 0.45, lidK), away = ss(0.35, 1, lidK);
    lid.position.set(CHIP.x + 5.2 * away, top + 2.1 * up + 0.6 * away, CHIP.z - 1.6 * away); // straight up first, then off to the back right
    lid.rotation.set(-0.08 * up - 0.18 * away, 0, 0.32 * ss(0.15, 1, lidK));                 // tipping as it goes, so its thickness and underside show
    lid.visible = lidK < 0.999;
    uWave.value = wave; uFlow.value = flow * trackLen * 2; uGlow.value = glow;
  };
  set(0, 0, 0, 0);
  const anchors = [
    new THREE.Vector3(CHIP.x - 1.55, top + 0.32, CHIP.z + 1.55),   // the lid (while it is still on)
    new THREE.Vector3(CHIP.x + 0.55, top + 0.1, CHIP.z + 0.7),     // the die
    new THREE.Vector3(CHIP.x - 1.05, top + 0.05, CHIP.z - 2.1),    // the cluster of small parts at the back left, which stays in frame to the end
  ];
  return { group, set, beadAt, anchors };
}
