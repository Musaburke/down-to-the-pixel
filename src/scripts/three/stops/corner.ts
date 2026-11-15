/* The desk corner around the keyboard: a wall close behind, a brass lamp, a candle and a mug. Everything here is out of sight (in the fog) by the time the camera reaches the keys, so none of
   it needs to fade. The flame photo arrives after first paint. */
import * as THREE from 'three';
import { tex } from '../textures.ts';
import { DESK_Y } from './board.ts';

export interface Corner {
  group: THREE.Group;
  /** Lights that belong to the corner; the walkthrough scales them with the rest of the lamp rig. */
  setLight: (k: number, now: number, still: boolean) => void;
  /** Resolves when the streamed props are in the scene. */
  arrived: Promise<void>;
}
interface CornerOptions { lampAt: THREE.Vector3; grain: THREE.Texture; blob: THREE.Texture; solo: string | null; onChange: () => void }

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A turned shape. `v` runs by distance along the profile (not by point), so a texture is not stretched on long walls;
    one texture tile covers `tile` cm both ways. */
const lathe = (pts: [number, number][], seg = 64, tile = 0): THREE.LatheGeometry => {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  if (!tile) return g;
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const uv = g.attributes.uv!, girth = 2 * Math.PI * Math.max(...pts.map((p) => p[0]));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * girth / tile, len[i % pts.length]! / tile);
  return g;
};

/** Soft blotches: where a hand has been. Used as a roughness map so metal and glaze are not evenly clean. */
const smudge = (seed: number, lo: number, hi: number) => tex(256, (g, n) => {
  const r = mulberry(seed); g.fillStyle = `rgb(0,${Math.round(lo * 255)},0)`; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 70; i++) { const x = r() * n, y = r() * n, s = 10 + r() * 46, v = Math.round((lo + (hi - lo) * r()) * 255);
    const rg = g.createRadialGradient(x, y, 0, x, y, s); rg.addColorStop(0, `rgba(0,${v},0,0.55)`); rg.addColorStop(1, `rgba(0,${v},0,0)`); g.fillStyle = rg; g.fillRect(x - s, y - s, s * 2, s * 2); }
}, { repeat: 1 });

/** Stoneware glaze: cream with fine iron speckle. */
const speckle = () => tex(512, (g, n) => {
  const r = mulberry(77); g.fillStyle = '#e4d9c3'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 40; i++) { const x = r() * n, y = r() * n, s = 30 + r() * 80; const rg = g.createRadialGradient(x, y, 0, x, y, s); rg.addColorStop(0, 'rgba(203,188,160,0.35)'); rg.addColorStop(1, 'rgba(203,188,160,0)'); g.fillStyle = rg; g.fillRect(x - s, y - s, s * 2, s * 2); }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${70 + r() * 40},${48 + r() * 30},${30 + r() * 20},${0.25 + r() * 0.55})`; g.beginPath(); g.arc(r() * n, r() * n, 0.3 + r() * r() * 1.5, 0, 6.3); g.fill(); }
}, { srgb: true, repeat: 1 });


export function buildCorner(o: CornerOptions): Corner {
  const group = new THREE.Group(), props: Record<string, THREE.Object3D> = {};
  const add = (name: string, obj: THREE.Object3D) => { props[name] = obj; obj.visible = !o.solo || o.solo === name; group.add(obj); return obj; };
  const shadows = (obj: THREE.Object3D) => obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true; });
  const contact = (w: number, d: number, x: number, z: number, opacity = 0.7) => { // a soft dark patch where something meets the desk
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: o.blob, transparent: true, depthWrite: false, opacity }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, DESK_Y + 0.015, z); return m;
  };
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb08d4f, metalness: 1, roughness: 1, roughnessMap: smudge(11, 0.22, 0.42), envMapIntensity: 1.25 });

  /* ---------- wall: plain warm plaster, close behind the desk. It only ever shows as a soft falloff of lamplight ---------- */
  const wallGrain = o.grain.clone(); wallGrain.repeat.set(40, 16); wallGrain.needsUpdate = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(420, 170), new THREE.MeshStandardMaterial({ color: 0x3a312b, roughness: 0.96, normalMap: wallGrain, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.25 }));
  wall.position.set(-20, DESK_Y + 85, -46); wall.receiveShadow = true; add('wall', wall);

  /* ---------- lamp: a weighted brass base and a slim stem that leaves the top of the frame; the head is above it ---------- */
  const lamp = new THREE.Group(); lamp.position.set(-32, DESK_Y, -41);
  const base = new THREE.Mesh(lathe([[0, 0], [6.9, 0], [7.15, 0.12], [7.2, 0.4], [7.2, 0.95], [7.05, 1.22], [6.7, 1.32], [2.2, 1.62], [1.5, 1.85], [1.15, 2.6], [1.0, 3.4], [0, 3.4]], 96), brass);
  const reach = o.lampAt.clone().sub(lamp.position);
  const arm = new THREE.CatmullRomCurve3([[0, 3, 0], [0, 20, 0], [0.02, 34, 0.3], [reach.x * 0.25, reach.y + 3.5, reach.z * 0.3], [reach.x * 0.7, reach.y + 6, reach.z * 0.72], [reach.x, reach.y + 4, reach.z]].map((p) => new THREE.Vector3(...(p as [number, number, number]))));
  const stem = new THREE.Mesh(new THREE.TubeGeometry(arm, 80, 0.52, 20, false), brass);
  const collar = new THREE.Mesh(lathe([[0.52, 0], [0.8, 0.08], [0.86, 0.5], [0.8, 0.92], [0.52, 1]], 40), brass); collar.position.y = 3.3;
  // The shade, in case a tall window ever shows it: spun brass outside, white enamel inside.
  const shadeOut = new THREE.Mesh(lathe([[1.1, 5.6], [2.6, 5.3], [5.2, 3.8], [7.4, 1.2], [8.5, -1.6], [8.7, -2.0], [8.55, -2.15]], 72), brass);
  const shadeIn = new THREE.Mesh(lathe([[8.5, -2.1], [8.3, -1.6], [7.2, 1.1], [5.0, 3.6], [2.5, 5.1], [0, 5.3]], 72), new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffd9a8, emissiveIntensity: 2.2, roughness: 0.6, side: THREE.BackSide }));
  const head = new THREE.Group(); head.add(shadeOut, shadeIn); head.position.copy(reach).add(new THREE.Vector3(0, 1.5, 0)); head.rotation.set(0.42, 0, -0.5);
  lamp.add(base, stem, collar, head); shadows(lamp); shadeIn.castShadow = false; shadeOut.castShadow = false;
  lamp.add(contact(21, 21, 0, 0, 0.75).translateX(0)); lamp.children[lamp.children.length - 1]!.position.set(0, 0.015, 0);
  add('lamp', lamp);

  /* ---------- candle: a pillar on a brass dish. The top has burned down into a shallow pool ---------- */
  const candle = new THREE.Group(); candle.position.set(-13.5, DESK_Y, -30); candle.scale.setScalar(0.8);
  const waxGeo = lathe([[0, 6.9], [0.7, 6.9], [1.5, 6.94], [2.2, 7.06], [2.75, 7.26], [3.05, 7.45], [3.2, 7.52], [3.3, 7.42], [3.33, 7.1], [3.33, 0.3], [3.25, 0.12], [3.0, 0.08], [0, 0.08]], 72, 12);
  { const p = waxGeo.attributes.position!, r = mulberry(5); const bump = Array.from({ length: 9 }, () => [r() * 6.3, 0.1 + r() * 0.22] as const); // the rim has slumped unevenly
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 6.5) continue; const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y - bump.reduce((s, [ph, am], k) => s + am * (0.5 + 0.5 * Math.sin(a * (1 + (k % 4)) + ph)), 0) * 0.45 * THREE.MathUtils.smoothstep(Math.hypot(p.getX(i), p.getZ(i)), 1.5, 3.1)); }
    waxGeo.computeVertexNormals(); }
  const waxGlow = tex(64, (g, n) => { // light soaking into the top of the wax: brightest under the flame, gone a third of the way down
    const lg = g.createLinearGradient(0, n, 0, 0); lg.addColorStop(0, '#fff'); lg.addColorStop(0.28, '#f0f0f0'); lg.addColorStop(0.45, '#8a8a8a'); lg.addColorStop(0.7, '#3c3c3c'); lg.addColorStop(1, '#1c1c1c'); g.fillStyle = lg; g.fillRect(0, 0, n, n);
  }, { srgb: true });
  const wax = new THREE.Mesh(waxGeo, new THREE.MeshPhysicalMaterial({ color: 0xcdbb98, roughness: 1, emissive: 0xff8a30, emissiveIntensity: 0.3, emissiveMap: waxGlow, sheen: 0.6, sheenColor: 0xffe2b0, sheenRoughness: 0.5, roughnessMap: smudge(41, 0.42, 0.62) }));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.05, 48), new THREE.MeshPhysicalMaterial({ color: 0xd9b77a, roughness: 0.08, clearcoat: 1, emissive: 0xff9a3c, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 7.03; // melted wax under the flame
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.9 })); wick.position.set(0, 7.4, 0); wick.rotation.z = 0.12;
  const dish = new THREE.Mesh(lathe([[0, 0], [3.6, 0], [4.9, 0.28], [5.25, 0.62], [5.3, 0.8], [5.15, 0.84], [4.85, 0.5], [3.6, 0.2], [0, 0.2]], 72), brass);
  candle.add(wax, pool, wick, dish); shadows(candle); candle.add(contact(15, 15, 0, 0, 0.7)); candle.children[candle.children.length - 1]!.position.set(0, 0.015, 0);
  const FLAME = new THREE.Vector3(0.1, 8.9, 0);
  const flameMat = new THREE.SpriteMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  const flame = new THREE.Sprite(flameMat); flame.scale.set(1.9, 3.9, 1); flame.position.copy(FLAME); flame.center.set(0.5, 0.12); flame.position.y = 7.75; candle.add(flame);
  const candleLight = new THREE.PointLight(0xff9d4d, 0, 90, 2); candleLight.position.copy(FLAME).add(new THREE.Vector3(0, 2.6, 0)); candle.add(candleLight);
  add('candle', candle);

  /* ---------- mug: speckled stoneware, coffee in it ---------- */
  const mug = new THREE.Group(); mug.position.set(-39, DESK_Y, -19.5); mug.rotation.y = 0.55;
  const glazeMap = speckle();
  const glaze = new THREE.MeshPhysicalMaterial({ map: glazeMap, roughness: 1, roughnessMap: smudge(23, 0.16, 0.34), clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.1, side: THREE.DoubleSide });
  const body = new THREE.Mesh(lathe([[0, 0.45], [3.0, 0.45], [3.25, 0.2], [3.35, 0], [3.7, 0], [3.9, 0.28], [4.06, 0.9], [4.14, 2.2], [4.14, 8.5], [4.1, 8.95], [3.98, 9.16], [3.82, 9.22], [3.68, 9.14], [3.62, 8.9], [3.6, 8.4], [3.6, 2.0], [3.45, 1.25], [3.0, 0.95], [0, 0.9]], 96, 13), glaze);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(3.61, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b0e07, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.4 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 8.25;
  const loop = new THREE.CatmullRomCurve3([[3.6, 7.5, 0], [4.9, 7.75, 0], [6.3, 7.3, 0], [6.95, 6.0, 0], [6.75, 4.5, 0], [5.9, 3.2, 0], [4.7, 2.5, 0], [3.6, 2.3, 0]].map((p) => new THREE.Vector3(...(p as [number, number, number]))));
  const handleGeo = new THREE.TubeGeometry(loop, 64, 0.42, 20, false);
  { const p = handleGeo.attributes.position!; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 1.55); handleGeo.computeVertexNormals(); } // a strap handle, wider than it is thick
  const handle = new THREE.Mesh(handleGeo, glaze);
  mug.add(body, coffee, handle); shadows(mug); coffee.castShadow = false; mug.add(contact(13, 13, 0, 0, 0.75)); mug.children[mug.children.length - 1]!.position.set(0, 0.015, 0);
  add('mug', mug);

  /* ---------- lights ---------- */
  const spill = new THREE.PointLight(0xffc793, 0, 160, 2); spill.position.copy(o.lampAt).add(new THREE.Vector3(0, 2, -1)); group.add(spill); // what escapes the shade: the glow on the wall
  const setLight = (k: number, now: number, still: boolean) => {
    const t = now / 1000, f = still ? 1 : 1 + 0.05 * Math.sin(t * 2.3) + 0.035 * Math.sin(t * 5.1 + 1.3) + 0.02 * Math.sin(t * 8.7 + 0.4); // a slow breath, never a strobe
    candleLight.intensity = 210 * k * f; spill.intensity = 60 * k;
    if (!still) { flame.scale.set(1.9 * (1 + 0.03 * Math.sin(t * 3.7)), 3.9 * (0.97 + 0.05 * (f - 1) * 10), 1); flame.material.rotation = 0.03 * Math.sin(t * 1.9) + 0.015 * Math.sin(t * 4.3); }
  };

  /* ---------- streamed: the flame photo (Poly Haven, CC0) ---------- */
  const texLoader = new THREE.TextureLoader();
  const flameIn = new Promise<void>((res) => texLoader.load('/assets/candle/flame.webp', (t) => { t.colorSpace = THREE.SRGBColorSpace; flameMat.map = t; flameMat.opacity = 1; flameMat.needsUpdate = true; res(); }, undefined, () => res()));
  const arrived = flameIn.then(() => o.onChange());
  return { group, setLight, arrived };
}
