import * as THREE from 'three';
import { P0, old, RIG, TEXT_RIG, SPAN, pre, CABLE_PARTS } from './choreo/timeline.ts';
import { clamp, seg, lerp, part } from './choreo/seg.ts';
import { makeFlow } from './choreo/flow.ts';
import { tex, grainNormal, blobTex, grainTile, legend, softRect, braidTex } from './three/textures.ts';
import { roundBox, strip, boxUV } from './three/geometry.ts';
import { DESK_Y, BOARD, CAP, capGeo, decalGeo, sculpt, buildBoard } from './three/stops/board.ts';
import { buildCorner } from './three/stops/corner.ts';
import { buildCable } from './three/stops/cable.ts';
import { split as splitText } from './text.ts';

const root = document.documentElement;
const qs = new URLSearchParams(location.search);
const pinnedP = qs.has('p') ? clamp(parseFloat(qs.get('p')) || 0) : null;
const debug = qs.get('debug') === 'cam';
const camQ = qs.get('cam')?.split(',').map(Number);
const solo = qs.get('solo'); // ?solo=mug shows one prop alone on the desk, for the asset check
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.querySelector('.stage canvas');
const stage = document.querySelector('.stage');
const walk = document.querySelector('.walk');
const bar = document.querySelector('.bar');

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { renderer = null; }

if (renderer) {
  root.classList.add('live');
  if (pinnedP !== null) root.classList.add('pinned');
  if (reduced) root.classList.add('still');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); // the watchdog below may drop this to 1
  renderer.setClearColor(0x0c0c0b, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the desk is still: shadows are drawn once, then reused (see bakeShadows)

  const blob = blobTex();
  document.querySelector('.grain').style.backgroundImage = `url(${grainTile()})`; // static, drawn once

  /* ---------- scene, light and reflections ---------- */
  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x0c0c0b);
  scene.fog = new THREE.Fog(FOG, 8, 30);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1600);
  let roomEnv = null;
  { // Environment for reflections: a dark room with a warm softbox on the key side and a cool strip behind.
    const env = new THREE.Scene(), geos = [];
    const add = (geo, color, k, pos, look) => { geos.push(geo); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos); if (look) m.lookAt(0, 0, 0); env.add(m); return m; };
    add(new THREE.BoxGeometry(24, 24, 24), 0x0d0b0a, 1, [0, 0, 0]).material.side = THREE.BackSide;
    add(new THREE.PlaneGeometry(9, 6), 0xffd9a0, 3.2, [-9, 7, 6], true);   // warm key softbox
    add(new THREE.PlaneGeometry(2.4, 9), 0x8fa6c0, 1.6, [6, 3, -9], true); // cool rim strip
    add(new THREE.PlaneGeometry(12, 12), 0x6b6158, 0.35, [0, 10, 0], true); // dim top fill
    add(new THREE.PlaneGeometry(4, 2), 0xffe6c0, 1.2, [9, 2, 5], true);    // small warm kicker, gives the bevels a second catch
    add(new THREE.PlaneGeometry(10, 6), 0xffe6c0, 0.6, [0, 5, 11], true);  // soft sheen behind the section camera, for the housing faces
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.035).texture;
    // A second environment for everything on the desk: a dark warm room whose only bright thing is the lamp, back left.
    const room = new THREE.Scene();
    const put = (geo, color, k, pos) => { geos.push(geo); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); room.add(m); return m; };
    put(new THREE.BoxGeometry(24, 24, 24), 0x241a12, 0.32, [0, 0, 0]).material.side = THREE.BackSide;
    put(new THREE.CircleGeometry(2.6, 32), 0xffd3a6, 7, [-5, 8.5, -5]);    // the lamp
    put(new THREE.PlaneGeometry(18, 7), 0x8a6a4c, 0.5, [-3, 3.5, -11]);    // the wall it lights
    put(new THREE.PlaneGeometry(16, 8), 0x6e5844, 0.22, [5, 4, 11]);       // the room behind the camera
    put(new THREE.CircleGeometry(0.5, 16), 0xff9d4d, 5, [-3, 2.2, -8]);    // the candle
    roomEnv = pm.fromScene(room, 0.04).texture;
    pm.dispose(); geos.forEach((g) => g.dispose());
  }
  const key = new THREE.DirectionalLight(0xffd9a0, 2.6); key.position.set(-6, 8, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fa6c0, 1.1); rim.position.set(3, 4, -8); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe2c0, 0.55); fill.position.set(7, 3, 6); scene.add(fill); // keeps the shadow side warm
  const hemi = new THREE.HemisphereLight(0x4a3f34, 0x16110d, 0.4); scene.add(hemi);

  /* ---------- materials ---------- */
  const pbt = grainNormal(128, 2.2);
  const physical = (o) => new THREE.MeshPhysicalMaterial({ envMapIntensity: 1, ...o });
  const fadeable = (o) => physical({ transparent: true, ...o });
  const capLook = {
    ivory: { color: 0xe9dcc5, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.8, sheenColor: 0xfff1d8, normalMap: pbt, normalScale: new THREE.Vector2(0.1, 0.1) },
    carbon: { color: 0x191918, roughness: 0.55, sheen: 0.18, sheenRoughness: 0.9, sheenColor: 0x4a4744, normalMap: pbt, normalScale: new THREE.Vector2(0.1, 0.1) },
    gold: { color: 0xb89a58, metalness: 1, roughness: 0.36, envMapIntensity: 1.5, normalMap: pbt, normalScale: new THREE.Vector2(0.05, 0.05) }, // brushed-gold accent cap
  };
  const heroAO = { value: 1 }, boardAO = { value: 1 }; // the hero cap sheds its occlusion as it leaves the board
  const ivory = sculpt(physical(capLook.ivory), heroAO);
  const keyMats = { ivory: sculpt(fadeable(capLook.ivory), boardAO), carbon: sculpt(fadeable(capLook.carbon), boardAO), gold: sculpt(fadeable(capLook.gold), boardAO) };
  // Photo materials (Poly Haven, CC0). The stage stays dark until they have arrived, so nothing repaints in view.
  const texLoader = new THREE.TextureLoader(), waiting = [];
  const photo = (mat, id, { nor = 1, rough = true } = {}) => {
    const load = (file, srgb) => new Promise((res) => texLoader.load(`/assets/${id}/${file}.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t);
    }, undefined, () => res(null)));
    waiting.push(Promise.all([load('diff', true), load('nor'), load('arm')]).then(([d, n, a]) => {
      if (!d) return; // the flat colour stays if the photo did not load
      mat.map = d;
      if (n) { mat.normalMap = n; mat.normalScale.set(nor, nor); }
      if (a && rough) { mat.roughnessMap = a; mat.roughness = mat.userData.rough ?? 1; } // ARM: green is roughness
      mat.needsUpdate = true;
    }));
    return mat;
  };
  const woodMat = photo(fadeable({ color: 0xe6dcd2, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.42, envMapIntensity: 1.1 }), 'black_walnut_veneer_02', { nor: 1.3 }); // oiled walnut, satin
  woodMat.userData.rough = 1;
  const floorMat = photo(new THREE.MeshStandardMaterial({ color: 0xb3a494, roughness: 0.6, metalness: 0, transparent: true, envMapIntensity: 0.6 }), 'oak_veneer_01', { nor: 0.5 }); // the oak desk top
  floorMat.userData.rough = 1;
  const brassMat = fadeable({ color: 0x8a7444, metalness: 1, roughness: 0.4, envMapIntensity: 0.9 }); // satin brass plate and lip
  const housingMat = fadeable({ color: 0x24201c, roughness: 0.5 });
  const bedMat = fadeable({ color: 0x2c2620, metalness: 0.8, roughness: 0.5, normalMap: pbt, normalScale: new THREE.Vector2(0.12, 0.12) }); // the plate the switches clip into: dark bronze
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true });
  const metalMat = fadeable({ color: 0xb59a5c, metalness: 1, roughness: 0.3, normalMap: pbt, normalScale: new THREE.Vector2(0.04, 0.04) });
  const sleeveMat = fadeable({ color: 0xcfc4ae, roughness: 0.92, sheen: 0.5, sheenRoughness: 0.7, sheenColor: 0xfff1d8, bumpMap: braidTex(), bumpScale: 0.6 }); // woven ivory sleeve
  sleeveMat.bumpMap.wrapS = sleeveMat.bumpMap.wrapT = THREE.RepeatWrapping;
  const smoke = (c, o) => physical({ color: c, envMapIntensity: 2.4, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }); // both walls: smoked plastic reads hollow
  // A clear moulding is see-through where you look straight at it and solid where its wall turns edge-on.
  // That edge is what says "hollow shell": without it a tinted box reads as a solid block.
  const shellLook = (m) => { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
    'float edgeOn = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 1.7); diffuseColor.a = mix(diffuseColor.a * 0.3, min(1.0, diffuseColor.a * 2.6), edgeOn);\n#include <opaque_fragment>'); }; return m; };
  const topMat = shellLook(smoke(0xc9beae, 0.34)), botMat = shellLook(smoke(0x9a8f82, 0.4)); // smoked polycarbonate halves
  const stemMat = physical({ color: 0xa8662f, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: 0xffb070, transparent: true, opacity: 0.92 }); // amber stem
  const springMat = physical({ color: 0xcfd2d6, metalness: 1, roughness: 0.28 }); // polished steel
  const brass = (c) => physical({ color: c, metalness: 1, roughness: 0.3, envMapIntensity: 2.2, emissive: 0xcd8939, emissiveIntensity: 0 });
  const contactMat = brass(0xc9a24d), contactMat2 = brass(0xb88f3e);
  const pinMat = physical({ color: 0xc9a24d, metalness: 1, roughness: 0.3, envMapIntensity: 2 });
  const postMat = physical({ color: 0x2e2b28, roughness: 0.5 });
  const shadowMat = (o = 1) => new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: o });

  /* ---------- the desk and the keyboard ---------- */
  const desk = new THREE.Group(); scene.add(desk); // everything that falls away on the way into the switch
  const floor = new THREE.Mesh(new THREE.BoxGeometry(420, 3, 300), floorMat); // the desk top, big enough that its edges stay out of frame or in the fog
  floor.position.set(10, DESK_Y - 1.5, -60); boxUV(floor, 120, true); floor.receiveShadow = true; desk.add(floor);
  const board = buildBoard({ capMats: keyMats, wood: woodMat, brass: brassMat, housing: housingMat, bed: bedMat, sleeve: sleeveMat, metal: metalMat, shade: shadeMat });
  desk.add(board.group);
  const caseShadowMat = new THREE.MeshBasicMaterial({ map: softRect(52 / 21, 0.82, 0.85), transparent: true, depthWrite: false });
  const caseShadow = new THREE.Mesh(new THREE.PlaneGeometry(52, 21), caseShadowMat); // the dark the lamp cannot reach under the case
  caseShadow.rotation.x = -Math.PI / 2; caseShadow.position.set(BOARD.x, DESK_Y + 0.012, BOARD.z); caseShadow.renderOrder = 0; desk.add(caseShadow);

  const heroGeo = capGeo(), heroDecal = decalGeo();
  const legends = [];
  const keycap = (mat, ch, ink) => {
    const m = new THREE.Mesh(heroGeo, mat); m.renderOrder = 1;
    const dm = new THREE.MeshLambertMaterial({ map: legend(ch, ink), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    legends.push({ dm, ch, ink });
    const d = new THREE.Mesh(heroDecal, dm); d.renderOrder = 3; d.receiveShadow = true; m.add(d); return m;
  };
  const cap = keycap(ivory, 'M', '#2a2622'); cap.castShadow = cap.receiveShadow = true; scene.add(cap); // rest base y 0.72; same letter as the final screen
  // Leaving the desk: each material first sinks into the dark of the stage, then thins out. By the time caps are
  // see-through they are already the colour of the dark behind them, so they never ghost over one another.
  const uAway = { value: 0 }, uBoard = { value: 0 }, sunk = new Map(), capMeshes = new Set(board.caps);
  const sinks = (mat, u) => {
    if (!mat || sunk.has(mat)) return; sunk.set(mat, { u, rest: mat.opacity }); mat.transparent = true;
    const prev = mat.onBeforeCompile, id = `sink${sunk.size}`;
    mat.onBeforeCompile = (sh, r) => { prev.call(mat, sh, r); sh.uniforms.uSink = u;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSink;').replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uSink);'); };
    mat.customProgramCacheKey = () => id;
  };
  desk.traverse((m) => { if (m.material) sinks(m.material, capMeshes.has(m) ? uBoard : uAway); });

  /* ---------- light: one brass desk lamp, back left. The dark beyond its pool is the room ---------- */
  const LAMP = new THREE.Vector3(-24, DESK_Y + 42, -26), LAMP_CD = 17000;
  const lamp = new THREE.SpotLight(0xffd3a6, LAMP_CD, 0, 0.66, 1, 2);
  lamp.position.copy(LAMP); lamp.target.position.set(0, DESK_Y, -9); scene.add(lamp, lamp.target);
  lamp.castShadow = true; lamp.shadow.mapSize.set(4096, 4096); lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.03; lamp.shadow.radius = 2.5;
  lamp.shadow.camera.near = 12; lamp.shadow.camera.far = 170;
  const corner = buildCorner({ lampAt: LAMP, grain: pbt, blob, solo, onChange: () => { if (bakeShadows) bakeShadows(); } });
  scene.add(corner.group, corner.lights);
  if (solo) { board.group.visible = false; caseShadow.visible = false; }
  const inRoom = (root) => root.traverse((m) => { [m.material].flat().forEach((mat) => { if (mat?.isMeshStandardMaterial) { mat.envMap = roomEnv; mat.needsUpdate = true; } }); });
  inRoom(desk); inRoom(corner.group); corner.arrived.then(() => inRoom(corner.group));
  const bounce = new THREE.DirectionalLight(0xffdcb8, 0); bounce.position.set(18, 7, 50); scene.add(bounce); // lamplight coming back off the room, so the near faces are not black

  /* ---------- the switch ---------- */
  const topH = new THREE.Group(), topMesh = new THREE.Mesh(roundBox(1.4, 0.5, 1.4, 0.07, { taper: 0.2, seg: [10, 6, 10] }), topMat);
  topMesh.position.y = -0.25; topMesh.renderOrder = 2; topH.add(topMesh); scene.add(topH);
  const inner = (mesh, h) => { const m = new THREE.Mesh(mesh.geometry, mesh.material); m.scale.set(0.86, 0.84, 0.86); m.position.y = mesh.position.y + h * 0.08; m.renderOrder = 2; return m; }; // the moulding's inside face, a wall's thickness in
  topH.add(inner(topMesh, 0.5));          // spans 0..0.5 at rest
  const botH = new THREE.Group(), botMesh = new THREE.Mesh(roundBox(1.4, 0.75, 1.4, 0.06, { seg: [10, 6, 10] }), botMat);
  botMesh.position.y = -0.375; botMesh.renderOrder = 2; botH.add(botMesh, inner(botMesh, 0.75));
  const pinGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.34, 12);
  [[-0.38, 0.2], [0.24, -0.34]].forEach(([x, z]) => { const pin = new THREE.Mesh(pinGeo, pinMat); pin.position.set(x, -0.375 - 0.17, z); botH.add(pin); });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.26, 20), postMat); post.position.y = -0.375 - 0.13; botH.add(post);
  scene.add(botH);                                                                                     // spans -0.75..0 at rest
  const stem = new THREE.Group();
  const stemBody = new THREE.Mesh(roundBox(0.5, 0.55, 0.5, 0.05, { seg: [6, 6, 6] }), stemMat);
  const crossA = new THREE.Mesh(roundBox(0.34, 0.2, 0.09, 0.02, { seg: [4, 4, 4] }), stemMat); crossA.position.y = 0.55;
  const crossB = new THREE.Mesh(roundBox(0.09, 0.2, 0.34, 0.02, { seg: [4, 4, 4] }), stemMat); crossB.position.y = 0.55;
  stem.add(stemBody, crossA, crossB); scene.add(stem);                                                 // base y 0.075

  const SPRING_H = 0.975, SPRING_BASE = -0.9, TUBE = 220, RAD = 12;
  class Helix extends THREE.Curve {
    getPoint(t, o = new THREE.Vector3()) { const a = t * Math.PI * 2 * 7; return o.set(Math.cos(a) * 0.2, t * SPRING_H, Math.sin(a) * 0.2); }
  }
  const springGeo = new THREE.TubeGeometry(new Helix(), TUBE, 0.03, RAD, false);
  const springBase = springGeo.attributes.position.array.slice();
  const spring = new THREE.Mesh(springGeo, springMat); spring.position.y = SPRING_BASE; scene.add(spring);
  let springScale = 1;
  const setSpring = (s) => { // squash the centre line only, keep the wire round
    if (Math.abs(s - springScale) < 1e-4) return; springScale = s;
    const a = springGeo.attributes.position.array;
    for (let i = 0; i <= TUBE; i++) {
      const dy = (i / TUBE) * SPRING_H * (s - 1);
      for (let j = 0; j <= RAD; j++) { const k = ((i * (RAD + 1)) + j) * 3 + 1; a[k] = springBase[k] + dy; }
    }
    springGeo.attributes.position.needsUpdate = true;
  };
  // Two leaf springs in gold-plated brass, base at y -0.74. Each has a foot, a bend and a contact bump facing the other.
  const contactA = new THREE.Mesh(strip([[-0.13, 0.022], [-0.03, 0.022], [0, 0.07], [0, 0.48], [0.022, 0.58], [0, 0.66]], 0.06, 0.34), contactMat);
  const contactB = new THREE.Mesh(strip([[0.13, 0.022], [0.03, 0.022], [0, 0.07], [0, 0.4], [-0.022, 0.48], [0, 0.54]], 0.06, 0.34), contactMat2);
  contactA.position.y = contactB.position.y = -0.74; scene.add(contactA, contactB);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), new THREE.MeshBasicMaterial({ color: 0x85eda5, transparent: true, opacity: 0 }));
  spark.position.set(0.48, -0.23, 0.18); scene.add(spark); // tiny mint "closed" light at the touch point

  // Faint dotted drafting field behind the exploded parts: one draw.
  const dots = (() => { const v = []; for (let x = -4; x <= 4.001; x += 0.25) for (let y = -2.5; y <= 3.5; y += 0.25) v.push(x, y, -1.6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const dotTex = tex(32, (c, n) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(n / 2, n / 2, n / 2 - 2, 0, Math.PI * 2); c.fill(); });
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a8378, size: 2.5, sizeAttenuation: false, map: dotTex, alphaTest: 0.4, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    pts.renderOrder = 0; scene.add(pts); return pts; })();

  /* ---------- the bead: one pre-drawn sprite plus a lagged copper trail ---------- */
  const glow = tex(64, (g, n) => {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,240,204,1)'); r.addColorStop(0.16, 'rgba(255,224,170,1)');
    r.addColorStop(0.42, 'rgba(205,137,57,0.45)'); r.addColorStop(1, 'rgba(205,137,57,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
  }, { srgb: true });
  const beadMat = (o, color = 0xffffff) => new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: o, fog: false });
  const bead = new THREE.Sprite(beadMat(1)); bead.renderOrder = 10; scene.add(bead);
  const trail = Array.from({ length: 12 }, (_, i) => { const s = new THREE.Sprite(beadMat(0.5 * (1 - i / 12), 0xcc9166)); s.renderOrder = 9; scene.add(s); return s; });
  let trailLive = false;

  /* ---------- camera rig ---------- */
  const path = new THREE.CatmullRomCurve3(RIG.map((s) => new THREE.Vector3(...s.pos)), false, 'centripetal');
  const aim = new THREE.CatmullRomCurve3(RIG.map((s) => new THREE.Vector3(...s.target)), false, 'centripetal');
  const lens = new THREE.CatmullRomCurve3(RIG.map((s) => new THREE.Vector3(s.fov, s.roll, 0)), false, 'centripetal');
  // One monotone cubic through every shot's t: speed never jumps at a shot (see choreo/flow.ts).
  const flow = makeFlow(RIG.map((s) => s.t));
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), lensV = new THREE.Vector3();
  let segName = '', W = 1, H = 1;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  function rig(p, now) {
    const i = flow.segment(p), a = RIG[i], b = RIG[i + 1], u = flow.at(p);
    segName = `${a.id} > ${b.id}`;
    path.getPoint(u, camPos); aim.getPoint(u, camTgt); lens.getPoint(u, lensV);
    const aspect = W / H;
    if (aspect < 1) camPos.sub(camTgt).multiplyScalar(1 + (1 - aspect) * 1.5 * seg(pre(p), 0.13, P0)).add(camTgt); // portrait: step back to fit
    if (!reduced) {
      const drift = 1 - seg(old(pre(p)), 0.04, 0.16); // hero only: slow drift
      camPos.x += Math.sin(now * 0.00021) * 0.35 * drift; camPos.y += Math.sin(now * 0.00017) * 0.18 * drift;
      camPos.x += pointer.sx * 0.05; camPos.y -= pointer.sy * 0.035;
    }
    if (camQ) { camPos.set(camQ[0], camQ[1], camQ[2]); camTgt.set(camQ[3], camQ[4], camQ[5]); lensV.set(camQ[6] ?? 30, 0, 0); } // ?cam=x,y,z,tx,ty,tz,fov: a free camera for checking assets
    camera.position.copy(camPos); camera.lookAt(camTgt);
    camera.rotateZ(THREE.MathUtils.degToRad(lensV.y));
    camera.fov = lensV.x;
    // Shift the frame so the subject sits opposite the text panel (right on desktop, top on phones).
    if (aspect >= 1 && W > 760) camera.setViewOffset(W, H, -W * 0.19, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.13, W, H);
    const dist = camPos.distanceTo(camTgt);
    camera.near = Math.max(0.05, dist * 0.008); camera.updateProjectionMatrix();
    const open = 1 - seg(pre(p), 0.08, P0); // the opening lets the eye travel to the wall; by the hero the fog is as it was
    scene.fog.near = dist * (0.85 + 0.35 * open); scene.fog.far = dist * (2.6 + 1.2 * open);
    return dist;
  }

  /* ---------- stop 3: the cable ---------- */
  const plugWood = physical({ color: 0xffffff, roughness: 1, clearcoat: 0.25, clearcoatRoughness: 0.42 }); // the plug's own material (the desk's is sunk into the dark by now), on the case's textures so nothing uploads twice
  Promise.all(waiting).then(() => { plugWood.map = woodMat.map; plugWood.normalMap = woodMat.normalMap; plugWood.roughnessMap = woodMat.roughnessMap; if (woodMat.normalMap) plugWood.normalScale.set(1.3, 1.3); plugWood.needsUpdate = true; });
  const cable = buildCable({ sleeve: sleeveMat, wood: plugWood, brass: physical({ color: 0xd2bd8f, metalness: 0.7, roughness: 0.4, envMapIntensity: 2, normalMap: pbt, normalScale: new THREE.Vector2(0.03, 0.03) }) }); scene.add(cable.group); cable.group.visible = false;
  const cableRim = new THREE.DirectionalLight(0xffd2a0, 0); cableRim.position.set(7, -6, -11); cableRim.target.position.set(0, -14, 0); scene.add(cableRim, cableRim.target); // warm edge light from behind, for the lead only
  const cpart = (k, ease = 'inOut') => { const [a, b] = CABLE_PARTS[k], x = seg(fullP, a, b); return ease === 'linear' ? x : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  let fullP = 0;

  /* ---------- parts ---------- */
  const PRE = 0.2; // 2 mm pre-travel at this scale (CHERRY MX Red, see sources.md)
  const beadAt = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  function pose(p, now, dist) {
    const press = PRE * part(p, 'capPress') + PRE * part(p, 'spring'); // 2 mm to register, 4 mm all the way (1 unit is about 10 mm)
    const ex = part(p, 'explode');
    const away = part(p, 'deskAway');
    const boardAway = Math.max(away, seg(p, 0.44, 0.56));
    uAway.value = seg(away, 0, 0.6); uBoard.value = seg(boardAway, 0, 0.6);
    sunk.forEach(({ u, rest }, m) => { m.opacity = rest * (1 - seg(u === uBoard ? boardAway : away, 0.4, 1)); });
    desk.visible = away < 0.999;
    board.caps.forEach((o) => { o.visible = boardAway < 0.999; });
    heroAO.value = 1 - boardAway;
    cap.position.y = 0.72 - Math.min(press, PRE) + 2.25 * ex;
    topH.position.y = 0.25 + 1.3 * ex;
    botH.position.y = -0.375 - 1.1 * ex;
    stem.position.y = 0.075 - press;
    setSpring((stem.position.y - SPRING_BASE) / SPRING_H);
    const c = part(p, 'contacts');
    contactA.position.x = lerp(0.36, 0.455, c); contactB.position.x = lerp(0.68, 0.505, c);
    const lit = seg(p, 0.86, 0.9);
    contactMat.emissiveIntensity = contactMat2.emissiveIntensity = 0.22 * lit;
    spark.material.opacity = lit;
    dots.material.opacity = 0.55 * seg(p, 0.5, 0.72);

    // bead: on the cap, then the stem, then contact A, then a hop to contact B
    const capTop = 0.72 - Math.min(press, PRE) + 0.78; // pressed cap top, ignoring the explode lift
    beadAt.set(0, capTop + 0.2, 0);
    v1.set(0, stem.position.y + 0.9, 0.3);
    beadAt.lerp(v1, part(p, 'beadToStem'));
    v2.set(contactA.position.x - 0.04, contactA.position.y + 0.78, 0.3);
    beadAt.lerp(v2, part(p, 'beadToA'));
    const j = part(p, 'beadJump');
    if (j > 0) { beadAt.x = lerp(v2.x, contactB.position.x + 0.05, j); beadAt.y = lerp(v2.y, contactB.position.y + 0.64, j) + Math.sin(j * Math.PI) * 0.3; }
    if (fullP > SPAN) { // stop 3: the bead falls out of the switch onto the lead, then rides the data pair
      const drop = cpart('beadDrop'), ride = cpart('ride', 'linear');
      cable.beadAt(cable.uAt(Math.min(-2.3, camTgt.y - 0.9)), v1); // rides a little ahead of where the camera looks, so it leads the way down
      if (drop < 1) beadAt.lerp(v1, drop); else beadAt.copy(v1);
      cable.setFlow(ride * 0.5 + (reduced || pinnedP !== null ? 0 : now * 0.000035), seg(fullP, CABLE_PARTS.ride[0], CABLE_PARTS.ride[0] + 0.06));
    } else cable.setFlow(0, 0);
    cable.group.visible = fullP > SPAN + 0.005; cableRim.intensity = 2.4 * seg(fullP, SPAN, SPAN + 0.08);
    const shimmer = reduced ? 1 : 1 + Math.sin(now * 0.004) * 0.05 + Math.sin(now * 0.0113) * 0.03;
    const flare = 1 + 0.6 * Math.sin(Math.PI * seg(p, 0.88, 0.97));
    const size = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.1 * shimmer * flare;
    bead.position.copy(beadAt); bead.scale.setScalar(size);
    let moving = false;
    trail.forEach((s, i) => {
      const lead = i ? trail[i - 1].position : beadAt;
      if (pinnedP !== null || reduced) s.position.copy(beadAt); else s.position.lerp(lead, 0.42);
      s.scale.setScalar(size * (0.62 - i * 0.035));
      if (s.position.distanceToSquared(lead) > 1e-7) moving = true;
    });
    return moving;
  }

  /* ---------- annotations: project three anchors, draw leader lines to their labels ---------- */
  const notes = document.querySelector('.notes'), noteEls = [...notes.querySelectorAll('.note')];
  const noteLines = [...notes.querySelectorAll('line')], noteDots = [...notes.querySelectorAll('circle')];
  const anchor = new THREE.Vector3();
  let notesOn = -1;
  function annotate(p) {
    const o = W > 760 ? seg(p, 0.66, 0.74) * (1 - seg(fullP, SPAN, SPAN + 0.05)) : 0; // gone as the bead drops to the cable
    if (o !== notesOn) { notes.style.opacity = o.toFixed(3); notesOn = o; }
    if (o === 0) return;
    camera.updateMatrixWorld();
    const s = clamp(W / 1440, 0.75, 1);
    const spots = [ // anchor, label offset in px, label side
      [[0.25, stem.position.y + 0.3, 0.25], [150, -70], 1],
      [[-0.2, SPRING_BASE + SPRING_H * springScale * 0.45, 0.1], [-150, 40], -1],
      [[contactB.position.x + 0.02, contactB.position.y + 0.3, 0.16], [150, 70], 1],
    ];
    spots.forEach(([a, [dx, dy], side], i) => {
      anchor.set(...a).project(camera);
      const x = (anchor.x + 1) / 2 * W, y = (1 - anchor.y) / 2 * H, ex = x + dx * s, ey = y + dy * s;
      const L = noteLines[i]; L.setAttribute('x1', x.toFixed(1)); L.setAttribute('y1', y.toFixed(1)); L.setAttribute('x2', ex.toFixed(1)); L.setAttribute('y2', ey.toFixed(1));
      noteDots[i].setAttribute('cx', x.toFixed(1)); noteDots[i].setAttribute('cy', y.toFixed(1));
      const el = noteEls[i], gap = 10 * side;
      el.style.transform = `translate(${(ex + gap).toFixed(1)}px, ${ey.toFixed(1)}px) translate(${side > 0 ? 0 : -100}%, -50%)`;
    });
  }

  const cnotes = document.querySelector('.cable-notes'), cnoteEls = [...cnotes.querySelectorAll('.note')];
  const cnoteLines = [...cnotes.querySelectorAll('line')], cnoteDots = [...cnotes.querySelectorAll('circle')];
  let cnotesOn = -1;
  function annotateCable() { // the same engraved labels as the switch, on the cut-away lead
    const o = W > 760 ? cpart('notes', 'linear') : 0;
    if (o !== cnotesOn) { cnotes.style.opacity = o.toFixed(3); cnotesOn = o; }
    if (o === 0) return;
    camera.updateMatrixWorld();
    const s = clamp(W / 1440, 0.75, 1);
    [[-110, -40, -1], [120, -30, 1], [120, 40, 1], [110, 30, 1]].forEach(([dx, dy, side], i) => { const a = cable.anchors[i];
      anchor.copy(a).project(camera);
      const x = (anchor.x + 1) / 2 * W, y = (1 - anchor.y) / 2 * H, ex = x + dx * s, ey = y + dy * s;
      const L = cnoteLines[i]; L.setAttribute('x1', x.toFixed(1)); L.setAttribute('y1', y.toFixed(1)); L.setAttribute('x2', ex.toFixed(1)); L.setAttribute('y2', ey.toFixed(1));
      cnoteDots[i].setAttribute('cx', x.toFixed(1)); cnoteDots[i].setAttribute('cy', y.toFixed(1));
      cnoteEls[i].style.transform = `translate(${(ex + 10 * side).toFixed(1)}px, ${ey.toFixed(1)}px) translate(${side > 0 ? 0 : -100}%, -50%)`;
      const seen = x > W * 0.38 && x < W * 0.96 ? '1' : '0'; // a label whose part is behind the words or off frame waits
      cnoteEls[i].style.opacity = L.style.opacity = cnoteDots[i].style.opacity = seen;
    });
  }

  const gauge = document.querySelector('.gauge'), gaugeEls = [...gauge.querySelectorAll('.note')];
  const gaugeLines = [...gauge.querySelectorAll('line')], gaugeDot = gauge.querySelector('circle'), gv = new THREE.Vector3();
  let gaugeOn = -1;
  function measure(p) { // a dimension line on the M's front corner: rest, 2 mm, 4 mm, and the cap top riding down it
    const o = W > 760 ? seg(p, 0.2, 0.3) * (1 - seg(p, 0.46, 0.52)) : 0;
    if (o !== gaugeOn) { gauge.style.opacity = o.toFixed(3); gaugeOn = o; }
    if (o === 0) return;
    camera.updateMatrixWorld();
    const top = 0.72 + CAP.h, scr = (y) => { gv.set(0.78, y, 0.86).project(camera); return [(gv.x + 1) / 2 * W + 26, (1 - gv.y) / 2 * H]; };
    const [x0, y0] = scr(top), [, y2] = scr(top - PRE), [, y4] = scr(top - PRE * 2), [, yc] = scr(cap.position.y + CAP.h);
    const set = (L, a, b, c, d) => { L.setAttribute('x1', a.toFixed(1)); L.setAttribute('y1', b.toFixed(1)); L.setAttribute('x2', c.toFixed(1)); L.setAttribute('y2', d.toFixed(1)); };
    set(gaugeLines[0], x0, y0, x0, y4);
    [y0, y2, y4].forEach((y, i) => { set(gaugeLines[i + 1], x0 - 6, y, x0 + 6, y); gaugeEls[i].style.transform = `translate(${(x0 + 16).toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`; });
    gaugeDot.setAttribute('cx', x0.toFixed(1)); gaugeDot.setAttribute('cy', yc.toFixed(1));
  }

  /* ---------- text: masked line rise; one italic phrase per headline survives the split ---------- */
  const groups = [...document.querySelectorAll('.group')];
  let textIdx = -1;
  const stopEls = [...document.querySelectorAll('.stops li')];
  const split = () => splitText(groups);
  function setText(p) {
    let idx = 0; TEXT_RIG.forEach(([, t], i) => { if (p >= t) idx = i; });
    if (textIdx === -2 || idx === textIdx) return; textIdx = idx;
    groups.forEach((g, i) => { g.dataset.state = i === idx ? 'on' : i < idx ? 'after' : 'before'; g.inert = i !== idx; });
    const here = idx >= 3 ? 'cable' : idx === 2 ? 'switch' : 'key'; let past = true;
    stopEls.forEach((li) => { const cur = li.dataset.stop === here; if (cur) past = false; li.toggleAttribute('aria-current', cur); if (cur) li.setAttribute('aria-current', 'step'); li.toggleAttribute('data-past', past && !cur); });
  }
  let shut = null;
  const setShut = (p) => { const s = p >= 0.9; if (s !== shut) { shut = s; root.classList.toggle('shut', s); } };

  /* ---------- loop: render on change, idle shimmer capped near 30 fps ---------- */
  let bakeShadows = null;
  let p = pinnedP ?? 0, sp = p, vel = 0, dpr = Math.min(devicePixelRatio || 1, 1.5), slowRun = 0, raw = true, last = performance.now(), lastDraw = 0, running = true, dirty = true, hud;
  const readScroll = () => { const r = walk.getBoundingClientRect(); p = clamp(-r.top / Math.max(1, r.height - innerHeight)); };
  if (pinnedP === null) addEventListener('scroll', () => { raw = true; }, { passive: true });
  if (reduced) sp = 1;
  // Critically damped spring (smoothDamp): the camera eases into a scroll instead of jumping to full speed.
  const SMOOTH = 0.34; // seconds: v3.2 doubles the glide, so a flick pours into place instead of snapping
  function follow(target, dts) {
    const w = 2 / SMOOTH, x = w * dts, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = sp - target, tmp = (vel + w * ch) * dts;
    vel = (vel - w * tmp) * e; sp = target + (ch + tmp) * e;
    if (Math.abs(target - sp) < 1e-5 && Math.abs(vel) < 1e-4) { sp = target; vel = 0; }
  }
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H; dirty = true; notesOn = -1; gaugeOn = -1; cnotesOn = -1;
  }
  addEventListener('resize', () => { resize(); clearTimeout(resize.t); resize.t = setTimeout(() => { split(); textIdx = -1; }, 150); });
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || reduced) return; pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });
  if (debug) { hud = document.createElement('div'); hud.className = 'hud'; document.body.append(hud); }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(now - last, 50); last = now;
    if (raw && pinnedP === null) { raw = false; readScroll(); if (reduced) setText(p); }
    const target = reduced ? 1 : p;
    if (reduced) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    const prevSp = sp;
    follow(target, dt / 1000);
    const pd = pointer.x - pointer.sx, pe = pointer.y - pointer.sy;
    pointer.sx += pd * 0.08; pointer.sy += pe * 0.08;
    const pointerMoving = Math.abs(pd) + Math.abs(pe) > 1e-4;
    const changed = dirty || sp !== prevSp || pointerMoving || trailLive;
    if (!changed && (reduced || now - lastDraw < 33)) return; // idle: shimmer and hero drift at ~30 fps
    dirty = false; lastDraw = now;
    if (sp !== prevSp && dpr > 1) { // watchdog: only frames that moved count; idle frames are capped at ~33 ms on purpose
      slowRun = dt > 22 ? slowRun + 1 : Math.max(0, slowRun - 1);
      if (slowRun > 30) { dpr = 1; renderer.setPixelRatio(1); resize(); }
    }
    if (!reduced) bar.style.transform = `scaleX(${sp.toFixed(4)})`;
    if (!reduced) setText(sp);
    const op = old(pre(sp)); fullP = sp;
    setShut(op);
    const dist = rig(sp, now);
    trailLive = pose(op, now, dist);
    annotate(op); annotateCable();
    measure(op);
    const r = 1 - seg(op, 0.18, 0.3); // how much of the room's light is in play; all of it fades on the push-in, no step in the key lighting
    lamp.intensity = LAMP_CD * r; bounce.intensity = 0.36 * r;
    corner.setLight(r, now, reduced || pinnedP !== null); corner.group.visible = pre(sp) < P0 + 0.02; // past the hero the fog has closed over the corner
    key.intensity = 2.6 * (1 - r); fill.intensity = 0.55 * (1 - r); rim.intensity = 1.1 * (1 - 0.8 * r); hemi.intensity = 0.4 - 0.1 * r;
    scene.environmentIntensity = 1 - 0.45 * r;
    renderer.render(scene, camera);
    window.__programs = renderer.info.programs.length;
    if (hud) hud.textContent = `p ${p.toFixed(3)}  sp ${sp.toFixed(3)}\nsegment ${segName}\ndraw calls ${renderer.info.render.calls}  triangles ${renderer.info.render.triangles}`;
    window.__ready = true; window.__sp = sp;
  }
  let inView = true;
  const start = () => { if (running || !inView) return; running = true; last = performance.now(); dirty = true; requestAnimationFrame(frame); };
  const stop = () => { running = false; };
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; inView && !document.hidden ? start() : stop(); }).observe(walk);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

  if (reduced) readScroll();
  resize(); split();
  if (pinnedP === null && !reduced) { // hero lines start below their masks, then rise on the next frame
    groups.forEach((g) => { g.dataset.state = 'before'; }); textIdx = -2;
    requestAnimationFrame(() => requestAnimationFrame(() => { textIdx = -1; setText(sp); }));
  } else setText(reduced ? p : sp);
  // The lamp's shadows are drawn once, with every part at rest, and again when something new arrives on the desk.
  bakeShadows = () => { const d = rig(0, 0); pose(0, 0, d); lamp.intensity = LAMP_CD; renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); dirty = true; };
  bakeShadows();
  Promise.race([Promise.all(waiting), new Promise((r) => setTimeout(r, 6000))]).then(() => { root.classList.add('lit'); dirty = true; window.__loaded = true; });
  // Shaders for the later stops compile in the background now, so the first scroll into them never stalls on it.
  requestAnimationFrame(() => { cable.group.visible = true; const done = () => { cable.group.visible = false; dirty = true; };
    (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))).then(done, done); });
  running = false; start();
  document.fonts?.ready.then(() => {
    split(); if (textIdx !== -2) textIdx = -1; dirty = true;
    // Redraw the legends once the grotesk has loaded, so the letters match the page.
    legends.forEach(({ dm, ch, ink }) => { const prev = dm.map; dm.map = legend(ch, ink); dm.needsUpdate = true; prev.dispose(); });
    board.redrawLegends();
  });
}
