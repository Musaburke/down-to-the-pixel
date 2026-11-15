/* Stop 3, the cable: a braided lead that falls straight down from the switch, so scrolling down follows it down.
   Partway it is stripped in steps like a cable diagram (braid, then jacket, then a foil shield, then the wires), and
   it ends in a walnut-and-brass USB-C plug that the bead runs into. Pulses ride the data pair. Real scale: one unit
   is about 10 mm, so the lead is about 4 mm across. */
import * as THREE from 'three';
import { roundBox } from '../geometry.ts';
import { tex } from '../textures.ts';

const R_SLEEVE = 0.21, R_JACKET = 0.168, R_FOIL = 0.14, R_WIRE = 0.038;
const TURN = 0.9; // one full twist of the data pair every 9 mm
// The stripped window, by height: each layer is cut back a little further than the one outside it.
const STEP = { braid: [-10, -18.6], jacket: [-10.55, -18.05], foil: [-11.1, -17.5] } as const;
export const PLUG_TOP = -23.6; // the lead ends in the plug's boot here

/** Part of a curve between two arc-length places, as a curve of its own. */
class Sub extends THREE.Curve<THREE.Vector3> {
  // `raw` samples by parameter: the wires are already parameterised by the spine's arc length, and their own
  // arc-length table would be far too coarse for dozens of turns.
  constructor(private c: THREE.Curve<THREE.Vector3>, private a: number, private b: number, private raw = false) { super(); if (raw) this.arcLengthDivisions = 8000; } // tangents and tube frames read this table too
  override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 { const u = this.a + (this.b - this.a) * t; return this.raw ? this.c.getPoint(u, out) : this.c.getPointAt(u, out); }
}

export interface Cable {
  group: THREE.Group;
  /** Where the bead is at place u along the lead: 0 is under the switch, 1 the top of the plug, up to 1.2 inside the plug. */
  beadAt: (u: number, out: THREE.Vector3) => THREE.Vector3;
  /** Bits run along the data pair; `flow` moves them (scroll plus a slow drift in time), `glow` lights them. */
  setFlow: (flow: number, glow: number) => void;
  /** Anchors for the engraved labels, in world space. */
  anchors: THREE.Vector3[];
  /** The place along the lead at height y (past 1 once y is below the top of the plug). */
  uAt: (y: number) => number;
}
interface CableOptions { sleeve: THREE.MeshPhysicalMaterial; wood: THREE.Material; brass: THREE.Material }

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Crinkled foil as a height map: overlapping soft creases at random angles. */
const crinkle = () => tex(256, (g, n) => {
  const r = mulberry(9); g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) { const x = r() * n, y = r() * n, a = r() * Math.PI, l = 10 + r() * 60, v = Math.round(90 + r() * 90);
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}, { repeat: 1 });

export function buildCable(o: CableOptions): Cable {
  const group = new THREE.Group();
  // Tucked under the switch, it falls with a slight, unhurried sway and ends in the plug.
  const route: [number, number, number][] = [[0, -2.3, 0], [0.04, -4, 0.04], [0.16, -7, 0.1], [0.08, -10, -0.04], [0.2, -14, 0.06], [0.12, -18, -0.04], [0.22, -21.5, 0.05], [0.18, PLUG_TOP, 0]];
  const spine = new THREE.CatmullRomCurve3(route.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  spine.arcLengthDivisions = 3000;
  const L = spine.getLength();
  const atY = (y: number) => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (spine.getPointAt(m).y > y) a = m; else b = m; } return (a + b) / 2; };
  const BRAID = STEP.braid.map(atY), JACKET = STEP.jacket.map(atY), FOIL = STEP.foil.map(atY);

  // A steady frame along the lead: `side` runs across the screen, `up` points at the camera.
  const frame = (u: number, t: THREE.Vector3, side: THREE.Vector3, up: THREE.Vector3) => {
    spine.getTangentAt(u, t); side.set(0, 0, 1).cross(t).normalize(); up.copy(t).cross(side).normalize();
  };
  const tv = new THREE.Vector3(), sv = new THREE.Vector3(), uv = new THREE.Vector3();
  const turns = L / TURN;
  /** A wire as a curve: offset from the spine by (x, y) in the lead's frame, plus an optional twist about a centre. */
  const wire = (ox: number, oy: number, twist = 0, phase = 0, rr = 0) => new (class extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    override getPoint(t: number, out = new THREE.Vector3()) {
      spine.getPointAt(t, out); frame(t, tv, sv, uv);
      const a = t * turns * Math.PI * 2 * twist + phase;
      return out.addScaledVector(sv, ox + rr * Math.cos(a)).addScaledVector(uv, oy + rr * Math.sin(a));
    }
  })();

  /* ---------- the layers, each cut back a step further than the one outside it ---------- */
  const tube = (a: number, b: number, r: number, mat: THREE.Material, around = 6, every = 0.3) => {
    const g = new THREE.TubeGeometry(new Sub(spine, a, b), Math.max(8, Math.round((b - a) * L * 30)), r, 32, false);
    const uvs = g.attributes.uv!, len = (b - a) * L;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * len / every, uvs.getY(i) * around);
    const m = new THREE.Mesh(g, mat); group.add(m); return m;
  };
  const sleeve = o.sleeve.clone(); sleeve.transparent = false; sleeve.bumpScale = 0.7; sleeve.bumpMap = o.sleeve.bumpMap; sleeve.color.set(0xc4b79e); sleeve.sheen = 0.7;
  const jacket = new THREE.MeshPhysicalMaterial({ color: 0x2b2622, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.32, sheen: 0.4, sheenColor: 0x8a6e52 });
  const foilBump = crinkle(); foilBump.wrapS = foilBump.wrapT = THREE.RepeatWrapping;
  const foil = new THREE.MeshPhysicalMaterial({ color: 0xd8bf8a, metalness: 1, roughness: 0.26, bumpMap: foilBump, bumpScale: 1.6, envMapIntensity: 1.3 }); // the shield: thin metallised foil wrapped round the wires
  tube(0, BRAID[0]!, R_SLEEVE, sleeve); tube(BRAID[1]!, 1, R_SLEEVE, sleeve);
  tube(BRAID[0]! - 0.004, JACKET[0]!, R_JACKET, jacket); tube(JACKET[1]!, BRAID[1]! + 0.004, R_JACKET, jacket);
  tube(JACKET[0]! - 0.004, FOIL[0]!, R_FOIL, foil, 3, 0.5); tube(FOIL[1]!, JACKET[1]! + 0.004, R_FOIL, foil, 3, 0.5);
  // Cut faces: an annulus where each layer ends, so every cut reads as a section through a solid cable.
  const cut = (u: number, rOut: number, rIn: number, mat: THREE.Material, facing: 1 | -1) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40, 1), mat);
    spine.getPointAt(u, m.position); m.lookAt(m.position.clone().addScaledVector(spine.getTangentAt(u), facing)); group.add(m);
  };
  const frayed = new THREE.MeshStandardMaterial({ color: 0xbfb39b, roughness: 0.95, side: THREE.DoubleSide });
  const jacketCut = new THREE.MeshStandardMaterial({ color: 0x2c2825, roughness: 0.62, side: THREE.DoubleSide });
  const filler = new THREE.MeshStandardMaterial({ color: 0x0f0d0c, roughness: 0.95, side: THREE.DoubleSide });
  ([[0, 1], [1, -1]] as const).forEach(([k, f]) => {
    cut(BRAID[k]!, R_SLEEVE, R_JACKET, frayed, f);
    cut(JACKET[k]!, R_JACKET, R_FOIL, jacketCut, f);
    cut(FOIL[k]!, R_FOIL, R_FOIL - 0.006, foil, f);
    cut(FOIL[k]! - f * 0.0005, R_FOIL - 0.004, 0, filler, f); // the dark packing the wires sit in, just inside the foil
  });
  // Where the braid is cut, its strands spring out a little: short fibres, slightly splayed, uneven in length.
  const strandGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 1, 4, 1); strandGeo.translate(0, 0.5, 0);
  const fray = new THREE.InstancedMesh(strandGeo, sleeve, 320); group.add(fray);
  { const r = mulberry(31), d = new THREE.Object3D(), t = new THREE.Vector3(), sd = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < 320; i++) {
      const end = i % 2, u = BRAID[end]!, dir = end ? -1 : 1, a = r() * Math.PI * 2; frame(u, t, sd, up);
      spine.getPointAt(u, d.position); d.position.addScaledVector(sd, Math.cos(a) * (R_SLEEVE - 0.012)).addScaledVector(up, Math.sin(a) * (R_SLEEVE - 0.012));
      const out = sd.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)), aim = t.clone().multiplyScalar(dir).addScaledVector(out, 0.2 + r() * 0.45).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim); d.quaternion.copy(q); d.scale.set(1, 0.008 + r() * r() * 0.05, 1); d.updateMatrix(); fray.setMatrixAt(i, d.matrix);
    } }

  /* ---------- the wires: power and ground either side, the data pair twisted between them ---------- */
  const insul = (c: number) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
  const span = [FOIL[0]! - 0.002, FOIL[1]! + 0.002] as const, spanLen = (span[1] - span[0]) * L;
  // Where the wires leave the foil they sit in its shadow: darken the first and last few millimetres.
  function contact(mat: THREE.MeshPhysicalMaterial) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      if (!sh.vertexShader.includes('vAlong')) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAlong;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvAlong = uv.x * ${spanLen.toFixed(3)};`);
      if (!sh.fragmentShader.includes('varying float vAlong')) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlong;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.3, 1.0, smoothstep(0.0, 0.5, vAlong) * smoothstep(0.0, 0.5, ${spanLen.toFixed(3)} - vAlong));`);
    };
    return mat;
  }
  const wireMesh = (c: THREE.Curve<THREE.Vector3>, mat: THREE.Material) => {
    const g = new THREE.TubeGeometry(new Sub(c, span[0], span[1], true), Math.round(spanLen * 90), R_WIRE, 20, false);
    const m = new THREE.Mesh(g, mat); group.add(m); return m;
  };
  const DATA_R = 0.04;
  const dataA = wire(0, 0.01, 1, 0, DATA_R), dataB = wire(0, 0.01, 1, Math.PI, DATA_R);
  const power = wire(-0.092, -0.01), ground = wire(0.092, -0.01);
  const dataMatA = insul(0xe2d6c0), dataMatB = insul(0xa8916a);
  wireMesh(dataA, dataMatA); wireMesh(dataB, dataMatB);                            // the data pair: ivory and gold
  wireMesh(power, contact(insul(0x1d1b19))); wireMesh(ground, contact(insul(0x5a4434))); // power and ground: carbon and coffee

  /* ---------- pulses: the data pair's insulation lights in moving packets of bits ---------- */
  // The pair carries the signal as opposites: where one wire is lit the other is dark, and the receiver reads the
  // difference. Each wire's material reads one shared flow value, so this costs no extra draw.
  const uFlow = { value: 0 }, uGlow = { value: 0 };
  const signal = (mat: THREE.MeshPhysicalMaterial, invert: boolean) => {
    mat.emissive.set(0xffc27a);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r); // adds vAlong (the contact shadow)
      sh.uniforms.uFlow = uFlow; sh.uniforms.uGlow = uGlow;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFlow; uniform float uGlow;')
        .replace('#include <lights_fragment_begin>', `
          float x = vAlong - uFlow, packet = floor(x / 2.6), inPacket = step(fract(x / 2.6), 0.62); // packets of bits with quiet gaps
          float cell = floor(x / 0.07), bit = step(0.42, fract(sin(cell * 12.9898 + packet * 78.233) * 43758.5453));
          float edge = smoothstep(0.0, 0.5, fract(x / 0.07)) * smoothstep(0.0, 0.5, 1.0 - fract(x / 0.07)); // soft-edged: each bit swells and fades
          float round_ = 0.25 + 0.75 * pow(max(dot(normal, normalize(vViewPosition)), 0.0), 1.6); // brightest facing the eye, so the glow keeps the wire round
          float lit = inPacket * ${invert ? '(1.0 - bit)' : 'bit'} * edge;
          totalEmissiveRadiance *= lit * round_ * uGlow * 1.3;
          #include <lights_fragment_begin>`);
    };
    mat.customProgramCacheKey = () => (invert ? 'cable-b3' : 'cable-a3');
    return mat;
  };
  signal(contact(dataMatA), false); signal(contact(dataMatB), true);
  const setFlow = (flow: number, glow: number) => { uFlow.value = flow * spanLen * 2; uGlow.value = glow; };

  /* ---------- the plug: a ribbed cream boot, a walnut overmould like the keyboard's case, a brass USB-C shell ---------- */
  const plug = new THREE.Group(), end = spine.getPointAt(1), down = spine.getTangentAt(1);
  plug.position.copy(end); plug.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
  const ribs: [number, number][] = [[R_SLEEVE + 0.005, 0]];
  for (let i = 0; i < 9; i++) { const y = -0.1 - i * 0.09, r = R_SLEEVE + 0.03 + i * 0.012; ribs.push([r, y], [r + 0.025, y - 0.03], [r + 0.025, y - 0.05], [r, y - 0.08]); } // a flexing boot, ribbed so it can bend
  ribs.push([0.34, -0.95], [0.34, -1.0]);
  const boot = new THREE.Mesh(new THREE.LatheGeometry(ribs.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), 48), new THREE.MeshPhysicalMaterial({ color: 0xd3c6ac, roughness: 0.62, sheen: 0.5, sheenColor: 0xfff1d8 }));
  const body = new THREE.Mesh(roundBox(1.12, 1.9, 0.64, 0.18, { seg: [12, 12, 8] }), o.wood); body.position.y = -2.9;
  const collar = new THREE.Mesh(roundBox(0.98, 0.12, 0.5, 0.05, { seg: [8, 4, 6] }), o.brass); collar.position.y = -2.98; // corner radius under half the height, or roundBox breaks // a brass band where the shell meets the wood
  const shell = new THREE.Mesh(roundBox(0.83, 0.66, 0.25, 0.115, { seg: [14, 6, 10] }), o.brass); shell.position.y = -3.6;
  plug.add(boot, body, collar, shell); group.add(plug); plug.updateMatrixWorld(true);
  { const uvs = body.geometry; const p = uvs.attributes.position!, a = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { a[i * 2] = p.getX(i) / 0.6; a[i * 2 + 1] = p.getY(i) / 0.6; } uvs.setAttribute('uv', new THREE.BufferAttribute(a, 2)); } // grain runs down the body

  group.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true; });
  const toward = new THREE.Vector3(0, 0, 1);
  const beadAt = (u: number, out: THREE.Vector3) => {
    if (u > 1) return out.copy(end).addScaledVector(down, (u - 1) / 0.2 * 3.4).addScaledVector(toward, 0.36); // over the boot and down the plug's face
    return u < span[0] || u > span[1] ? spine.getPointAt(u, out).addScaledVector(toward, R_SLEEVE + 0.02) : dataA.getPoint(u, out);
  };
  const mid = (span[0] + span[1]) / 2;
  const anchors = [
    spine.getPointAt(BRAID[0]! - 0.004).addScaledVector(toward, R_SLEEVE * 0.6).add(new THREE.Vector3(-R_SLEEVE * 0.7, 0, 0)), // the braid
    spine.getPointAt((JACKET[0]! + FOIL[0]!) / 2).add(new THREE.Vector3(R_FOIL * 0.9, 0, 0.05)),                                  // the foil
    dataA.getPoint(mid - 0.04),                                                                                                     // the data pair
    plug.localToWorld(new THREE.Vector3(0.5, -2.4, 0)),                                                                             // the plug
  ];
  const uAt = (y: number) => (y > PLUG_TOP ? atY(y) : Math.min(1.2, 1 + (PLUG_TOP - y) / 3.4 * 0.2));
  return { group, beadAt, setFlow, anchors, uAt };
}
