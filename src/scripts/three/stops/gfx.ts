/* Stops 5 and 6, the graphics and the pixel. In the dark under the processor, the letter is drawn the way text is drawn on any screen:
   its outline comes from the font (points joined by lines), a grid of pixels is laid over it, and each pixel is
   filled by how much of the shape covers it, so the edge pixels are only partly lit. The letter is the keycap's own
   M, in the same typeface; the outline and the coverage both come from the browser drawing that glyph, so they match.
   Then (stop 6) the tiles sink back and the plate becomes a screen showing the same M; up close, one of its pixels
   opens into the three small lights every pixel is made of: red, green and blue, mixed by brightness into the warm
   cream of the letter. Lies flat, top of the letter toward -z. One unit is about 10 mm. */
import * as THREE from 'three';
import { roundBox } from '../geometry.ts';

const CELLS = 20, PITCH = 0.24, S = CELLS * PITCH;          // the pixel grid: 20 x 20 cells, 4.8 units across
export const DRAW = new THREE.Vector3(9, -48, -7.6);        // centre of the drawing, on the top of its plate
export const TARGET = { i: 9, j: 12 };                      // the pixel the last stop ends on: in the M's middle stroke (timeline.ts has its position)
const FONT = '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif'; // the keycap legend's typeface (textures.ts)
const R = 512;                                              // the canvas the outline is traced from

const canvas = (n: number) => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) throw new Error('2D canvas unavailable'); return [c, g] as const; };
const toWorld = (px: number, py: number, out = new THREE.Vector3()) => out.set(DRAW.x + (px / R - 0.5) * S, DRAW.y, DRAW.z + (py / R - 0.5) * S);

/** Draw the M into a canvas of side n, sized and centred the same way at any n, so the traced outline (512 px) and
    the pixel coverage (20 px) are the same shape. */
function drawM(g: CanvasRenderingContext2D, n: number) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n);
  g.setTransform(n / R, 0, 0, n / R, 0, 0);
  g.font = `500 ${R * 0.62}px ${FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const m = g.measureText('M'), w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const k = Math.min(R * 0.8 / w, R * 0.74 / h); // the letter fills about three-quarters of the grid
  g.translate(R / 2, R / 2); g.scale(k, k);
  g.fillStyle = '#fff'; g.fillText('M', -w / 2 + m.actualBoundingBoxLeft, h / 2 - m.actualBoundingBoxDescent);
}

/** The outline: trace the filled glyph's boundary (Moore neighbourhood), then keep only its corners (Ramer–Douglas–Peucker). */
function outline(): [number, number][] {
  const [, g] = canvas(R); drawM(g, R);
  const a = g.getImageData(0, 0, R, R).data, on = (x: number, y: number) => x >= 0 && y >= 0 && x < R && y < R && a[(y * R + x) * 4 + 3]! > 127;
  let sx = -1, sy = -1; for (let y = 0; y < R && sx < 0; y++) for (let x = 0; x < R; x++) if (on(x, y)) { sx = x; sy = y; break; }
  if (sx < 0) return [];
  const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]] as const;
  const pts: [number, number][] = [[sx, sy]]; let cx = sx, cy = sy, back = 0; // back: direction from the current pixel to the empty one we came from
  for (let step = 0; step < R * 40; step++) {
    let found = -1; for (let k = 1; k <= 8; k++) { const d = (back + k) % 8; if (on(cx + dirs[d]![0], cy + dirs[d]![1])) { found = d; break; } }
    if (found < 0) break;
    const prev = (found + 7) % 8, px = cx + dirs[prev]![0], py = cy + dirs[prev]![1];
    cx += dirs[found]![0]; cy += dirs[found]![1];
    back = dirs.findIndex(([dx, dy]) => dx === px - cx && dy === py - cy);
    if (cx === sx && cy === sy && pts.length > 2) break;
    pts.push([cx, cy]);
  }
  const rdp = (p: [number, number][], eps: number): [number, number][] => {
    if (p.length < 3) return p;
    const [ax, ay] = p[0]!, [bx, by] = p[p.length - 1]!, L = Math.hypot(bx - ax, by - ay) || 1; let best = 0, at = 0;
    for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((bx - ax) * (ay - p[i]![1]) - (ax - p[i]![0]) * (by - ay)) / L; if (d > best) { best = d; at = i; } }
    return best > eps ? [...rdp(p.slice(0, at + 1), eps).slice(0, -1), ...rdp(p.slice(at), eps)] : [p[0]!, p[p.length - 1]!];
  };
  let far = 0; pts.forEach(([x, y], i) => { if (Math.hypot(x - sx, y - sy) > Math.hypot(pts[far]![0] - sx, pts[far]![1] - sy)) far = i; });
  const loop = [...rdp(pts.slice(0, far + 1), 2.2).slice(0, -1), ...rdp([...pts.slice(far), pts[0]!], 2.2).slice(0, -1)];
  return loop;
}

/** How much of each cell the letter covers, 0..1: the browser's own anti-aliased drawing of the glyph at 20 px. */
function coverage(): Float32Array {
  const [, g] = canvas(CELLS); drawM(g, CELLS);
  const a = g.getImageData(0, 0, CELLS, CELLS).data, out = new Float32Array(CELLS * CELLS);
  for (let i = 0; i < out.length; i++) out[i] = a[i * 4 + 3]! / 255;
  return out;
}

/** The plate's top: dark warm laminate, and (as an emissive map) the grid lines between the pixels. */
function plateMaps(plate: number) {
  const n = 1024, [mc, m] = canvas(n), [gc, g] = canvas(n), seed = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  m.fillStyle = '#16110d'; m.fillRect(0, 0, n, n);
  for (let i = 0; i < 1800; i++) { m.fillStyle = `rgba(${seed() > 0.5 ? '56,42,30' : '6,4,3'},${0.06 + seed() * 0.08})`; m.fillRect(seed() * n, seed() * n, 2 + seed() * 10, 1 + seed() * 2); }
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  const k = n / plate, o = (plate - S) / 2 * k;
  g.fillStyle = '#fff'; for (let i = 0; i <= CELLS; i++) { const t = o + i * PITCH * k; g.fillRect(t - 1, o - 1, 2, S * k + 2); g.fillRect(o - 1, t - 1, S * k + 2, 2); }
  const t1 = new THREE.CanvasTexture(mc), t2 = new THREE.CanvasTexture(gc); t1.colorSpace = THREE.SRGBColorSpace; t1.anisotropy = t2.anisotropy = 8;
  return { map: t1, grid: t2 };
}

export interface Gfx {
  group: THREE.Group;
  /** Outline drawn (0..1), grid shown (0..1), pixels filled (0..1). */
  set: (draw: number, grid: number, fill: number) => void;
  /** The screen takes over (0..1), from one warm square per pixel to its three lights (mix 1..0), and the landing flare. */
  screen: (on: number, mix: number, flare: number, focus: number) => void;
  /** Where each of the target pixel's three lights is, red, green, blue. */
  lights: THREE.Vector3[];
  /** The screen mesh, which stays hidden until stop 6; the warm-up shows it for its passes. */
  screenMesh: THREE.Mesh;
  /** Where the pen is along the outline, 0..1. */
  penAt: (u: number, out: THREE.Vector3) => THREE.Vector3;
  /** Redo the letter once the typeface has loaded, so it matches the keycap. */
  redraw: () => void;
  anchors: THREE.Vector3[];
}

export function buildGfx(): Gfx {
  const group = new THREE.Group();
  const top = DRAW.y, PLATE = S + 0.5;

  // The plate the drawing lies on: a dark slab with a bevelled edge, the grid lines engraved into it and lit faintly.
  const pm = plateMaps(PLATE), uGrid = { value: 0 };
  const plate = new THREE.Mesh(roundBox(PLATE, 0.14, PLATE, 0.05, { seg: [10, 4, 10] }), new THREE.MeshPhysicalMaterial({ map: pm.map, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.3, emissive: 0xe9d4ad, emissiveMap: pm.grid, emissiveIntensity: 0 }));
  { const g = plate.geometry, p = g.attributes.position!, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / PLATE + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / PLATE; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  plate.position.set(DRAW.x, top - 0.14, DRAW.z); plate.receiveShadow = true; group.add(plate);
  const plateMat = plate.material as THREE.MeshPhysicalMaterial;

  // The pixels: one tile per cell, sunk into the plate until the fill reaches it; then it rises by how much of it the
  // letter covers and glows by the same amount. Empty cells come up as dark tiles, so the whole raster shows.
  const T = PITCH * 0.86, TH = 0.16, uFill = { value: 0 }, uLit = { value: 0 }, uSink = { value: 0 };
  const tileGeo = roundBox(T, TH, T, 0.035, { seg: [3, 3, 3] });
  const aTile = new THREE.InstancedBufferAttribute(new Float32Array(CELLS * CELLS * 2), 2); tileGeo.setAttribute('aTile', aTile);
  const tileMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2018, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.22, emissive: 0xffb76c });
  tileMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFill = uFill; sh.uniforms.uLit = uLit; sh.uniforms.uSink = uSink;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aTile; uniform float uFill; uniform float uSink; varying float vCover; varying float vRise;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRise = smoothstep(0.0, 1.0, clamp((uFill * 1.35 - aTile.y) / 0.35, 0.0, 1.0)); vCover = aTile.x;
        transformed.y += vRise * (0.045 + aTile.x * 0.11) * (1.0 - uSink) - uSink * 0.02;`); // sinking back into the plate as the screen takes over
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit; varying float vCover; varying float vRise;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= vCover * vCover * vRise * uLit * (0.55 + 0.45 * smoothstep(0.0, 0.6, normal.z));`); // top brighter than the sides
  };
  tileMat.customProgramCacheKey = () => 'gfx-tile';
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, CELLS * CELLS);
  { const o = new THREE.Object3D(); for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) { o.position.set(DRAW.x + (i - (CELLS - 1) / 2) * PITCH, top - TH - 0.006, DRAW.z + (j - (CELLS - 1) / 2) * PITCH); o.updateMatrix(); tiles.setMatrixAt(j * CELLS + i, o.matrix); } }
  tiles.castShadow = tiles.receiveShadow = true; tiles.frustumCulled = false; group.add(tiles);

  // The screen: the same grid as glowing pixels on black glass. Far off each pixel reads as one warm square (uMix 1);
  // up close it is three rounded stripes, red, green and blue, lit at the strengths that mix to the letter's cream.
  const covData = new Uint8Array(CELLS * CELLS * 4), covTex = new THREE.DataTexture(covData, CELLS, CELLS);
  covTex.magFilter = covTex.minFilter = THREE.NearestFilter; covTex.generateMipmaps = false;
  const uScreen = { value: 0 }, uMix = { value: 1 }, uFlare = { value: 0 }, uFocus = { value: 0 };
  const screenMat = new THREE.MeshPhysicalMaterial({ color: 0x060504, roughness: 0.7, specularIntensity: 0.25, envMapIntensity: 0.3, transparent: true, opacity: 0 }); // matte: a glossy screen mirrored the key light as a milky haze
  screenMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uCov: { value: covTex }, uScreen, uMix, uFlare, uFocus, uTarget: { value: new THREE.Vector2(TARGET.i, CELLS - 1 - TARGET.j) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vScreenUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvScreenUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D uCov; uniform float uScreen; uniform float uMix; uniform float uFlare; uniform float uFocus; uniform vec2 uTarget; varying vec2 vScreenUv;
      float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 g = vScreenUv * ${CELLS}.0, cell = floor(g), f = fract(g);
        float aa = fwidth(g.x) * 1.2, cov = texture2D(uCov, (cell + 0.5) / ${CELLS}.0).r;
        float isT = 1.0 - step(0.1, distance(cell, uTarget));
        cov *= (1.0 + uFlare * isT * 0.6) * mix(1.0, 0.28, uFocus * (1.0 - isT));                 // the pixel the message lands in flares; its neighbours step back
        float sq = 1.0 - smoothstep(-aa, aa, sdRB(f - 0.5, vec2(0.43), 0.1));
        vec3 mixed = vec3(1.0, 0.74, 0.44) * cov * sq * 0.62;
        float k = f.x * 3.0, sub = floor(k);
        float stripe = 1.0 - smoothstep(-aa, aa, sdRB(vec2((fract(k) - 0.5) / 3.0, f.y - 0.5), vec2(0.118, 0.43), 0.05));
        float core = 0.62 + 0.38 * (1.0 - smoothstep(0.0, 0.45, abs(f.y - 0.5))) * (1.0 - smoothstep(0.0, 0.5, abs(fract(k) - 0.5)));
        vec3 hue = sub < 0.5 ? vec3(1.0, 0.16, 0.07) : sub < 1.5 ? vec3(0.22, 1.0, 0.18) : vec3(0.16, 0.32, 1.0);
        float w = sub < 0.5 ? 1.0 : sub < 1.5 ? 0.8 : 0.5;                                         // red full, green most, blue half: together, warm cream
        vec3 lights = hue * stripe * (w * cov * core * 0.62 + 0.01);                                // unlit stripes keep a trace of their filter colour
        totalEmissiveRadiance = mix(lights, mixed, uMix) * uScreen;`);
  };
  screenMat.customProgramCacheKey = () => 'gfx-screen';
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(S, S), screenMat); screen.rotation.x = -Math.PI / 2; screen.position.set(DRAW.x, top + 0.002, DRAW.z); screen.visible = false; screen.renderOrder = 3; group.add(screen);

  // The outline: a fine gold line traced point to point, with a bright head where the pen is, and the points
  // themselves (the corners stored in the font) as small studs that appear as it reaches them.
  const uDraw = { value: 0 }, uFade = { value: 1 };
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffcf8f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  lineMat.onBeforeCompile = (sh) => {
    sh.uniforms.uDraw = uDraw; sh.uniforms.uFade = uFade;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float along; attribute float across; varying float vAlong; varying float vAcross;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along; vAcross = across;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDraw; uniform float uFade; varying float vAlong; varying float vAcross;')
      .replace('#include <opaque_fragment>', `float drawn = 1.0 - smoothstep(uDraw - 0.002, uDraw + 0.002, vAlong);
        float head = exp(-max(0.0, uDraw - vAlong) * 60.0) * step(uDraw, 0.999);
        outgoingLight *= drawn * (0.6 + 1.6 * head) * exp(-vAcross * vAcross * 3.0) * uFade; diffuseColor.a = 1.0;
        #include <opaque_fragment>`);
  };
  lineMat.customProgramCacheKey = () => 'gfx-line';
  const line = new THREE.Mesh(new THREE.BufferGeometry(), lineMat); line.renderOrder = 5; line.frustumCulled = false; group.add(line);
  const studMat = new THREE.MeshPhysicalMaterial({ color: 0xd8c08a, metalness: 1, roughness: 0.3, emissive: 0xffcf8f, emissiveIntensity: 0.6 });
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), studMat, 64); studs.count = 0; studs.frustumCulled = false; group.add(studs);

  let path = new THREE.CurvePath<THREE.Vector3>(), corners: { at: number; p: THREE.Vector3 }[] = [];
  const anchors = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const redraw = () => {
    // outline ribbon, studs, the pen's path
    const pts = outline().map(([x, y]) => toWorld(x, y).setY(top + 0.004));
    if (pts.length < 3) return;
    path = new THREE.CurvePath<THREE.Vector3>(); pts.forEach((p, i) => path.add(new THREE.LineCurve3(p, pts[(i + 1) % pts.length]!)));
    const total = path.getLength(), lens = path.getCurveLengths(); corners = pts.map((p, i) => ({ at: i ? lens[i - 1]! / total : 0, p }));
    const pos: number[] = [], along: number[] = [], across: number[] = [], idx: number[] = [], W = 0.035;
    let run = 0;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!, d = new THREE.Vector3().subVectors(b, a), len = d.length(), n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(W);
      const base = pos.length / 3; // each segment its own quad, slightly overrun so the corners close
      const e = d.clone().normalize().multiplyScalar(W * 0.5), a2 = a.clone().sub(e), b2 = b.clone().add(e);
      pos.push(a2.x - n.x, a2.y, a2.z - n.z, a2.x + n.x, a2.y, a2.z + n.z, b2.x - n.x, b2.y, b2.z - n.z, b2.x + n.x, b2.y, b2.z + n.z);
      along.push(run / total, run / total, (run + len) / total, (run + len) / total); across.push(-1, 1, -1, 1);
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3); run += len;
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); g.setAttribute('across', new THREE.Float32BufferAttribute(across, 1)); g.setIndex(idx);
    line.geometry.dispose(); line.geometry = g;
    studs.count = Math.min(64, corners.length);
    // pixel coverage, and when each pixel rises: row by row from the top, a little later across each row
    const cov = coverage();
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) { const k = j * CELLS + i; aTile.setXY(k, cov[k]!, j / CELLS * 0.85 + i / CELLS * 0.15); }
    aTile.needsUpdate = true;
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) covData[((CELLS - 1 - j) * CELLS + i) * 4] = Math.round(cov[j * CELLS + i]! * 255); // rows bottom-up, as the plane's uv runs
    covTex.needsUpdate = true;
    // anchors: the top of the left stem, an empty pixel in the front row, and a partly covered pixel on the right edge
    const first = corners.reduce((b, c) => (c.p.z + c.p.x * 0.2 < b.p.z + b.p.x * 0.2 ? c : b), corners[0]!); anchors[0]!.copy(first.p);
    anchors[1]!.set(DRAW.x + (4 - (CELLS - 1) / 2) * PITCH, top + 0.05, DRAW.z + (CELLS - 1) / 2 * PITCH); // a dark pixel in the front row
    let edge = 0, bestX = -1; for (let j = 6; j < 14; j++) for (let i = 0; i < CELLS; i++) { const c = cov[j * CELLS + i]!; if (c > 0.25 && c < 0.75 && i > bestX) { bestX = i; edge = j * CELLS + i; } }
    anchors[2]!.set(DRAW.x + (edge % CELLS - (CELLS - 1) / 2) * PITCH, top + 0.12, DRAW.z + (Math.floor(edge / CELLS) - (CELLS - 1) / 2) * PITCH);
  };
  redraw();

  const o = new THREE.Object3D();
  const set = (draw: number, grid: number, fill: number) => {
    uDraw.value = draw; uFade.value = 1 - 0.75 * fill; uFill.value = fill; uLit.value = 1.05 * fill;
    plateMat.emissiveIntensity = 0.16 * grid * (1 - 0.5 * fill);
    corners.slice(0, studs.count).forEach((c, i) => { const s = THREE.MathUtils.smoothstep(draw, c.at, c.at + 0.03) * (1 - fill); o.position.copy(c.p).setY(top + 0.012); o.scale.setScalar(Math.max(1e-4, s)); o.updateMatrix(); studs.setMatrixAt(i, o.matrix); });
    studs.instanceMatrix.needsUpdate = true;
  };
  set(0, 0, 0);
  const screenOn = (on: number, mix: number, flare: number, focus: number) => {
    uSink.value = THREE.MathUtils.smoothstep(on, 0, 0.7); uScreen.value = on; screenMat.opacity = Math.min(1, on * 1.6); screen.visible = on > 0.001;
    uMix.value = mix; uFlare.value = flare; uFocus.value = focus;
    if (on > 0) { plateMat.emissiveIntensity *= 1 - on; uFade.value *= 1 - on; }
  };
  const tx = DRAW.x + (TARGET.i - (CELLS - 1) / 2) * PITCH, tz = DRAW.z + (TARGET.j - (CELLS - 1) / 2) * PITCH;
  const lights = [-1, 0, 1].map((k) => new THREE.Vector3(tx + k * PITCH / 3, top + 0.003, tz + PITCH * 0.36)); // the lower end of each stripe
  const penAt = (u: number, out: THREE.Vector3) => out.copy(path.curves.length ? path.getPointAt(THREE.MathUtils.clamp(u, 0, 1)) : DRAW).setY(top + 0.09);
  return { group, set, screen: screenOn, lights, screenMesh: screen, penAt, redraw, anchors };
}
