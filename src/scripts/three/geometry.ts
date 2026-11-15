/* Geometry helpers, core Three only. */
import * as THREE from 'three';
import { clamp, lerp } from '../choreo/seg.ts';

export const rounded = (w: number, d: number, r: number): THREE.Shape => {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

/** Weld duplicate vertices so normals come out smooth (a core-only mergeVertices). Keeps the first UV seen. */
export function smooth(g0: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
  const src = g.attributes.position!, uv = g.attributes.uv, map = new Map<string, number>(), verts: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let i = 0; i < src.count; i++) {
    const key = `${src.getX(i).toFixed(4)},${src.getY(i).toFixed(4)},${src.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) { k = verts.length / 3; map.set(key, k); verts.push(src.getX(i), src.getY(i), src.getZ(i)); if (uv) uvs.push(uv.getX(i), uv.getY(i)); }
    index.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(index); out.computeVertexNormals();
  g.dispose(); return out;
}

/** Extrude a rounded rect upward (+y), base at y = 0. Used for the keyboard case. */
export function slab(w: number, d: number, r: number, h: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(rounded(w - bevel * 2, d - bevel * 2, r), { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.computeBoundingBox(); g.translate(0, -g.boundingBox!.min.y, 0);
  return g;
}

interface RoundBoxOptions { taper?: number; inset?: number; dish?: number; seg?: [number, number, number] }
export const DISH = (x: number, hx: number, dish: number) => -dish * (1 - Math.min(1, (x / hx) ** 2));
/** Rounded box from a subdivided cube (every edge radius r), base at y = 0, with an optional taper towards
    the top, a sculpted skirt and a cylindrical dish in the top face. Segments cluster at the edges. */
export function roundBox(w: number, h: number, d: number, r: number, { taper = 0, inset, dish = 0, seg = [22, 10, 22] }: RoundBoxOptions = {}): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, ...seg), pos = g.attributes.position!;
  const bunch = (u: number) => lerp(u, 0.5 * Math.sin(Math.PI * u), 0.65);
  const hw = w / 2, hh = h / 2, hd = d / 2, ix = inset ?? taper * hw, iz = inset ?? taper * hd, hxTop = hw - ix; // inset: same slope on every width
  const p = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.set(bunch(pos.getX(i)) * w, bunch(pos.getY(i)) * h, bunch(pos.getZ(i)) * d);
    inner.set(clamp(p.x, -hw + r, hw - r), clamp(p.y, -hh + r, hh - r), clamp(p.z, -hd + r, hd - r));
    const n = p.clone().sub(inner); if (n.lengthSq() > 0) p.copy(inner).addScaledVector(n.normalize(), r);
    const f = Math.pow((p.y + hh) / h, 1.25); // slight curve in the skirt
    p.x *= 1 - ix * f / hw; p.z *= 1 - iz * f / hd; p.y += hh;
    if (dish) p.y += DISH(p.x, hxTop, dish) * clamp((p.y - (h - r * 1.6)) / (r * 1.6));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  const out = smooth(g), op = out.attributes.position!, ao = new Float32Array(op.count);
  // Occlusion for caps that stand in a field of neighbours: the skirt darkens towards its foot.
  for (let i = 0; i < op.count; i++) { const k = clamp(op.getY(i) / (h * 0.8)); ao[i] = lerp(0.26, 1, k * k * (3 - 2 * k)); }
  out.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  return out;
}

export interface LoopPt { x: number; z: number; nx: number; nz: number }
/** A rounded rectangle on the ground plane as a closed loop of points with outward normals. */
export function loop(w: number, d: number, r: number, n = 12): LoopPt[] {
  const pts: LoopPt[] = [], hw = w / 2 - r, hd = d / 2 - r;
  ([[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]] as const).forEach(([cx, cz], q) => {
    for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) }); }
  });
  return pts;
}

/** Sweep a profile around a loop. Each profile step [offset, y] makes one band with its own normal, so chamfers
    stay crisp across the profile and smooth around the corners. Offsets push outward along the loop normal. */
export function sweep(pts: LoopPt[], profile: [number, number][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [], n = pts.length;
  for (let j = 0; j < profile.length - 1; j++) {
    const [o0, y0] = profile[j]!, [o1, y1] = profile[j + 1]!, l = Math.hypot(y1 - y0, o1 - o0) || 1, no = (y1 - y0) / l, ny = -(o1 - o0) / l, base = pos.length / 3;
    pts.forEach((p) => {
      pos.push(p.x + p.nx * o0, y0, p.z + p.nz * o0, p.x + p.nx * o1, y1, p.z + p.nz * o1);
      nor.push(p.nx * no, ny, p.nz * no, p.nx * no, ny, p.nz * no);
    });
    for (let i = 0; i < n; i++) { const a = base + i * 2, b = base + ((i + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** A flat face at height y: an outer loop with an optional hole, facing up. */
export function face(outer: LoopPt[], y: number, hole?: LoopPt[], grow = 0, shrink = 0): THREE.BufferGeometry {
  const s = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x + p.nx * grow, -(p.z + p.nz * grow))));
  if (hole) s.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x + p.nx * shrink, -(p.z + p.nz * shrink)))));
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  return g;
}

/** World-space box UVs: one tile is `cm` wide on every face, so a photo texture keeps its real size.
    `turn` swaps the axes on level faces, for boards whose grain runs along x. */
export function boxUV(mesh: THREE.Mesh, cm: number, turn = false): void {
  const g = mesh.geometry, pos = g.attributes.position!, nor = g.attributes.normal;
  if (!nor) return;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  mesh.updateMatrixWorld(); nm.getNormalMatrix(mesh.matrixWorld);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); n.fromBufferAttribute(nor, i).applyMatrix3(nm);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const [a, b] = ay >= ax && ay >= az ? (turn ? [v.z, v.x] : [v.x, v.z]) : ax >= az ? (turn ? [v.y, v.z] : [v.z, v.y]) : (turn ? [v.y, v.x] : [v.x, v.y]);
    uv[i * 2] = a / cm; uv[i * 2 + 1] = b / cm;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Merge geometries that share position and normal (and nothing else). */
export function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  parts.forEach((p0) => {
    const p = p0, base = pos.length / 3, P = p.attributes.position!, N = p.attributes.normal!;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); }
    if (p.index) for (let i = 0; i < p.index.count; i++) idx.push(base + p.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
    p0.dispose();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** A bent strip of spring metal: a 2D centre line, thickened and extruded along z. */
export function strip(pts: [number, number][], t: number, depth: number): THREE.ExtrudeGeometry {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal').getSpacedPoints(48);
  const L: THREE.Vector2[] = [], R: THREE.Vector2[] = [];
  c.forEach((q, i) => { const a = c[Math.max(0, i - 1)]!, b = c[Math.min(c.length - 1, i + 1)]!, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    L.push(new THREE.Vector2(q.x - dy / l * t / 2, q.y + dx / l * t / 2)); R.push(new THREE.Vector2(q.x + dy / l * t / 2, q.y - dx / l * t / 2)); });
  const g = new THREE.ExtrudeGeometry(new THREE.Shape([...L, ...R.reverse()]), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2); return g;
}
