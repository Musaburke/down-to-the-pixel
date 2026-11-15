/* The keyboard: a walnut case with a brass plate lip, sculpted caps with a legend on every key, and a coiled cable.
   Caps are instanced per width and colourway; legends are one instanced decal reading one atlas. */
import * as THREE from 'three';
import { DISH, roundBox, loop, sweep, face, join, boxUV } from '../geometry.ts';
import { tex } from '../textures.ts';

export const DESK_Y = -1.75; // desk top; one unit is about 10 mm
export const PLATE_Y = 0.08, CAP_Y = 0.72, RIM_Y = 0.74;
export const CAP = { w: 1.8, h: 0.78, r: 0.13, taper: 0.22, dish: 0.08 };
export const PITCH = 1.92, GAP = 0.12, INSET = (CAP.w / 2) * CAP.taper;
export const BOARD = { x: 4.8, z: -3.36, w: 43.2, d: 12.48 }; // the key field: 22.5 by 6.5 key units

export type Tone = 'ivory' | 'carbon' | 'gold';
interface Key { l: string; x: number; y: number; w: number; h: number }
type Item = string | [string, number?, number?, number?];

export const KEYS: Key[] = (() => { // in key units; the M sits at x 8.25, y 4.5
  const out: Key[] = [], ch = (t: string): Item[] => [...t];
  const row = (y: number, items: Item[]) => { let x = 0; items.forEach((it) => { const [l, w = 1, h = 1, gap = 0] = Array.isArray(it) ? it : [it]; x += gap; out.push({ l, x, y, w, h }); x += w; }); };
  row(0, ['Esc', ['F1', 1, 1, 1], 'F2', 'F3', 'F4', ['F5', 1, 1, 0.5], 'F6', 'F7', 'F8', ['F9', 1, 1, 0.5], 'F10', 'F11', 'F12', ['PrtSc', 1, 1, 0.25], 'ScrLk', 'Pause']);
  row(1.5, [...ch('`1234567890-='), ['Back', 2], ['Ins', 1, 1, 0.25], 'Home', 'PgUp', ['Num', 1, 1, 0.25], '/', '*', '-']);
  row(2.5, [['Tab', 1.5], ...ch('QWERTYUIOP[]'), ['\\', 1.5], ['Del', 1, 1, 0.25], 'End', 'PgDn', ['7', 1, 1, 0.25], '8', '9', ['+', 1, 2]]);
  row(3.5, [['Caps', 1.75], ...ch("ASDFGHJKL;'"), ['Enter', 2.25], ['4', 1, 1, 3.5], '5', '6']);
  row(4.5, [['Shift', 2.25], ...ch('ZXCVBNM,./'), ['Shift', 2.75], ['↑', 1, 1, 1.25], ['1', 1, 1, 1.25], '2', '3', ['Ent', 1, 2]]);
  row(5.5, [['Ctrl', 1.25], ['Super', 1.25], ['Alt', 1.25], ['', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25], ['←', 1, 1, 0.25], '↓', '→', ['0', 2, 1, 0.25], '.']);
  return out;
})();
const GOLD = new Set(['Esc', '←', '↓', '→', '↑']);
export const tone = (k: Key): Tone => (GOLD.has(k.l) || (k.l === 'Enter' && k.w > 2) ? 'gold' : k.l.length === 1 || k.w > 6 ? 'ivory' : 'carbon');
const INK: Record<Tone, string> = { ivory: '#2a2622', carbon: '#fff8ea', gold: '#3a2f19' };
// Sculpted rows: the far rows stand taller and lean towards the hands, the near row leans away. The M's row is the reference.
const ROW: Record<string, [number, number]> = { 0: [0.46, 12], 1.5: [0.4, 11], 2.5: [0.2, 7], 3.5: [0.05, 3], 4.5: [0, 0], 5.5: [0.1, -6] };
// The keys a typist hits most carry a faint shine on top.
const WEAR: Record<string, number> = { '': 0.9, E: 0.7, T: 0.5, A: 0.65, O: 0.5, I: 0.5, N: 0.6, S: 0.6, R: 0.45, H: 0.4, L: 0.4, D: 0.45, Back: 0.6, Enter: 0.55, Shift: 0.4, Ctrl: 0.35, Tab: 0.3 };

/** The hero cap's geometry and its legend decal, shared with the board so every cap matches it. */
export const capGeo = (): THREE.BufferGeometry => roundBox(CAP.w, CAP.h, CAP.w, CAP.r, { taper: CAP.taper, dish: CAP.dish });
export const decalGeo = (): THREE.BufferGeometry => {
  const g = new THREE.PlaneGeometry(0.62, 0.62, 12, 1); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position!, hx = (CAP.w / 2) * (1 - CAP.taper);
  for (let i = 0; i < pos.count; i++) pos.setY(i, CAP.h + DISH(pos.getX(i), hx, CAP.dish) + 0.004);
  g.computeVertexNormals(); return g;
};

/** Caps read their own occlusion (`ao`, per vertex) and wear (`wear`, per instance). `uAO` turns the occlusion off
    for a cap that has left the board. */
export function sculpt<T extends THREE.Material>(mat: T, uAO: { value: number }): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAO = uAO;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao; attribute float wear; varying float vAO; varying float vWear;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao; vWear = wear * smoothstep(0.55, 0.9, normal.y);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAO; varying float vAO; varying float vWear;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.45 + 0.55 * vAO, uAO);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.4 * vWear;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nfloat capOcc = mix(1.0, vAO, uAO); reflectedLight.indirectDiffuse *= capOcc; reflectedLight.indirectSpecular *= capOcc;');
  };
  return mat;
}

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export interface BoardOptions {
  capMats: Record<Tone, THREE.Material>;
  wood: THREE.Material; brass: THREE.Material; housing: THREE.Material; bed: THREE.Material; sleeve: THREE.Material; metal: THREE.Material; shade: THREE.Material;
}
export interface Board {
  group: THREE.Group;
  /** Meshes that go with the caps (they fade first on the way into the switch). */
  caps: THREE.Object3D[];
  legendMat: THREE.MeshLambertMaterial;
  wood: THREE.Mesh;
  redrawLegends: () => void;
}

export function buildBoard(o: BoardOptions): Board {
  const group = new THREE.Group(), caps: THREE.Object3D[] = [];
  const rnd = mulberry(1513);
  const keyAt = (k: Key, v: THREE.Vector3) => v.set((k.x + k.w / 2 - 8.75) * PITCH, CAP_Y, (k.y + k.h / 2 - 5) * PITCH);
  const board = KEYS.filter((k) => k.l !== 'M'); // the M is the hero cap, built by the walkthrough

  /* ---------- case: one walnut block, chamfered, with a brass lip around the key field ---------- */
  const outer = loop(BOARD.w + 4.3, BOARD.d + 4.3, 1.15, 14), inner = loop(BOARD.w + 0.5, BOARD.d + 0.5, 0.4, 8);
  const foot = DESK_Y + 0.14, LIP = 0.17;
  const shell = sweep(outer, [[-0.45, foot], [-0.4, foot + 0.06], [0, foot + 0.42], [0, RIM_Y - 0.4], [-0.04, RIM_Y - 0.34], [-0.34, RIM_Y - 0.04], [-0.4, RIM_Y]]);
  const well = sweep(inner, [[LIP + 0.05, RIM_Y], [LIP + 0.01, RIM_Y - 0.04], [LIP + 0.01, RIM_Y - 0.09]]); // the wood's inner edge, down to the brass
  const base = face(outer, foot, undefined, -0.45); // the underside closes the block, so the lamp cannot shine through it
  { const ix = base.index!, n = base.attributes.normal!; for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i); ix.setX(i, ix.getX(i + 1)); ix.setX(i + 1, a); } for (let i = 0; i < n.count; i++) n.setY(i, -1); }
  const wood = new THREE.Mesh(join([shell, face(outer, RIM_Y, inner, -0.4, LIP + 0.05), well, base]), o.wood);
  wood.position.set(BOARD.x, 0, BOARD.z); boxUV(wood, 28); // a tight tile keeps the grain sharp at the hero distance
  const lip = sweep(inner, [[LIP + 0.01, RIM_Y - 0.06], [0.03, RIM_Y - 0.06], [0, RIM_Y - 0.09], [0, PLATE_Y]]); // brass: level lip, eased edge, wall down to the plate
  const plate = new THREE.Mesh(lip, o.brass);
  const bed = new THREE.Mesh(face(inner, PLATE_Y), o.bed); bed.position.set(BOARD.x, 0, BOARD.z); bed.receiveShadow = true; // the dark plate the switches clip into
  plate.position.copy(wood.position);
  group.add(wood, plate, bed); // rubber feet lift the case a hair off the desk: the gap under it reads as a dark line

  /* ---------- caps ---------- */
  const batches = new Map<string, Key[]>();
  board.forEach((k) => { const id = `${k.w}x${k.h}|${tone(k)}`; batches.set(id, [...(batches.get(id) ?? []), k]); });
  const dummy = new THREE.Object3D(), kv = new THREE.Vector3(), pose = new Map<Key, THREE.Matrix4>();
  board.forEach((k) => {
    const [lift, lean] = ROW[String(k.y)] ?? [0, 0];
    dummy.position.copy(keyAt(k, kv)); dummy.position.y += lift + (rnd() - 0.5) * 0.012;
    dummy.rotation.set(THREE.MathUtils.degToRad(lean + (rnd() - 0.5) * 0.5), THREE.MathUtils.degToRad((rnd() - 0.5) * 0.7), THREE.MathUtils.degToRad((rnd() - 0.5) * 0.5));
    dummy.updateMatrix(); pose.set(k, dummy.matrix.clone());
  });
  batches.forEach((list, id) => {
    const k0 = list[0]!, t = id.split('|')[1] as Tone, space = k0.w > 6;
    const geo = roundBox(k0.w * PITCH - GAP, CAP.h, k0.h * PITCH - GAP, CAP.r, { inset: INSET, dish: space ? -0.03 : CAP.dish,  seg: [k0.w > 2 ? 22 : 14, 7, k0.h > 1 ? 20 : 14] });
    geo.setAttribute('wear', new THREE.InstancedBufferAttribute(new Float32Array(list.map((k) => (WEAR[k.l] ?? 0) * (0.7 + rnd() * 0.3))), 1));
    const m = new THREE.InstancedMesh(geo, o.capMats[t], list.length);
    const tint = new THREE.Color();
    list.forEach((k, i) => { m.setMatrixAt(i, pose.get(k)!); const v = 0.955 + rnd() * 0.09; m.setColorAt(i, tint.setRGB(v, v * (0.992 + rnd() * 0.016), v * (0.985 + rnd() * 0.02))); }); // no two caps come out of the mould quite alike
    m.renderOrder = 1; m.castShadow = m.receiveShadow = true; group.add(m); caps.push(m);
  });
  // A dark switch housing under every cap, so the gaps between caps look down onto something.
  const housings = new THREE.InstancedMesh(roundBox(1.42, 0.4, 1.42, 0.06, { taper: 0.12, seg: [4, 3, 4] }), o.housing, board.length);
  board.forEach((k, i) => { dummy.position.copy(keyAt(k, kv)); dummy.position.y = PLATE_Y; dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); housings.setMatrixAt(i, dummy.matrix); });
  housings.receiveShadow = housings.castShadow = true; group.add(housings); caps.push(housings); caps.push(bed);

  /* ---------- legends: one atlas, one instanced decal that takes the scene's light ---------- */
  const labelled = board.filter((k) => k.l);
  const LEG = [...new Set(labelled.map((k) => k.l))], COLS = 10, CELL = 204;
  const atlas = () => tex(COLS * CELL, (g) => {
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    LEG.forEach((l, i) => { const size = CELL * (l.length > 3 ? 0.25 : l.length > 2 ? 0.3 : l.length > 1 ? 0.38 : 0.52);
      g.font = `500 ${size}px "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif`; g.fillText(l, (i % COLS + 0.5) * CELL, (Math.floor(i / COLS) + 0.53) * CELL); });
  });
  const legendMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: atlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  legendMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect; attribute vec3 ink; varying vec2 vLeg; varying vec3 vInk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeg = uvRect.xy + uv * uvRect.zw; vInk = ink;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLeg; varying vec3 vInk;')
      .replace('#include <map_fragment>', 'float legA = texture2D(map, vLeg).a; if (legA < 0.02) discard; diffuseColor = vec4(vInk, legA * opacity);');
  };
  const legendGeo = decalGeo(), uvRect = new Float32Array(labelled.length * 4), inkArr = new Float32Array(labelled.length * 3), inkC = new THREE.Color();
  const legendMesh = new THREE.InstancedMesh(legendGeo, legendMat, labelled.length);
  labelled.forEach((k, i) => {
    const c = LEG.indexOf(k.l); uvRect.set([(c % COLS) / COLS, 1 - (Math.floor(c / COLS) + 1) / COLS, 1 / COLS, 1 / COLS], i * 4);
    inkC.set(INK[tone(k)]); inkArr.set([inkC.r, inkC.g, inkC.b], i * 3);
    legendMesh.setMatrixAt(i, pose.get(k)!);
  });
  legendGeo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(uvRect, 4));
  legendGeo.setAttribute('ink', new THREE.InstancedBufferAttribute(inkArr, 3));
  legendMesh.renderOrder = 3; legendMesh.frustumCulled = false; legendMesh.receiveShadow = true; group.add(legendMesh); caps.push(legendMesh);

  /* ---------- cable: a USB-C plug at the back, a coiled lead across the desk, a brass connector in line ---------- */
  const R = 0.2, COIL = 0.44, back = BOARD.z - (BOARD.d + 4.3) / 2, deskLine = DESK_Y + R;
  const JOIN = new THREE.Vector3(-41.5, DESK_Y + 0.42, back - 19.2); // past the coil, well clear of the board // the in-line connector rests on the desk here
  const route: [number, number, number][] = [[-9, -1.05, back - 1.5], [-9.1, -1.4, back - 3.4], [-9.4, deskLine, back - 6], [-10.8, deskLine, back - 9.6], [-13.5, deskLine, back - 12.6], [-17, deskLine, back - 14.4],
    [-22, deskLine, back - 15.2], [-27.5, deskLine, back - 14.7], [-33, deskLine, back - 15], [-37.5, deskLine + 0.1, back - 16.6], [JOIN.x, JOIN.y, JOIN.z], [-46, deskLine, back - 22.5], [-55, deskLine, back - 26.5], [-72, deskLine, back - 28]];
  const spine = new THREE.CatmullRomCurve3(route.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const T0 = 0.3, T1 = 0.5, TURNS = 24, up = new THREE.Vector3(0, 1, 0);
  class Lead extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); this.arcLengthDivisions = 3000; }
    override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
      spine.getPointAt(t, out);
      const u = (t - T0) / (T1 - T0); if (u <= 0 || u >= 1) return out;
      const env = THREE.MathUtils.smoothstep(u, 0, 0.05) * (1 - THREE.MathUtils.smoothstep(u, 0.95, 1)), a = (u + 0.006 * Math.sin(u * 31) + 0.004 * Math.sin(u * 83)) * TURNS * Math.PI * 2, rr = COIL * env * (1 + 0.05 * Math.sin(u * 47)); // hand-wound: the turns are not quite even
      const side = spine.getTangentAt(t).cross(up).normalize();
      return out.addScaledVector(up, rr * (1 - Math.cos(a))).addScaledVector(side, rr * Math.sin(a));
    }
  }
  const lead = new Lead();
  const cable = new THREE.Mesh(new THREE.TubeGeometry(lead, 1500, R, 8, false), o.sleeve);
  { const uv = cable.geometry.attributes.uv!, n = lead.getLength() / 1.2; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * n, uv.getY(i) * 2); } // the braid repeats every 12 mm
  const plug = new THREE.Mesh(roundBox(1.25, 0.66, 2.3, 0.2, { seg: [6, 6, 6] }), o.metal); plug.position.set(-9, -1.05 - 0.33, back - 0.75);
  const port = new THREE.Mesh(roundBox(0.98, 0.36, 0.5, 0.17, { seg: [6, 4, 2] }), o.shade); port.position.set(-9, -1.05 - 0.18, back + 0.26); // the socket's dark mouth, flush in the wood
  const turned: [number, number][] = [[0.2, -1.5], [0.32, -1.42], [0.36, -1.1], [0.36, -0.5], [0.42, -0.46], [0.42, 0.3], [0.36, 0.34], [0.36, 1.1], [0.32, 1.42], [0.2, 1.5]];
  const barrel = new THREE.Mesh(new THREE.LatheGeometry(turned.map(([x, y]) => new THREE.Vector2(x, y)), 28), o.metal);
  barrel.position.copy(JOIN); barrel.quaternion.setFromUnitVectors(up, new THREE.Vector3(-8.5, 0, -5.9).normalize());
  [cable, plug, barrel, wood, plate].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  plate.receiveShadow = false; // a thin polished lip: filtered shadow noise would show on it as a pattern
  const lie = new THREE.Mesh(new THREE.TubeGeometry(spine, 300, R * 2.6, 6, false), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  { const p = lie.geometry.attributes.position!; for (let i = 0; i < p.count; i++) p.setY(i, DESK_Y + 0.012); } // the cable's contact shadow, pressed flat on the desk
  group.add(port); // Musa, 15 Nov 2026: no cable on the desk. The lead, plug and connector stay built for the cable stop

  const redrawLegends = () => { const prev = legendMat.map; legendMat.map = atlas(); prev?.dispose(); };
  return { group, caps, legendMat, wood, redrawLegends };
}
