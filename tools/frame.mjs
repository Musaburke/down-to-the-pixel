#!/usr/bin/env node
// Where the frame lands on the desk: projects the screen corners and edges onto the desk plane for a progress value.
// Usage: node --experimental-strip-types tools/frame.mjs <p> [W H] [x y z ...points to project to screen px]
import * as THREE from 'three';
import { RIG, P0 } from '../src/scripts/choreo/timeline.ts';
import { makeFlow } from '../src/scripts/choreo/flow.ts';
import { seg } from '../src/scripts/choreo/seg.ts';
const [p, W = 1440, H = 900, ...pts] = process.argv.slice(2).map(Number);
const DESK_Y = -1.75;
const path = new THREE.CatmullRomCurve3(RIG.map((s) => new THREE.Vector3(...s.pos)), false, 'centripetal');
const aim = new THREE.CatmullRomCurve3(RIG.map((s) => new THREE.Vector3(...s.target)), false, 'centripetal');
const lens = new THREE.CatmullRomCurve3(RIG.map((s) => new THREE.Vector3(s.fov, s.roll, 0)), false, 'centripetal');
const flow = makeFlow(RIG.map((s) => s.t));
const u = flow.at(p), pos = path.getPoint(u), tgt = aim.getPoint(u), l = lens.getPoint(u), aspect = W / H;
if (aspect < 1) pos.sub(tgt).multiplyScalar(1 + (1 - aspect) * 1.5 * seg(p, 0.13, P0)).add(tgt);
const cam = new THREE.PerspectiveCamera(l.x, aspect, 0.1, 1600);
cam.position.copy(pos); cam.lookAt(tgt); cam.rotateZ(THREE.MathUtils.degToRad(l.y));
if (aspect >= 1 && W > 760) cam.setViewOffset(W, H, -W * 0.19, 0, W, H); else cam.setViewOffset(W, H, 0, H * 0.13, W, H);
cam.updateProjectionMatrix(); cam.updateMatrixWorld();
console.log(`p ${p}  cam ${pos.toArray().map((v) => v.toFixed(1))}  target ${tgt.toArray().map((v) => v.toFixed(1))}  fov ${l.x.toFixed(1)}  dist ${pos.distanceTo(tgt).toFixed(1)}`);
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y), hit = new THREE.Vector3();
for (const [name, x, y] of [['top-left', -1, 1], ['top-mid', 0, 1], ['top-right', 1, 1], ['mid-left', -1, 0], ['centre', 0, 0], ['mid-right', 1, 0], ['bot-left', -1, -1], ['bot-mid', 0, -1], ['bot-right', 1, -1], ['text-edge-top', -0.3, 1], ['text-edge-mid', -0.3, 0]]) {
  ray.setFromCamera(new THREE.Vector2(x, y), cam);
  const h = ray.ray.intersectPlane(plane, hit);
  console.log(name.padEnd(14), h ? `desk x ${h.x.toFixed(0)} z ${h.z.toFixed(0)}  (${h.distanceTo(pos).toFixed(0)} from camera)` : 'sky');
}
for (let i = 0; i < pts.length; i += 3) { const v = new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]).project(cam); console.log(`point ${pts.slice(i, i + 3)} -> px ${((v.x + 1) / 2 * W).toFixed(0)}, ${((1 - v.y) / 2 * H).toFixed(0)}${v.z > 1 ? ' (behind)' : ''}`); }
