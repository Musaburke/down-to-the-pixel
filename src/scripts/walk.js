import * as THREE from 'three';
import { P0, old, RIG, TEXT_RIG, SPAN, pre, CABLE_PARTS, CABLE_END, CPU_PARTS, inCpu, GFX_PARTS, inGfx, PX_PARTS, inPx, END_PARTS, inEnd, STOP_AT, BEATS } from './choreo/timeline.ts';
import { clamp, seg, lerp, part } from './choreo/seg.ts';
import { makeFlow } from './choreo/flow.ts';
import { tex, grainNormal, blobTex, grainTile, legend, softRect, braidTex } from './three/textures.ts';
import { roundBox, strip, boxUV } from './three/geometry.ts';
import { DESK_Y, BOARD, CAP, capGeo, decalGeo, sculpt, buildBoard } from './three/stops/board.ts';
import { buildCorner } from './three/stops/corner.ts';
import { buildCable } from './three/stops/cable.ts';
import { buildCpu, CHIP, BOARD_Y } from './three/stops/cpu.ts';
import { buildGfx, DRAW } from './three/stops/gfx.ts';
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
    if (aspect < 1 && p > inGfx(0.215)) camPos.y = Math.min(camPos.y, BOARD_Y - 0.6); // ...but never back up through the board once the flash has carried it below
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
  const cpu = buildCpu(); scene.add(cpu.group); cpu.group.visible = false;
  const gfx = buildGfx(); scene.add(gfx.group); gfx.group.visible = false;
  const flashEl = document.querySelector('.flash'); let flashOn = -1;
  const pxCentre = gfx.lights[1].clone().setZ(gfx.lights[1].z - 0.24 * 0.36), beadFrom = pxCentre.clone().add(new THREE.Vector3(0, 1.4, 0.9)); // the last pixel, and where the message comes down from
  const keyAtCpu = new THREE.Vector3(CHIP.x - 5, CHIP.y + 8, CHIP.z - 6), keyAtGfx = new THREE.Vector3(DRAW.x - 5, DRAW.y + 8.5, DRAW.z - 6.5); // the processor's key light goes down with the camera, hidden by the flash
  const cpuKey = new THREE.SpotLight(0xffd3a6, 0, 0, 0.55, 1, 2); cpuKey.position.copy(keyAtCpu); cpuKey.target.position.copy(CHIP); scene.add(cpuKey, cpuKey.target); // a warm key from behind and left of the processor: a pool of light that falls off, its glare kept out of the camera's line
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
      if (fullP > CPU_PARTS.tracks[0]) { // stop 4: out of the plug, along the tracks, onto the die
        const tr = seg(fullP, ...CPU_PARTS.tracks), into = seg(fullP, ...CPU_PARTS.into);
        cpu.beadAt(tr + into, v2); beadAt.lerp(v2, THREE.MathUtils.smoothstep(tr, 0, 0.12));
      }
      cable.setFlow(ride * 0.5 + (reduced || pinnedP !== null ? 0 : now * 0.000035), seg(fullP, CABLE_PARTS.ride[0], CABLE_PARTS.ride[0] + 0.06));
    } else cable.setFlow(0, 0);
    if (fullP > GFX_PARTS.flash[0]) { // stop 5: through the die with the camera, then the bead is the pen that draws the outline
      gfx.penAt(seg(fullP, ...GFX_PARTS.draw), v1); beadAt.lerp(v1, THREE.MathUtils.smoothstep(fullP, inGfx(0.2), inGfx(0.34)));
    }
    cable.group.visible = fullP > SPAN + 0.005 && fullP < inCpu(0.6);
    cpu.group.visible = fullP > CABLE_END - 0.05 && camPos.y > BOARD_Y - 0.3; // gone once the camera is through the board
    gfx.group.visible = fullP > inGfx(0.12);
    if (gfx.group.visible) {
      gfx.set(seg(fullP, ...GFX_PARTS.draw), seg(fullP, ...GFX_PARTS.grid), seg(fullP, ...GFX_PARTS.fill));
      const regroup = THREE.MathUtils.smoothstep(seg(fullP, ...END_PARTS.regroup), 0, 1); // the ending: back to one warm square per pixel, neighbours up again
      gfx.screen(seg(fullP, ...PX_PARTS.screen), 1 - THREE.MathUtils.smoothstep(seg(fullP, ...PX_PARTS.split), 0, 1) * (1 - regroup), Math.sin(Math.PI * seg(fullP, ...PX_PARTS.flare)), seg(fullP, PX_PARTS.flare[0] - 0.02, PX_PARTS.flare[0] + 0.03) * (1 - regroup)); // stop 6
      const blink = reduced || pinnedP !== null ? 1 : THREE.MathUtils.smoothstep(Math.cos(now * 0.0059), -0.15, 0.15); // a steady on-off, soft-edged; still under reduced motion
      gfx.ending(seg(fullP, ...END_PARTS.widen), seg(fullP, ...END_PARTS.caret), seg(fullP, ...END_PARTS.caret) < 1 ? 1 : blink);
    }
    if (fullP > PX_PARTS.bead[0]) { const b = seg(fullP, ...PX_PARTS.bead); beadAt.lerpVectors(beadFrom, pxCentre, 1 - Math.pow(1 - b, 2)).y += 0.02; } // the message comes down into the pixel
    const fl = reduced ? 0 : Math.pow(Math.sin(Math.PI * seg(fullP, ...GFX_PARTS.flash)), 2) * 0.92;
    if (Math.abs(fl - flashOn) > 0.002) { flashEl.style.opacity = fl.toFixed(3); flashOn = fl; }
    if (cpu.group.visible) cpu.set(seg(fullP, ...CPU_PARTS.lid), seg(fullP, ...CPU_PARTS.wave), seg(fullP, ...CPU_PARTS.tracks) * 0.6 + (reduced || pinnedP !== null ? 0 : now * 0.000035), seg(fullP, CPU_PARTS.tracks[0], CPU_PARTS.tracks[0] + 0.03)); cableRim.intensity = 2.4 * seg(fullP, SPAN, SPAN + 0.08);
    const shimmer = reduced ? 1 : 1 + Math.sin(now * 0.004) * 0.05 + Math.sin(now * 0.0113) * 0.03;
    const flare = 1 + 0.6 * Math.sin(Math.PI * seg(p, 0.88, 0.97));
    const size = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.1 * shimmer * flare;
    const penUp = Math.max(1 - seg(fullP, inGfx(0.6), inGfx(0.7)), seg(fullP, inPx(0.4), inPx(0.48)) * (1 - seg(fullP, inPx(0.86), inPx(0.93)))); // the pen lifts away as the pixels fill; back for the last pixel, gone as it lands
    bead.position.copy(beadAt); bead.scale.setScalar(size * penUp);
    let moving = false;
    trail.forEach((s, i) => {
      const lead = i ? trail[i - 1].position : beadAt;
      if (pinnedP !== null || reduced) s.position.copy(beadAt); else s.position.lerp(lead, 0.42);
      s.scale.setScalar(size * (0.62 - i * 0.035) * penUp);
      if (s.position.distanceToSquared(lead) > 1e-7) moving = true;
    });
    return moving;
  }

  /* ---------- annotations: project three anchors, draw leader lines to their labels ---------- */
  // Every leader line has a dark halo drawn under it, so it reads over bright parts of the scene as well as dark ones.
  const halos = new WeakMap();
  document.querySelectorAll('.notes line, .gauge line').forEach((L) => { const h = L.cloneNode(); h.setAttribute('class', 'halo'); L.before(h); halos.set(L, h); });
  // A label takes pointer and focus only while it is shown; its definition closes if the label fades.
  const setLive = (el, on) => {
    if (el.tagName !== 'BUTTON' || el._live === on) return; el._live = on; el.toggleAttribute('data-live', on); el.tabIndex = on ? 0 : -1;
    const d = el.popoverTargetElement; if (!on && d?.matches(':popover-open')) d.hidePopover();
  };
  document.querySelectorAll('.notes button.note').forEach((el) => { el.tabIndex = -1; el._live = false; });
  const seat = (L, x1, y1, x2, y2) => { for (const e of [L, halos.get(L)]) { e.setAttribute('x1', x1.toFixed(1)); e.setAttribute('y1', y1.toFixed(1)); e.setAttribute('x2', x2.toFixed(1)); e.setAttribute('y2', y2.toFixed(1)); } };
  const notes = document.querySelector('.notes'), noteEls = [...notes.querySelectorAll('.note')];
  const noteLines = [...notes.querySelectorAll('line:not(.halo)')], noteDots = [...notes.querySelectorAll('circle')];
  const anchor = new THREE.Vector3();
  let notesOn = -1;
  function annotate(p) {
    const o = W > 760 ? seg(p, 0.66, 0.74) * (1 - seg(fullP, SPAN, SPAN + 0.05)) : 0; // gone as the bead drops to the cable
    if (o !== notesOn) { notes.style.opacity = o.toFixed(3); notesOn = o; noteEls.forEach((el) => setLive(el, o >= 0.5)); }
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
      seat(noteLines[i], x, y, ex, ey);
      noteDots[i].setAttribute('cx', x.toFixed(1)); noteDots[i].setAttribute('cy', y.toFixed(1));
      const el = noteEls[i], gap = 10 * side;
      el.style.transform = `translate(${(ex + gap).toFixed(1)}px, ${ey.toFixed(1)}px) translate(${side > 0 ? 0 : -100}%, -50%)`;
    });
  }

  // Engraved labels for the later stops: each block projects its anchors and draws leader lines to its labels.
  // `layout` is [dx, dy, side] per label; a label whose part is behind the words or off frame waits.
  const labelSets = [];
  const labels = (selector, layout) => {
    const el = document.querySelector(selector), set = { el, on: -1, els: [...el.querySelectorAll('.note')], lines: [...el.querySelectorAll('line:not(.halo)')], widths: [], dots: [...el.querySelectorAll('circle')] };
    labelSets.push(set);
    return (o, anchors, each = () => 1) => {
      o = W > 760 ? o : 0;
      if (o !== set.on) { el.style.opacity = o.toFixed(3); set.on = o; }
      if (o === 0) { set.els.forEach((e) => setLive(e, false)); return; }
      camera.updateMatrixWorld();
      const s = clamp(W / 1440, 0.75, 1);
      layout.forEach(([dx, dy, side], i) => {
        anchor.copy(anchors[i]).project(camera);
        const x = (anchor.x + 1) / 2 * W, y = (1 - anchor.y) / 2 * H, ex = x + dx * s, ey = y + dy * s, L = set.lines[i];
        seat(L, x, y, ex, ey);
        set.dots[i].setAttribute('cx', x.toFixed(1)); set.dots[i].setAttribute('cy', y.toFixed(1));
        set.els[i].style.transform = `translate(${(ex + 10 * side).toFixed(1)}px, ${ey.toFixed(1)}px) translate(${side > 0 ? 0 : -100}%, -50%)`;
        const w = set.widths[i] ||= set.els[i].offsetWidth, lx = side > 0 ? ex + 10 : ex - 10 - w, rx = side > 0 ? ex + 10 + w : ex - 10; // the label's own extent
        const seen = x > W * 0.38 && x < W * 0.96 && lx > W * 0.36 && rx < W - 16 && ey > H * 0.1 && ey < H * 0.86 ? each(i) : 0; // whole label in frame, clear of the words, the nav pill and the stop list
        set.els[i].style.opacity = L.style.opacity = halos.get(L).style.opacity = set.dots[i].style.opacity = seen.toFixed(3);
        setLive(set.els[i], seen >= 0.5 && o >= 0.5);
      });
    };
  };
  const cableLabels = labels('.cable-notes', [[-110, -40, -1], [120, -30, 1], [-120, 40, -1], [100, 30, 1]]);
  const cpuLabels = labels('.cpu-notes', [[-200, -150, -1], [-150, 130, -1], [120, -70, 1]]);
  const pxLabels = labels('.px-notes', [[-50, 70, -1], [0, 110, 1], [50, 70, 1]]);
  const gfxLabels = labels('.gfx-notes', [[-130, -60, -1], [10, 80, 1], [-10, -170, -1]]); // the later two in the dark below and above the plate
  function annotateLater() {
    cableLabels(cpart('notes', 'linear') * (1 - seg(fullP, CABLE_END + 0.02, CABLE_END + 0.04)), cable.anchors); // the plug's label stays until the plug is in its socket
    const lidK = seg(fullP, ...CPU_PARTS.lid);
    cpuLabels(seg(fullP, ...CPU_PARTS.notes) * (1 - seg(fullP, inGfx(0.1), inGfx(0.18))), cpu.anchors, (i) => (i === 0 ? 1 - seg(lidK, 0.15, 0.4) : seg(lidK, 0.7, 1))); // the lid's label leaves with it; the others wait for it to clear
    const fill = seg(fullP, ...GFX_PARTS.fill);
    pxLabels(seg(fullP, ...PX_PARTS.notes) * (1 - seg(fullP, inEnd(0), inEnd(0.08))), gfx.lights);
    gfxLabels(seg(fullP, ...GFX_PARTS.notes) * (1 - seg(fullP, inPx(0), inPx(0.08))), gfx.anchors, (i) => (i === 0 ? 1 - seg(fill, 0.3, 0.6) : i === 1 ? seg(fullP, ...GFX_PARTS.grid) : seg(fill, 0.75, 1))); // each label arrives with its part
  }

  const gauge = document.querySelector('.gauge'), gaugeEls = [...gauge.querySelectorAll('.note')];
  const gaugeLines = [...gauge.querySelectorAll('line:not(.halo)')], gaugeDot = gauge.querySelector('circle'), gv = new THREE.Vector3();
  let gaugeOn = -1;
  function measure(p) { // a dimension line on the M's front corner: rest, 2 mm, 4 mm, and the cap top riding down it
    const o = W > 760 ? seg(p, 0.2, 0.3) * (1 - seg(p, 0.46, 0.52)) : 0;
    if (o !== gaugeOn) { gauge.style.opacity = o.toFixed(3); gaugeOn = o; }
    if (o === 0) return;
    camera.updateMatrixWorld();
    const top = 0.72 + CAP.h, scr = (y) => { gv.set(0.78, y, 0.86).project(camera); return [(gv.x + 1) / 2 * W + 26, (1 - gv.y) / 2 * H]; };
    const [x0, y0] = scr(top), [, y2] = scr(top - PRE), [, y4] = scr(top - PRE * 2), [, yc] = scr(cap.position.y + CAP.h);
    const set = seat;
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
    const here = ['key', 'key', 'switch', 'cable', 'processor', 'graphics', 'pixel', 'pixel'][idx]; let past = true;
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
    renderer.setSize(W, H, false); camera.aspect = W / H; dirty = true; notesOn = -1; gaugeOn = -1; labelSets.forEach((l) => { l.on = -1; });
  }
  addEventListener('resize', () => { resize(); clearTimeout(resize.t); resize.t = setTimeout(() => { split(); textIdx = -1; }, 150); });
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || reduced) return; pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });
  // Jumps (the stop list, "Press it again"): a short fade to dark, the page lands at that stop and the spring is snapped
  // there, so the camera never rewinds through everything in between; then the fade lifts. Reduced motion: straight there.
  const cover = document.querySelector('.cover'); let jumping = false;
  const yFor = (t) => walk.getBoundingClientRect().top + scrollY + t * (walk.offsetHeight - innerHeight); // the page offset for progress t (readScroll's inverse)
  const jumpTo = (target, after) => {
    if (jumping) return;
    const land = () => {
      scrollTo({ top: yFor(target), behavior: 'instant' });
      if (!reduced) { p = sp = target; vel = 0; raw = true; dirty = true; }
      if (textIdx !== -2) { textIdx = -1; setText(target); }
      after?.();
    };
    if (reduced || !cover) { land(); return; }
    jumping = true; cover.classList.add('on');
    setTimeout(() => { land(); requestAnimationFrame(() => requestAnimationFrame(() => { cover.classList.remove('on'); jumping = false; })); }, 230);
  };
  document.querySelector('.again')?.addEventListener('click', (e) => {
    e.preventDefault();
    const h1 = document.querySelector('h1'); h1?.setAttribute('tabindex', '-1');
    jumpTo(0, () => h1?.focus({ preventScroll: true })); // the opening's words are live again before focus moves to them
  });
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => jumpTo(STOP_AT[b.dataset.go])));
  // Keyboard: Down, Space and Page Down glide to the next beat, Up, Shift+Space and Page Up to the one before; a press
  // during a glide steps on from where that glide is heading. The wheel and touch are left alone (and stop a glide).
  // Past the last beat, or below the walk, keys scroll as normal. Reduced motion: straight there.
  let glide = null;
  const cancelGlide = () => { if (glide) { cancelAnimationFrame(glide.raf); glide = null; } };
  const glideTo = (t) => {
    cancelGlide();
    const from = scrollY, to = yFor(t);
    if (reduced) { scrollTo({ top: to, behavior: 'instant' }); return; }
    const dur = clamp(Math.abs(to - from) / 2.2, 650, 1500), t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      scrollTo({ top: from + (to - from) * e, behavior: 'instant' });
      if (k < 1) glide.raf = requestAnimationFrame(step); else glide = null;
    };
    glide = { t, raf: requestAnimationFrame(step) };
  };
  if (pinnedP === null) {
    addEventListener('wheel', cancelGlide, { passive: true }); addEventListener('touchstart', cancelGlide, { passive: true });
    addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName ?? '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.key === ' ' && /^(BUTTON|A|SUMMARY)$/.test(tag))) return; // Space presses a focused control
      const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey), up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (!down && !up) return;
      const at = glide ? glide.t : p;
      if ((down && at >= 1 - 1e-3) || scrollY > yFor(1) + 4) return;
      const next = down ? BEATS.find((b) => b > at + 0.002) : [...BEATS].reverse().find((b) => b < at - 0.002);
      if (next === undefined) return;
      e.preventDefault(); glideTo(next);
    });
  }
  // Definitions open beside their label (below it, or above near the bottom), clear of the words, and close on scroll.
  let openAt = 0;
  document.querySelectorAll('.def').forEach((d) => d.addEventListener('toggle', (e) => {
    if (e.newState !== 'open') return;
    const b = document.querySelector(`[popovertarget="${d.id}"]`); if (!b) return;
    const r = b.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
    const x = clamp(r.left - 50, innerWidth * 0.33, innerWidth - w);           // the text lines up under the label; the shade's padding spills past
    const y = r.bottom + h - 22 < innerHeight - 60 ? r.bottom - 22 : r.top - h + 22;
    d.style.left = `${x.toFixed(0)}px`; d.style.top = `${Math.max(8, y).toFixed(0)}px`; openAt = scrollY;
  }));
  addEventListener('scroll', () => { const d = document.querySelector('.def:popover-open'); if (d && Math.abs(scrollY - openAt) > 40) d.hidePopover(); }, { passive: true });
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
    annotate(op); annotateLater();
    measure(op);
    const r = 1 - seg(op, 0.18, 0.3); // how much of the room's light is in play; all of it fades on the push-in, no step in the key lighting
    lamp.intensity = LAMP_CD * r; bounce.intensity = 0.36 * r;
    corner.setLight(r, now, reduced || pinnedP !== null); corner.group.visible = pre(sp) < P0 + 0.02; // past the hero the fog has closed over the corner
    const chipLit = seg(sp, CABLE_END, inCpu(0.3)); // on the board, the even studio light gives way to the processor's own key
    cpuKey.intensity = 260 * chipLit;
    const down = seg(sp, inGfx(0.2), inGfx(0.3)); cpuKey.position.lerpVectors(keyAtCpu, keyAtGfx, down); cpuKey.target.position.lerpVectors(CHIP, DRAW, down); cpuKey.target.updateMatrixWorld();
    key.intensity = 2.6 * (1 - r) * (1 - 0.55 * chipLit); fill.intensity = 0.55 * (1 - r) * (1 - 0.4 * chipLit); rim.intensity = 1.1 * (1 - 0.8 * r) * (1 - 0.85 * chipLit); hemi.intensity = (0.4 - 0.1 * r) * (1 - 0.5 * chipLit);
    scene.environmentIntensity = 1 - 0.45 * r;
    renderer.render(scene, camera);
    if (hud && renderer.info.programs.length > (window.__programs ?? 1e9)) console.log('[programs]', sp.toFixed(3), renderer.info.programs.slice(window.__programs).map((g) => g.name + ' ' + g.cacheKey.slice(0, 160)).join(' | ')); // debug: what compiled late
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
  // Their textures go up to the GPU too, one a frame, or the first frame that draws them stalls on the upload.
  const uploads = new Set();
  [cable.group, cpu.group, gfx.group].forEach((g) => g.traverse((o) => [o.material].flat().forEach((m) => m && Object.values(m).forEach((v) => { if (v?.isTexture) uploads.add(v); }))));
  const queue = [...uploads], upload = () => { const t = queue.shift(); if (!t) return; renderer.initTexture(t); requestAnimationFrame(upload); };
  // Compiling is not enough on every backend (ANGLE on Metal builds each pipeline at its first draw), so once they are
  // compiled every part is drawn once, culling off, and the real frame is drawn straight over it in the same task.
  const warm = () => {
    const culled = [];
    gfx.late.forEach((m) => { m.visible = true; });
    [cable.group, cpu.group, gfx.group].forEach((g) => { g.visible = true; g.traverse((o) => { if (o.isMesh && o.frustumCulled) { culled.push(o); o.frustumCulled = false; } }); });
    renderer.render(scene, camera);
    culled.forEach((o) => { o.frustumCulled = true; }); gfx.late.forEach((m) => { m.visible = false; });
    cable.group.visible = fullP > SPAN + 0.005 && fullP < inCpu(0.6); cpu.group.visible = fullP > CABLE_END - 0.05 && camPos.y > BOARD_Y - 0.3; gfx.group.visible = fullP > inGfx(0.12); renderer.render(scene, camera); // as pose() left them
  };
  requestAnimationFrame(() => { cable.group.visible = cpu.group.visible = gfx.group.visible = true; gfx.late.forEach((m) => { m.visible = true; }); const done = () => { cable.group.visible = cpu.group.visible = gfx.group.visible = false; gfx.late.forEach((m) => { m.visible = false; }); dirty = true; requestAnimationFrame(() => { warm(); upload(); }); };
    (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))).then(done, done); });
  running = false; start();
  document.fonts?.ready.then(() => {
    split(); if (textIdx !== -2) textIdx = -1; dirty = true;
    // Redraw the legends once the grotesk has loaded, so the letters match the page.
    legends.forEach(({ dm, ch, ink }) => { const prev = dm.map; dm.map = legend(ch, ink); dm.needsUpdate = true; prev.dispose(); });
    board.redrawLegends();
    gfx.redraw(); dirty = true; // the letter in the keycap's typeface
  });
}
