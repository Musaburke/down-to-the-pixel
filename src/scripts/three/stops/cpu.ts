/* Stop 4, the processor. The plug goes into a socket on the computer's main board; the data pair carries on as two
   copper tracks across the board to the processor. Its metal lid lifts away and the silicon underneath lights in a
   wave from where the message arrives. One unit is about 10 mm. Board and die are drawn once into canvases. */
import * as THREE from 'three';
import { roundBox } from '../geometry.ts';

export const BOARD_Y = -27.05;
export const CHIP = new THREE.Vector3(9, BOARD_Y, -7); // centre of the processor package, on the board
const BOARD = { x0: -6, z0: -21, size: 30 };          // the board's square, in world x and z
const N = 2048;                                       // board canvas size

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const canvas = (n: number) => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); if (!g) throw new Error('2D canvas unavailable'); return [c, g] as const; };
const px = (x: number) => (x - BOARD.x0) / BOARD.size * N, pz = (z: number) => (z - BOARD.z0) / BOARD.size * N;

// The data pair's route across the board, centre line, in world x and z: down from the socket, a 45° turn, across, into the package's edge.
const ROUTE: [number, number][] = [[0.2, -0.45], [0.2, -1.8], [1.4, -3.0], [4.6, -3.0], [6.0, -4.4], [6.0, -6.4], [6.6, -7.0], [6.85, -7.0]];

/** Offset a polyline sideways (mitred corners), for the two tracks of the pair. */
const offset = (pts: [number, number][], d: number): [number, number][] => pts.map(([x, z], i) => {
  const n1 = i > 0 ? norm(pts[i - 1]!, pts[i]!) : norm(pts[0]!, pts[1]!), n2 = i < pts.length - 1 ? norm(pts[i]!, pts[i + 1]!) : n1;
  const mx = n1[0] + n2[0], mz = n1[1] + n2[1], ml = Math.hypot(mx, mz) || 1, k = d / Math.max(0.5, (mx * n1[0] + mz * n1[1]) / ml);
  return [x + mx / ml * k, z + mz / ml * k];
});
function norm(a: [number, number], b: [number, number]): [number, number] { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; }

/** The board: matte coffee-black solder mask, copper tracks under it, exposed gold pads and vias. Colour, roughness/metal and a bump map. */
function boardMaps() {
  const [cc, c] = canvas(N), [mc, m] = canvas(N), [hc, h] = canvas(1024), r = mulberry(404);
  c.fillStyle = '#16120e'; c.fillRect(0, 0, N, N);
  m.fillStyle = 'rgb(0,210,0)'; m.fillRect(0, 0, N, N);       // G roughness, B metalness
  h.fillStyle = '#000'; h.fillRect(0, 0, 1024, 1024);
  // faint mottling in the mask, so it is not one flat colour
  for (let i = 0; i < 260; i++) { const x = r() * N, y = r() * N, s = 40 + r() * 220, g = c.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, `rgba(${40 + r() * 20},${32 + r() * 14},${24},0.18)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2); }
  const track = (pts: [number, number][], w: number, exposed = false) => {
    const path = (g: CanvasRenderingContext2D, k: number) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(px(x) * k, pz(z) * k) : g.moveTo(px(x) * k, pz(z) * k))); };
    c.lineJoin = m.lineJoin = h.lineJoin = 'round'; c.lineCap = m.lineCap = h.lineCap = 'round';
    path(c, 1); c.strokeStyle = exposed ? '#b8964e' : '#2a2119'; c.lineWidth = w * N / BOARD.size; c.stroke();
    path(m, 1); m.strokeStyle = exposed ? 'rgb(0,90,255)' : 'rgb(0,150,0)'; m.lineWidth = w * N / BOARD.size; m.stroke();
    path(h, 0.5); h.strokeStyle = '#fff'; h.lineWidth = w * N / BOARD.size * 0.5; h.stroke();
  };
  const via = (x: number, z: number, rr = 0.05) => {
    for (const [g, k, fill] of [[c, 1, '#b8964e'], [m, 1, 'rgb(0,80,255)'], [h, 0.5, '#fff']] as const) { g.fillStyle = fill; g.beginPath(); g.arc(px(x) * k, pz(z) * k, rr * N / BOARD.size * k, 0, 7); g.fill(); }
    c.fillStyle = '#0a0806'; c.beginPath(); c.arc(px(x), pz(z), rr * 0.45 * N / BOARD.size, 0, 7); c.fill();
  };
  // buses of tracks running in from the edges with 45° turns, like any real board
  const step = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  for (let b = 0; b < 46; b++) {
    let x = BOARD.x0 + 1 + r() * (BOARD.size - 2), z = BOARD.z0 + 1 + r() * (BOARD.size - 2);
    if (Math.hypot(x - CHIP.x, z - CHIP.z) < 3.4 || Math.hypot(x - 0.2, z + 1.5) < 2) continue;
    const lanes = 2 + Math.floor(r() * 6), pitch = 0.11 + r() * 0.06, w = 0.045 + r() * 0.03;
    let [dx, dz]: [number, number] = [...step[Math.floor(r() * 4)]!]; const pts: [number, number][] = [[x, z]];
    for (let s = 0; s < 3; s++) { const len = 1 + r() * 4; x += dx * len; z += dz * len; pts.push([x, z]); const turn = r() < 0.5 ? 1 : -1; const d2 = [dx - turn * dz, dz + turn * dx]; const l = Math.hypot(d2[0]!, d2[1]!); x += d2[0]! / l * 0.6; z += d2[1]! / l * 0.6; pts.push([x, z]); [dx, dz] = turn > 0 ? [-dz, dx] : [dz, -dx]; }
    for (let k = 0; k < lanes; k++) { const o = offset(pts, (k - (lanes - 1) / 2) * pitch); track(o, w); via(o[o.length - 1]![0], o[o.length - 1]![1]); }
  }
  for (let i = 0; i < 420; i++) { const x = BOARD.x0 + r() * BOARD.size, z = BOARD.z0 + r() * BOARD.size; if (Math.hypot(x - CHIP.x, z - CHIP.z) > 3.2) via(x, z, 0.035 + r() * 0.03); }
  // the data pair itself, slightly wider, ending on two gold pads at the package
  for (const s of [-1, 1]) { const o = offset(ROUTE, s * 0.075); track(o, 0.07); }
  // mounting hole with a gold ring
  for (const [x, z] of [[-2.5, -15], [19, 4]] as const) { via(x, z, 0.42); }
  const tex = (cv: HTMLCanvasElement, srgb = false) => { const t = new THREE.CanvasTexture(cv); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(cc, true), mr: tex(mc), bump: tex(hc) };
}

/** A die shot, drawn: core blocks with fine logic texture, a cache made of regular arrays, an I/O ring of pads.
    Also a glow mask of the same blocks for the wave of light. */
function dieMaps() {
  const n = 1024, [cc, c] = canvas(n), [gc, g] = canvas(n), r = mulberry(77);
  c.fillStyle = '#1a1612'; c.fillRect(0, 0, n, n); g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  // Logic: rows of standard cells (thin stripes broken into cells of random width), split into sub-blocks. Each
  // sub-block glows at its own strength, so the wave lights a mosaic rather than flat panels.
  const block = (x: number, y: number, w: number, h: number, tone: string, fine: number, glow: number) => {
    c.fillStyle = tone; c.fillRect(x, y, w, h);
    for (let yy = y; yy < y + h; yy += fine) { let xx = x; while (xx < x + w) { const cw = fine * (0.6 + r() * 3); c.fillStyle = `rgba(${r() > 0.5 ? '205,172,112' : '18,14,10'},${0.1 + r() * 0.22})`; c.fillRect(xx, yy, Math.min(cw, x + w - xx) - 1, fine - 1.5); xx += cw; } }
    const sx = 4 + Math.floor(r() * 3), sy = 3 + Math.floor(r() * 2), bw = w / sx, bh = h / sy;
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      c.strokeStyle = 'rgba(12,10,8,0.7)'; c.lineWidth = 3; c.strokeRect(x + i * bw, y + j * bh, bw, bh);
      const v = Math.round(glow * (0.25 + r() * 0.75)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + i * bw + 4, y + j * bh + 4, bw - 8, bh - 8);
    }
  };
  const array = (x: number, y: number, w: number, h: number, cell: number) => {
    c.fillStyle = '#2a231b'; c.fillRect(x, y, w, h);
    for (let yy = y; yy < y + h; yy += cell) for (let xx = x; xx < x + w; xx += cell) { c.fillStyle = (Math.floor(xx / cell) + Math.floor(yy / cell)) % 2 ? '#3a3024' : '#30281e'; c.fillRect(xx + 1, yy + 1, cell - 2, cell - 2); }
    for (let xx = x; xx < x + w; xx += w / 8) { const v = Math.round(60 + r() * 50); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(xx + 3, y + 3, w / 8 - 6, h - 6); } // the cache lights faintly, bank by bank
  };
  // I/O ring: pads round the edge
  for (let i = 0; i < 40; i++) { const t = 40 + i * 23.5; for (const [x, y] of [[t, 14], [t, n - 30], [14, t], [n - 30, t]]) { c.fillStyle = '#9a7c45'; c.fillRect(x!, y!, 14, 14); } }
  const m = 64, cw = (n - m * 2 - 30) / 2;
  block(m, m, cw, cw * 0.6, '#3b2f22', 5, 255); block(m + cw + 30, m, cw, cw * 0.6, '#3b2f22', 5, 255);                   // two blocks of logic
  block(m, m + cw * 0.6 + 24, cw, cw * 0.6, '#35291e', 5, 210); block(m + cw + 30, m + cw * 0.6 + 24, cw, cw * 0.6, '#35291e', 5, 210);
  array(m, m + cw * 1.2 + 48, n - m * 2, n - m * 2 - cw * 1.2 - 48, 8);                                                     // a cache: regular arrays
  // routing channels between blocks, faintly gold
  c.strokeStyle = 'rgba(190,150,80,0.25)'; c.lineWidth = 3;
  for (let i = 0; i < 18; i++) { c.beginPath(); const y = m + r() * (n - 2 * m); c.moveTo(m, y); c.lineTo(n - m, y); c.stroke(); }
  const t1 = new THREE.CanvasTexture(cc); t1.colorSpace = THREE.SRGBColorSpace; t1.anisotropy = 8;
  const t2 = new THREE.CanvasTexture(gc); t2.anisotropy = 8;
  return { map: t1, glow: t2 };
}

/** Brushed metal: fine parallel streaks as a bump map. */
function brushed() {
  const [cv, g] = canvas(512), r = mulberry(5); g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) { const y = r() * 512, v = Math.round(100 + r() * 60); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(0, y, 512, 0.6 + r() * 1.4); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export interface Cpu {
  group: THREE.Group;
  /** Lid off (0..1), the wave across the die (0..1), and the bits on the tracks. */
  set: (lid: number, wave: number, flow: number, glow: number) => void;
  /** Where the bead is: u 0..1 along the tracks from the socket, then 1..2 from the package edge to the middle of the die. */
  beadAt: (u: number, out: THREE.Vector3) => THREE.Vector3;
  anchors: THREE.Vector3[];
}

export function buildCpu(): Cpu {
  const group = new THREE.Group(), r = mulberry(12);
  const maps = boardMaps();
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.size, 0.16, BOARD.size), new THREE.MeshPhysicalMaterial({ map: maps.map, roughnessMap: maps.mr, metalnessMap: maps.mr, roughness: 1, metalness: 1, bumpMap: maps.bump, bumpScale: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.5 }));
  board.position.set(BOARD.x0 + BOARD.size / 2, BOARD_Y - 0.08, BOARD.z0 + BOARD.size / 2); board.receiveShadow = true; group.add(board);

  const nickel = new THREE.MeshPhysicalMaterial({ color: 0xcfc6b4, metalness: 1, roughness: 0.3, envMapIntensity: 1.6 });
  // The socket the plug goes into: a pressed metal shell standing on the board, with solder tabs.
  const socket = new THREE.Mesh(roundBox(1.0, 0.55, 0.42, 0.12, { seg: [10, 6, 6] }), nickel); socket.position.set(0.18, BOARD_Y, 0); group.add(socket);
  for (const sx of [-0.56, 0.56]) { const tab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.3), nickel); tab.position.set(0.18 + sx, BOARD_Y + 0.02, 0); group.add(tab); }

  /* ---------- the package: substrate, small parts round the die, the lid ---------- */
  const substrate = new THREE.Mesh(roundBox(4.6, 0.12, 4.6, 0.04, { seg: [8, 3, 8] }), new THREE.MeshPhysicalMaterial({ color: 0x2b2116, roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
  substrate.position.copy(CHIP); group.add(substrate);
  const top = CHIP.y + 0.12;
  const capGeo = roundBox(0.16, 0.08, 0.09, 0.015, { seg: [4, 3, 3] });
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshPhysicalMaterial({ color: 0x8c7356, roughness: 0.45, clearcoat: 0.4 }), 64);
  { const d = new THREE.Object3D(); for (let i = 0; i < 64; i++) {
      const side = i % 4, k = Math.floor(i / 4), t = -1.8 + k * 0.24 + (r() - 0.5) * 0.03, edge = 2.05;
      const [x, z] = side === 0 ? [t, -edge] : side === 1 ? [t, edge] : side === 2 ? [-edge, t] : [edge, t];
      d.position.set(CHIP.x + x, top, CHIP.z + z); d.rotation.y = side > 1 ? Math.PI / 2 : 0; d.updateMatrix(); caps.setMatrixAt(i, d.matrix);
    } }
  group.add(caps);

  // The die: silicon with a faint rainbow sheen, lit in a wave from where the message comes in (the left edge, the tracks' side).
  const die = dieMaps(), uWave = { value: 0 };
  const dieMat = new THREE.MeshPhysicalMaterial({ map: die.map, metalness: 0.35, roughness: 0.22, iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], emissive: 0xffc27a, emissiveMap: die.glow, emissiveIntensity: 1 });
  dieMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWave = uWave;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWave;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float d = distance(vEmissiveMapUv, vec2(0.0, 0.5)) / 1.12; // from the middle of the left edge
        float front = smoothstep(uWave - 0.22, uWave, d) * (1.0 - smoothstep(uWave, uWave + 0.06, d));
        totalEmissiveRadiance *= (front * 0.55 + smoothstep(uWave, uWave - 0.25, d) * 0.24) * min(1.0, uWave * 8.0);`);
  };
  dieMat.customProgramCacheKey = () => 'die-wave';
  const dieMesh = new THREE.Mesh(roundBox(1.7, 0.06, 1.7, 0.01, { seg: [4, 2, 4] }), dieMat); dieMesh.position.set(CHIP.x, top, CHIP.z); group.add(dieMesh);
  { const g = dieMesh.geometry, p = g.attributes.position!, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 1.7 + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / 1.7; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }

  // The lid: a brushed metal spreader with a flange, sealed to the substrate. It lifts and slides off.
  const brush = brushed(); brush.repeat.set(2, 2);
  const lidMat = new THREE.MeshPhysicalMaterial({ color: 0xd4c8b2, metalness: 1, roughness: 0.34, bumpMap: brush, bumpScale: 0.35, envMapIntensity: 1.4 });
  const lid = new THREE.Group();
  const flange = new THREE.Mesh(roundBox(3.9, 0.1, 3.9, 0.04, { seg: [8, 3, 8] }), lidMat);
  const plate = new THREE.Mesh(roundBox(3.1, 0.24, 3.1, 0.1, { seg: [10, 5, 10] }), lidMat); plate.position.y = 0.08;
  [flange, plate].forEach((m) => { const g = m.geometry, p = g.attributes.position!, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 2; uv[i * 2 + 1] = p.getZ(i) / 2; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); });
  lid.add(flange, plate); lid.position.set(CHIP.x, top, CHIP.z); group.add(lid);

  /* ---------- the pair on the board: two tracks that glow as opposites, one draw each ---------- */
  const uFlow = { value: 0 }, uGlow = { value: 0 };
  const ribbon = (pts: [number, number][], invert: boolean) => {
    const pos: number[] = [], along: number[] = [], idx: number[] = []; let len = 0;
    const dense: [number, number][] = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 20; k++) { const t = k / 20; dense.push([pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * t, pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * t]); } dense.push(pts[pts.length - 1]!);
    const l = offset(dense, -0.03), rr = offset(dense, 0.03);
    dense.forEach((p, i) => { if (i) len += Math.hypot(p[0] - dense[i - 1]![0], p[1] - dense[i - 1]![1]); pos.push(l[i]![0], BOARD_Y + 0.006, l[i]![1], rr[i]![0], BOARD_Y + 0.006, rr[i]![1]); along.push(len, len); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlow = uFlow; sh.uniforms.uGlow = uGlow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float along; varying float vAlong;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlow; uniform float uGlow; varying float vAlong;')
        .replace('#include <opaque_fragment>', `float x = vAlong - uFlow, packet = floor(x / 2.6), inPacket = step(fract(x / 2.6), 0.62);
          float cell = floor(x / 0.07), bit = step(0.42, fract(sin(cell * 12.9898 + packet * 78.233) * 43758.5453));
          float edge = smoothstep(0.0, 0.5, fract(x / 0.07)) * smoothstep(0.0, 0.5, 1.0 - fract(x / 0.07));
          outgoingLight *= inPacket * ${invert ? '(1.0 - bit)' : 'bit'} * edge * uGlow; diffuseColor.a = 1.0;
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => (invert ? 'track-b' : 'track-a');
    const m = new THREE.Mesh(g, mat); m.renderOrder = 4; group.add(m); return len;
  };
  const trackLen = ribbon(offset(ROUTE, -0.075), false); ribbon(offset(ROUTE, 0.075), true);

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== board) o.castShadow = o.receiveShadow = true; });

  const routeCurve = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < ROUTE.length - 1; i++) routeCurve.add(new THREE.LineCurve3(new THREE.Vector3(ROUTE[i]![0], BOARD_Y + 0.08, ROUTE[i]![1]), new THREE.Vector3(ROUTE[i + 1]![0], BOARD_Y + 0.08, ROUTE[i + 1]![1])));
  const edge = new THREE.Vector3(ROUTE[ROUTE.length - 1]![0], BOARD_Y + 0.08, ROUTE[ROUTE.length - 1]![1]), centre = new THREE.Vector3(CHIP.x, top + 0.12, CHIP.z);
  const beadAt = (u: number, out: THREE.Vector3) => (u <= 1 ? out.copy(routeCurve.getPointAt(Math.max(0, u))) : out.lerpVectors(edge, centre, Math.min(1, u - 1)).setY(THREE.MathUtils.lerp(edge.y, centre.y, Math.min(1, (u - 1) * 3))));

  const set = (lidK: number, wave: number, flow: number, glow: number) => {
    const e = lidK * lidK * (3 - 2 * lidK);
    lid.position.set(CHIP.x + 4.2 * Math.max(0, e - 0.35) / 0.65, top + 2.6 * Math.min(1, e / 0.5), CHIP.z - 0.4 * e); // up first, then away to the side
    lid.rotation.set(-0.12 * e, 0, 0.22 * Math.max(0, e - 0.35));
    lid.visible = lidK < 0.999;
    uWave.value = wave * 1.15; uFlow.value = flow * trackLen * 2; uGlow.value = glow;
  };
  set(0, 0, 0, 0);
  const anchors = [
    new THREE.Vector3(CHIP.x - 1.55, top + 0.32, CHIP.z + 1.55),   // the lid (while it is still on)
    new THREE.Vector3(CHIP.x + 0.6, top + 0.06, CHIP.z + 0.75),    // the die
    new THREE.Vector3(CHIP.x - 1.6, top, CHIP.z + 1.95),           // the small parts round it
  ];
  return { group, set, beadAt, anchors };
}
