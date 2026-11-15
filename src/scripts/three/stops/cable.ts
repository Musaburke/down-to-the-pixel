/* Stop 3, the cable: a braided lead, cut away like a technical drawing so the wires inside show. The braid and the
   jacket stop and start again around a window; in the window two power wires run straight and the data pair twists
   round itself. Pulses ride the data pair. Real scale: one unit is about 10 mm, so the lead is about 4 mm across. */
import * as THREE from 'three';

const R_SLEEVE = 0.21, R_JACKET = 0.168, R_WIRE = 0.038;
// Arc-length places along the lead (0..1) where the braid and the jacket are cut back.
const BRAID = [0.447, 0.5855], JACKET = [0.461, 0.5575];
export const UNDER_SWITCH = 0.2285, RIDE_END = 0.535; // where the bead lands on the lead, and where it is when the stop ends
const TWIST = 72; // data pair: full turns over the whole lead (about one turn every 10 mm)

/** Part of a curve between two arc-length places, as a curve of its own. */
class Sub extends THREE.Curve<THREE.Vector3> {
  // `raw` samples by parameter: the wires are already parameterised by the spine's arc length, and their own
  // arc-length table would be far too coarse for ninety-odd turns.
  constructor(private c: THREE.Curve<THREE.Vector3>, private a: number, private b: number, private raw = false) { super(); if (raw) this.arcLengthDivisions = 8000; } // tangents and tube frames read this table too
  override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 { const u = this.a + (this.b - this.a) * t; return this.raw ? this.c.getPoint(u, out) : this.c.getPointAt(u, out); }
}

export interface Cable {
  group: THREE.Group;
  /** Where the bead is at place u (0..1) along the lead, riding the first data wire. */
  beadAt: (u: number, out: THREE.Vector3) => THREE.Vector3;
  /** Bits run along the data pair; `flow` moves them (scroll plus a slow drift in time), `glow` lights them. */
  setFlow: (flow: number, glow: number) => void;
  /** Anchors for the engraved labels, in world space. */
  anchors: { braid: THREE.Vector3; pair: THREE.Vector3; power: THREE.Vector3 };
  spine: THREE.CatmullRomCurve3;
}
interface CableOptions { sleeve: THREE.MeshPhysicalMaterial }

export function buildCable(o: CableOptions): Cable {
  const group = new THREE.Group();
  // Comes out of the dark on the left, passes just under the switch (the bead drops onto it there), settles and runs
  // on into the dark on the right. Neither end is ever in frame.
  const route: [number, number, number][] = [[-16, -3.3, -0.6], [-8, -3.32, -0.1], [-2, -3.36, 0.15], [1.2, -3.45, 0.2], [4.2, -4.1, 0.18], [7.5, -5.3, 0.05], [11, -5.78, 0],
    [15, -5.8, 0.04], [19, -5.75, -0.03], [23, -5.79, 0.06], [28, -5.82, -0.05], [34, -5.76, 0.08], [42, -5.84, -0.08], [56, -5.8, 0.12]];
  const spine = new THREE.CatmullRomCurve3(route.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  spine.arcLengthDivisions = 3000;
  const L = spine.getLength();

  // A steady frame along the lead (no Frenet flips): side and up turn with the tangent only.
  const frame = (u: number, t: THREE.Vector3, side: THREE.Vector3, up: THREE.Vector3) => {
    spine.getTangentAt(u, t); side.set(0, 1, 0).cross(t).normalize(); up.copy(t).cross(side).normalize();
  };
  const tv = new THREE.Vector3(), sv = new THREE.Vector3(), uv = new THREE.Vector3();
  /** A wire as a curve: offset from the spine by (x, y) in the lead's frame, plus an optional twist about a centre. */
  const wire = (ox: number, oy: number, twist = 0, phase = 0, rr = 0) => new (class extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    override getPoint(t: number, out = new THREE.Vector3()) {
      spine.getPointAt(t, out); frame(t, tv, sv, uv);
      const a = t * TWIST * Math.PI * 2 * twist + phase;
      return out.addScaledVector(sv, ox + rr * Math.cos(a)).addScaledVector(uv, oy + rr * Math.sin(a));
    }
  })();

  /* ---------- braid and jacket, cut back around the window ---------- */
  const tube = (a: number, b: number, r: number, mat: THREE.Material, perUnit: number, radial = 28) => {
    const g = new THREE.TubeGeometry(new Sub(spine, a, b), Math.max(8, Math.round((b - a) * L * perUnit)), r, radial, false);
    const uvs = g.attributes.uv!, len = (b - a) * L;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * len / 0.3, uvs.getY(i) * 6); // a crossing every 3 mm, six round the lead
    const m = new THREE.Mesh(g, mat); group.add(m); return m;
  };
  const sleeve = o.sleeve.clone(); sleeve.transparent = false; sleeve.bumpScale = 0.7; sleeve.bumpMap = o.sleeve.bumpMap; sleeve.color.set(0xc4b79e); sleeve.sheen = 0.7;
  const jacket = new THREE.MeshPhysicalMaterial({ color: 0x2b2622, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.32, sheen: 0.4, sheenColor: 0x8a6e52 });
  tube(0, BRAID[0]!, R_SLEEVE, sleeve, 30); tube(BRAID[1]!, 1, R_SLEEVE, sleeve, 30);
  tube(BRAID[0]! - 0.004, JACKET[0]!, R_JACKET, jacket, 30); tube(JACKET[1]!, BRAID[1]! + 0.004, R_JACKET, jacket, 30);
  // Clean cut faces: an annulus where each layer ends, so the cut reads as a section through a solid cable.
  const cut = (u: number, rOut: number, rIn: number, mat: THREE.Material, facing: 1 | -1) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40, 1), mat);
    spine.getPointAt(u, m.position); m.lookAt(m.position.clone().addScaledVector(spine.getTangentAt(u), facing)); group.add(m);
  };
  const frayed = new THREE.MeshStandardMaterial({ color: 0xbfb39b, roughness: 0.95, side: THREE.DoubleSide });
  cut(BRAID[0]!, R_SLEEVE, R_JACKET, frayed, 1); cut(BRAID[1]!, R_SLEEVE, R_JACKET, frayed, -1);
  // The jacket is a tube with a wall: its cut shows a ring, and inside it the dark filler the wires are packed in, set back a little.
  const jacketCut = new THREE.MeshStandardMaterial({ color: 0x2c2825, roughness: 0.62, side: THREE.DoubleSide });
  const filler = new THREE.MeshStandardMaterial({ color: 0x0f0d0c, roughness: 0.95, side: THREE.DoubleSide });
  cut(JACKET[0]!, R_JACKET, R_JACKET - 0.024, jacketCut, 1); cut(JACKET[1]!, R_JACKET, R_JACKET - 0.024, jacketCut, -1);
  cut(JACKET[0]! - 0.0005, R_JACKET - 0.02, 0, filler, 1); cut(JACKET[1]! + 0.0005, R_JACKET - 0.02, 0, filler, -1);
  // Where the braid is cut, its strands spring out a little: short fibres, slightly splayed, uneven in length.
  const strandGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 1, 4, 1); strandGeo.translate(0, 0.5, 0);
  const fray = new THREE.InstancedMesh(strandGeo, sleeve, 320); group.add(fray);
  { const r = (() => { let s = 31; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(), d = new THREE.Object3D(), t = new THREE.Vector3(), sd = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < 320; i++) {
      const end = i % 2, u = BRAID[end]!, dir = end ? -1 : 1, a = r() * Math.PI * 2; frame(u, t, sd, up);
      spine.getPointAt(u, d.position); d.position.addScaledVector(sd, Math.cos(a) * (R_SLEEVE - 0.012)).addScaledVector(up, Math.sin(a) * (R_SLEEVE - 0.012));
      const out = sd.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)), aim = t.clone().multiplyScalar(dir).addScaledVector(out, 0.2 + r() * 0.45).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim); d.quaternion.copy(q); d.scale.set(1, 0.008 + r() * r() * 0.05, 1); d.updateMatrix(); fray.setMatrixAt(i, d.matrix);
    } }

  /* ---------- the wires in the window: insulation in the scene's palette, bare copper seen only at the cut ends ---------- */
  const insul = (c: number) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
  const span = [JACKET[0]! - 0.002, JACKET[1]! + 0.002] as const, spanLen = (span[1] - span[0]) * L;
  // Where the wires leave the jacket they sit in its shadow: darken the first and last few millimetres.
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
    const g = new THREE.TubeGeometry(new Sub(c, span[0], span[1], true), Math.round((span[1] - span[0]) * L * 90), R_WIRE, 20, false);
    const m = new THREE.Mesh(g, mat); group.add(m); return m;
  };
  const DATA_R = 0.04; // the data pair twists about the middle; power sits above it and ground below, so all four show from the side
  const dataA = wire(0.01, -0.01, 1, 0, DATA_R), dataB = wire(0.01, -0.01, 1, Math.PI, DATA_R);
  const powerA = wire(0.0, 0.112), powerB = wire(0.02, -0.128);
  const dataMatA = insul(0xe2d6c0), dataMatB = insul(0xa8916a);
  wireMesh(dataA, dataMatA); wireMesh(dataB, dataMatB);       // the data pair: ivory and gold
  wireMesh(powerA, contact(insul(0x1d1b19))); wireMesh(powerB, contact(insul(0x5a4434)));     // power above, ground below: carbon and coffee

  /* ---------- pulses: the data pair's insulation lights in moving packets of bits ---------- */
  // The pair carries the signal as opposites: where one wire is lit the other is dark, and the receiver reads the
  // difference. Each wire's material reads one shared flow value, so this costs no extra draw.
  const uFlow = { value: 0 }, uGlow = { value: 0 }, wireLen = spanLen;
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
    mat.customProgramCacheKey = () => (invert ? 'cable-b2' : 'cable-a2');
    return mat;
  };
  signal(contact(dataMatA), false); signal(contact(dataMatB), true);
  const setFlow = (flow: number, glow: number) => { uFlow.value = flow * wireLen * 2; uGlow.value = glow; };

  group.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true; });
  const beadAt = (u: number, out: THREE.Vector3) => (u < span[0] || u > span[1] ? spine.getPointAt(u, out).addScaledVector(uv.set(0, 1, 0), R_SLEEVE + 0.02) : dataA.getPoint(u, out));
  const mid = (JACKET[0]! + JACKET[1]!) / 2;
  const anchors = { braid: spine.getPointAt(BRAID[0]! - 0.006).add(new THREE.Vector3(0, R_SLEEVE * 0.9, 0)), pair: dataA.getPoint(mid - 0.035), power: powerA.getPoint(mid + 0.012) };
  return { group, beadAt, setFlow, anchors, spine };
}
