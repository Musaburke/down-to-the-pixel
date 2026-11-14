import * as THREE from 'three';
import { PARTS, P0, old, RIG, TEXT_RIG } from './choreo/timeline';



const E = { linear: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const part = (p, k, ease = 'inOut') => E[ease](seg(p, PARTS[k][0], PARTS[k][1]));
const lerp = (a, b, t) => a + (b - a) * t;

const root = document.documentElement;
const qs = new URLSearchParams(location.search);
const pinnedP = qs.has('p') ? clamp(parseFloat(qs.get('p')) || 0) : null;
const debug = qs.get('debug') === 'cam';
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
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // the room is still: shadows are drawn once, then reused

  /* ---------- small canvas textures (made once) ---------- */
  const tex = (size, draw, o = {}) => {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat, o.repeat); }
    t.anisotropy = 4; return t;
  };
  const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // seeded, same grain every load
  // Fine grain as a normal map: random heights, lightly blurred, turned into slopes.
  const grainNormal = (size, strength) => tex(size, (g, n) => {
    const h = new Float32Array(n * n).map(() => rand()), b = new Float32Array(n * n);
    const at = (a, x, y) => a[((y + n) % n) * n + ((x + n) % n)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) b[y * n + x] = (at(h, x, y) * 4 + at(h, x + 1, y) + at(h, x - 1, y) + at(h, x, y + 1) + at(h, x, y - 1)) / 8;
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (at(b, x + 1, y) - at(b, x - 1, y)) * strength, dy = (at(b, x, y + 1) - at(b, x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: 7 });
  const woodTex = (base, dark, repeat = 1) => tex(512, (g, n) => { // long grain streaks along u
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 90; i++) { g.fillStyle = dark; g.globalAlpha = 0.05 + rand() * 0.16; g.fillRect(0, rand() * n, n, 0.6 + rand() * 3.2); }
    g.globalAlpha = 1;
  }, { srgb: true, repeat });
  const blob = tex(128, (g, n) => { // soft contact shadow
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.62)'); r.addColorStop(0.55, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
  });
  // Page grain tile (static, drawn once).
  { const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'), img = g.createImageData(160, 160);
    for (let i = 0; i < 160 * 160; i++) { const v = rand() > 0.5 ? 255 : 0; img.data.set([v, v, v, 90 * rand()], i * 4); }
    g.putImageData(img, 0, 0); document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`; }

  /* ---------- scene, light and reflections ---------- */
  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x0c0c0b);
  scene.fog = new THREE.Fog(FOG, 8, 30);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1600);
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
    pm.dispose(); geos.forEach((g) => g.dispose());
  }
  const key = new THREE.DirectionalLight(0xffd9a0, 2.6); key.position.set(-6, 8, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fa6c0, 1.1); rim.position.set(3, 4, -8); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe2c0, 0.55); fill.position.set(7, 3, 6); scene.add(fill); // keeps the shadow side warm
  const hemi = new THREE.HemisphereLight(0x3d3731, 0x0c0b0a, 0.4); scene.add(hemi);

  /* ---------- geometry helpers ---------- */
  const rounded = (w, d, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  // Weld duplicate vertices so normals come out smooth (core-only stand-in for BufferGeometryUtils.mergeVertices). Keeps the first UV seen.
  const smooth = (g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
    const src = g.attributes.position, uv = g.attributes.uv, map = new Map(), verts = [], uvs = [], index = [];
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
  };
  // Extrude a rounded rect upward (+y), base at y = 0. Used for the plate.
  const slab = (w, d, r, h, bevel) => {
    const g = new THREE.ExtrudeGeometry(rounded(w - bevel * 2, d - bevel * 2, r), { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
    g.rotateX(-Math.PI / 2); g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
    return g;
  };
  // Rounded box from a subdivided cube (every edge radius r), base at y = 0, with an optional taper
  // towards the top, a sculpted skirt and a cylindrical dish in the top face. Segments cluster at the edges.
  const DISH = (x, hx, dish) => -dish * (1 - Math.min(1, (x / hx) ** 2));
  const roundBox = (w, h, d, r, { taper = 0, inset, dish = 0, seg = [22, 10, 22] } = {}) => {
    const g = new THREE.BoxGeometry(1, 1, 1, ...seg), pos = g.attributes.position;
    const bunch = (u) => lerp(u, 0.5 * Math.sin(Math.PI * u), 0.65);
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
    return smooth(g);
  };
  // A bent strip of spring metal: a 2D centre line, thickened and extruded along z.
  const strip = (pts, t, depth) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal').getSpacedPoints(48);
    const L = [], R = [];
    c.forEach((q, i) => { const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
      L.push(new THREE.Vector2(q.x - dy / l * t / 2, q.y + dx / l * t / 2)); R.push(new THREE.Vector2(q.x + dy / l * t / 2, q.y - dx / l * t / 2)); });
    const g = new THREE.ExtrudeGeometry(new THREE.Shape([...L, ...R.reverse()]), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -depth / 2); return g;
  };
  const legend = (ch, ink) => tex(256, (g, n) => {
    g.clearRect(0, 0, n, n); g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 ${n * 0.5}px "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif`; g.fillText(ch, n / 2, n * 0.53);
  }, { srgb: true });

  /* ---------- materials ---------- */
  const pbt = grainNormal(128, 2.2);
  const physical = (o) => new THREE.MeshPhysicalMaterial({ envMapIntensity: 1, ...o });
  const ivory = physical({ color: 0xe8e0cf, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.8, sheenColor: 0xfff1d8, normalMap: pbt, normalScale: new THREE.Vector2(0.1, 0.1) });
  const fadeable = (o) => physical({ transparent: true, ...o });
  const keyMats = {
    ivory: fadeable({ color: 0xe8e0cf, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.8, sheenColor: 0xfff1d8, normalMap: pbt, normalScale: new THREE.Vector2(0.1, 0.1) }),
    carbon: fadeable({ color: 0x2b2926, roughness: 0.6, sheen: 0.25, sheenRoughness: 0.9, sheenColor: 0x6d655b, normalMap: pbt, normalScale: new THREE.Vector2(0.1, 0.1) }),
    gold: fadeable({ color: 0xae9357, metalness: 0.88, roughness: 0.36, normalMap: pbt, normalScale: new THREE.Vector2(0.06, 0.06) }), // brushed-gold accent cap
  };
  const plateMat = physical({ color: 0x3b3a37, metalness: 0.92, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.4, transparent: true }); // dark anodised aluminium
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTex('#6a4127', '#2a170b'), roughness: 0.5, metalness: 0, transparent: true }); // the oak desk top
  floorMat.userData.photo = { id: 'oak_veneer_01', cm: 55, tint: 0x9a7b62 };
  const smoke = (c, o) => physical({ color: c, envMapIntensity: 2.4, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }); // both walls: smoked plastic reads hollow
  const topMat = smoke(0xc2b7a8, 0.3), botMat = smoke(0x8a8075, 0.38); // smoked polycarbonate halves
  const stemMat = physical({ color: 0xc0601c, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: 0xffb070, transparent: true, opacity: 0.92 }); // amber stem
  const springMat = physical({ color: 0xcfd2d6, metalness: 1, roughness: 0.28 }); // polished steel
  const brass = (c) => physical({ color: c, metalness: 1, roughness: 0.3, envMapIntensity: 2.2, emissive: 0xcd8939, emissiveIntensity: 0 });
  const contactMat = brass(0xc9a24d), contactMat2 = brass(0xb88f3e);
  const pinMat = physical({ color: 0xc9a24d, metalness: 1, roughness: 0.3, envMapIntensity: 2 });
  const postMat = physical({ color: 0x2e2b28, roughness: 0.5 });
  const shadowMat = (o = 1) => new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: o });

  /* ---------- the desk: floor, plate, neighbouring keys ---------- */
  const DESK_Y = -2.2; // desk top; the keyboard case runs from here up to the plate at 0.08
  const floor = new THREE.Mesh(new THREE.BoxGeometry(420, 3, 300), floorMat); // the desk top, big enough that its edges stay out of frame or in the fog
  floor.position.set(10, DESK_Y - 1.5, -60); scene.add(floor);
  const plate = new THREE.Mesh(slab(45.8, 15.1, 0.9, 0.08 - DESK_Y, 0.3), plateMat); // keyboard case, top face is the plate
  plate.position.set(4.8, DESK_Y, -3.36); scene.add(plate);
  const plateShadow = new THREE.Mesh(new THREE.PlaneGeometry(54, 24), shadowMat(0.9));
  plateShadow.rotation.x = -Math.PI / 2; plateShadow.position.set(4.8, DESK_Y + 0.01, -3.36); scene.add(plateShadow);

  const CAP = { w: 1.8, h: 0.78, r: 0.13, taper: 0.22, dish: 0.035 };
  const capGeo = roundBox(CAP.w, CAP.h, CAP.w, CAP.r, { taper: CAP.taper, dish: CAP.dish });
  // The legend sits on a thin decal that follows the dish; extrude UVs would not map a letter cleanly.
  const decalGeo = (() => { const g = new THREE.PlaneGeometry(0.62, 0.62, 12, 1); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, hx = (CAP.w / 2) * (1 - CAP.taper);
    for (let i = 0; i < pos.count; i++) pos.setY(i, CAP.h + DISH(pos.getX(i), hx, CAP.dish) + 0.004);
    g.computeVertexNormals(); return g; })();
  const decalMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const legends = [];
  const keycap = (mat, ch, ink) => {
    const m = new THREE.Mesh(capGeo, mat); m.renderOrder = 1;
    const dm = decalMat(legend(ch, ink)); legends.push({ dm, ch, ink });
    const d = new THREE.Mesh(decalGeo, dm); d.renderOrder = 3; m.add(d); return m;
  };
  const cap = keycap(ivory, 'M', '#2a2622'); scene.add(cap); // rest base y 0.72; same letter as the final screen
  const capShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), shadowMat()); capShadow.rotation.x = -Math.PI / 2; capShadow.position.y = 0.082; scene.add(capShadow);
  const fading = [plateMat, floorMat, plateShadow.material, ...Object.values(keyMats)];
  /* ---------- the full keyboard: full-size ANSI, one instanced draw per cap width and colourway ---------- */
  const PITCH = 1.92, GAP = 0.12, INSET = (CAP.w / 2) * CAP.taper;
  const KEYS = (() => { // { l, x, y, w, h } in key units; the M sits at x 8.25, y 4.5
    const out = [], ch = (t) => [...t];
    const row = (y, items) => { let x = 0; items.forEach((it) => { const [l, w = 1, h = 1, gap = 0] = Array.isArray(it) ? it : [it]; x += gap; out.push({ l, x, y, w, h }); x += w; }); };
    row(0, ['Esc', ['F1', 1, 1, 1], 'F2', 'F3', 'F4', ['F5', 1, 1, 0.5], 'F6', 'F7', 'F8', ['F9', 1, 1, 0.5], 'F10', 'F11', 'F12', ['', 1, 1, 0.25], '', '']);
    row(1.5, [...ch('`1234567890-='), ['Back', 2], ['Ins', 1, 1, 0.25], 'Home', 'PgUp', ['Num', 1, 1, 0.25], '/', '*', '-']);
    row(2.5, [['Tab', 1.5], ...ch('QWERTYUIOP[]'), ['\\', 1.5], ['Del', 1, 1, 0.25], 'End', 'PgDn', ['7', 1, 1, 0.25], '8', '9', ['+', 1, 2]]);
    row(3.5, [['Caps', 1.75], ...ch("ASDFGHJKL;'"), ['Enter', 2.25], ['4', 1, 1, 3.5], '5', '6']);
    row(4.5, [['Shift', 2.25], ...ch('ZXCVBNM,./'), ['Shift', 2.75], ['↑', 1, 1, 1.25], ['1', 1, 1, 1.25], '2', '3', ['Ent', 1, 2]]);
    row(5.5, [['Ctrl', 1.25], ['', 1.25], ['Alt', 1.25], ['', 6.25], ['Alt', 1.25], ['', 1.25], ['', 1.25], ['Ctrl', 1.25], ['←', 1, 1, 0.25], '↓', '→', ['0', 2, 1, 0.25], '.']);
    return out;
  })();
  const GOLD = new Set(['Esc', '←', '↓', '→', '↑']);
  const tone = (k) => (GOLD.has(k.l) || (k.l === 'Enter' && k.w > 2) ? 'gold' : k.l.length === 1 || k.w > 6 ? 'ivory' : 'carbon');
  const INK = { ivory: '#2a2622', carbon: '#d9d1c2', gold: '#3a2f19' };
  const keyAt = (k, v) => v.set((k.x + k.w / 2 - 8.75) * PITCH, 0.72, (k.y + k.h / 2 - 5) * PITCH);
  const board = KEYS.filter((k) => k.l !== 'M'); // the M is the hero cap above
  const capGeos = new Map();
  const capGeoFor = (w, h) => {
    const id = `${w}x${h}`;
    if (!capGeos.has(id)) capGeos.set(id, roundBox(w * PITCH - GAP, CAP.h, h * PITCH - GAP, CAP.r, { inset: INSET, dish: CAP.dish, seg: [w > 2 ? 18 : 10, 6, h > 1 ? 16 : 10] }));
    return capGeos.get(id);
  };
  const dummy = new THREE.Object3D(), kv = new THREE.Vector3(), batches = new Map();
  board.forEach((k) => { const id = `${k.w}x${k.h}|${tone(k)}`; if (!batches.has(id)) batches.set(id, []); batches.get(id).push(k); });
  batches.forEach((list, id) => {
    const t = id.split('|')[1], m = new THREE.InstancedMesh(capGeoFor(list[0].w, list[0].h), keyMats[t], list.length);
    list.forEach((k, i) => { dummy.position.copy(keyAt(k, kv)); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.renderOrder = 1; scene.add(m);
  });
  // Every legend in one atlas, drawn by one instanced decal; each instance picks its cell and ink.
  const LEG = [...new Set(board.map((k) => k.l).filter(Boolean))], COLS = 12, CELL = 128;
  const atlas = () => tex(COLS * CELL, (g) => {
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    LEG.forEach((l, i) => { const size = CELL * (l.length > 2 ? 0.25 : l.length > 1 ? 0.32 : 0.5);
      g.font = `500 ${size}px "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif`; g.fillText(l, (i % COLS + 0.5) * CELL, (Math.floor(i / COLS) + 0.53) * CELL); });
  });
  const legendMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, opacity: { value: 1 } }]),
    vertexShader: `attribute vec4 uvRect; attribute vec3 ink; varying vec2 vUv; varying vec3 vInk;
      #include <fog_pars_vertex>
      void main() { vUv = uvRect.xy + uv * uvRect.zw; vInk = ink;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec2 vUv; varying vec3 vInk;
      #include <fog_pars_fragment>
      void main() { float a = texture2D(map, vUv).a * opacity; if (a < 0.02) discard; gl_FragColor = vec4(vInk, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  legendMat.uniforms.map.value = atlas();
  const labelled = board.filter((k) => k.l);
  const legendGeo = decalGeo.clone(), uvRect = new Float32Array(labelled.length * 4), inkArr = new Float32Array(labelled.length * 3);
  const legendMesh = new THREE.InstancedMesh(legendGeo, legendMat, labelled.length), inkC = new THREE.Color();
  labelled.forEach((k, i) => {
    const c = LEG.indexOf(k.l); uvRect.set([(c % COLS) / COLS, 1 - (Math.floor(c / COLS) + 1) / COLS, 1 / COLS, 1 / COLS], i * 4);
    inkC.set(INK[tone(k)]); inkArr.set([inkC.r, inkC.g, inkC.b], i * 3);
    dummy.position.copy(keyAt(k, kv)); dummy.updateMatrix(); legendMesh.setMatrixAt(i, dummy.matrix);
  });
  legendGeo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(uvRect, 4));
  legendGeo.setAttribute('ink', new THREE.InstancedBufferAttribute(inkArr, 3));
  legendMesh.renderOrder = 3; legendMesh.frustumCulled = false; scene.add(legendMesh);
  const restOpacity = new Map(fading.map((m) => [m, m.opacity]));
  const boardMats = new Set(Object.values(keyMats));

  /* ---------- v3.2: no room. The keyboard on an oak desk, lit by a lamp just out of frame; the dark is the room ---------- */
  const room = new THREE.Group(); scene.add(room); // the desk's own surroundings stay in the dark
  const lampLight = new THREE.PointLight(0xffc98f, 2400, 0, 2); lampLight.position.set(-80, DESK_Y + 70, -40); scene.add(lampLight); // the desk lamp, off frame to the left

  /* ---------- photo materials (Poly Haven, CC0): they replace the painted look as they arrive ---------- */
  // World-space UVs, so one tile is the texture's real size on every wall, board and cushion.
  const wv = new THREE.Vector3(), wn = new THREE.Vector3(), nm = new THREE.Matrix3();
  const bakeUV = (mesh) => {
    const { cm } = mesh.material.userData.photo, g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    if (!nor) return;
    mesh.updateMatrixWorld(); nm.getNormalMatrix(mesh.matrixWorld);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      wv.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); wn.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(wn.x), ay = Math.abs(wn.y), az = Math.abs(wn.z);
      const [u, v] = ay >= ax && ay >= az ? [wv.x, wv.z] : ax >= az ? [wv.z, wv.y] : [wv.x, wv.y];
      uv[i * 2] = u / cm; uv[i * 2 + 1] = v / cm;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };
  const photoCache = new Map(), texLoader = new THREE.TextureLoader();
  const photoTex = (id, file, srgb) => {
    const k = `${id}/${file}`;
    if (!photoCache.has(k)) photoCache.set(k, new Promise((res) => texLoader.load(`assets/${k}.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t);
    }, undefined, () => res(null))));
    return photoCache.get(k);
  };
  const photoMeshes = [floor];
  photoMeshes.forEach(bakeUV);
  new Set(photoMeshes.map((m) => m.material)).forEach((mat) => {
    const { id, tint } = mat.userData.photo;
    Promise.all([photoTex(id, 'diff', true), photoTex(id, 'nor'), photoTex(id, 'arm')]).then(([d, n, a]) => {
      if (!d) return; // the painted material stays if the photo did not load
      mat.map = d; mat.color.set(tint);
      if (n) { mat.normalMap = n; mat.normalScale.set(1, 1); }
      if (a) { mat.roughnessMap = a; mat.roughness = 1; } // ARM: green channel is roughness
      mat.needsUpdate = true; dirty = true;
    });
  });
  // The lamp's raking light across the desk: the only light that casts shadows, and the shadow map is drawn once.
  const sun = new THREE.DirectionalLight(0xffc690, 0);
  sun.position.set(-70, 34, -46); sun.target.position.set(6, DESK_Y, -2); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 22, bottom: -22, near: 20, far: 180 }); sun.shadow.camera.updateProjectionMatrix();
  floor.receiveShadow = plate.castShadow = plate.receiveShadow = true;
  scene.children.forEach((o) => { if (o.isInstancedMesh && o !== legendMesh) o.castShadow = o.receiveShadow = true; }); // caps shade the case and each other

  /* ---------- the switch ---------- */
  const topH = new THREE.Group(), topMesh = new THREE.Mesh(roundBox(1.4, 0.5, 1.4, 0.07, { taper: 0.2, seg: [10, 6, 10] }), topMat);
  topMesh.position.y = -0.25; topMesh.renderOrder = 2; topH.add(topMesh); scene.add(topH);          // spans 0..0.5 at rest
  const botH = new THREE.Group(), botMesh = new THREE.Mesh(roundBox(1.4, 0.75, 1.4, 0.06, { seg: [10, 6, 10] }), botMat);
  botMesh.position.y = -0.375; botMesh.renderOrder = 2; botH.add(botMesh);
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
  // v3.2: one monotone cubic (PCHIP) maps progress to a place on the curves, so speed never jumps at a shot;
  // the camera flows through every shot instead of easing in and out of each one.
  const knotT = RIG.map((s) => s.t), N1 = RIG.length - 1;
  const knotM = knotT.map((t, k) => {
    const d = (j) => 1 / (knotT[j + 1] - knotT[j]), h = (j) => knotT[j + 1] - knotT[j];
    if (k === 0) return d(0); if (k === N1) return d(N1 - 1);
    const w1 = 2 * h(k) + h(k - 1), w2 = h(k) + 2 * h(k - 1);
    return (w1 + w2) / (w1 / d(k - 1) + w2 / d(k));
  });
  const flow = (p, i) => { // place along the curves, 0..N1
    const h = knotT[i + 1] - knotT[i], x = seg(p, knotT[i], knotT[i + 1]), x2 = x * x, x3 = x2 * x;
    return (2 * x3 - 3 * x2 + 1) * i + (x3 - 2 * x2 + x) * h * knotM[i] + (-2 * x3 + 3 * x2) * (i + 1) + (x3 - x2) * h * knotM[i + 1];
  };
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), lensV = new THREE.Vector3();
  let segName = '', W = 1, H = 1;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  function rig(p, now) {
    let i = 0; while (i < RIG.length - 2 && p >= RIG[i + 1].t) i++;
    const a = RIG[i], b = RIG[i + 1], u = clamp(flow(p, i) / N1);
    segName = `${a.id} > ${b.id}`;
    path.getPoint(u, camPos); aim.getPoint(u, camTgt); lens.getPoint(u, lensV);
    const aspect = W / H;
    if (aspect < 1) camPos.sub(camTgt).multiplyScalar(1 + (1 - aspect) * 1.5 * seg(p, 0.13, P0)).add(camTgt); // portrait: step back to fit
    if (!reduced) {
      const drift = 1 - seg(old(p), 0.04, 0.16); // hero only: slow drift
      camPos.x += Math.sin(now * 0.00021) * 0.35 * drift; camPos.y += Math.sin(now * 0.00017) * 0.18 * drift;
      camPos.x += pointer.sx * 0.05; camPos.y -= pointer.sy * 0.035;
    }
    camera.position.copy(camPos); camera.lookAt(camTgt);
    camera.rotateZ(THREE.MathUtils.degToRad(lensV.y));
    camera.fov = lensV.x;
    // Shift the frame so the subject sits opposite the text panel (right on desktop, top on phones).
    if (aspect >= 1 && W > 760) camera.setViewOffset(W, H, -W * 0.19, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.13, W, H);
    const dist = camPos.distanceTo(camTgt);
    camera.near = Math.max(0.05, dist * 0.008); camera.updateProjectionMatrix();
    scene.fog.near = dist * 0.85; scene.fog.far = dist * 2.6;
    return dist;
  }

  /* ---------- parts ---------- */
  const PRE = 0.2; // 2 mm pre-travel at this scale (CHERRY MX Red, see sources.md)
  const beadAt = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  function pose(p, now, dist) {
    const press = PRE * part(p, 'capPress') + PRE * part(p, 'spring'); // 2 mm to register, 4 mm all the way (1 unit is about 10 mm)
    const ex = part(p, 'explode');
    const away = part(p, 'deskAway');
    const boardAway = Math.max(away, seg(p, 0.44, 0.56));
    fading.forEach((m) => { m.opacity = restOpacity.get(m) * (1 - (boardMats.has(m) ? boardAway : away)); });
    floor.visible = plate.visible = legendMesh.visible = away < 0.999;
    legendMat.uniforms.opacity.value = 1 - boardAway;
    scene.children.forEach((o) => { if (o.isMesh && o !== cap && o.material && fading.includes(o.material)) o.visible = away < 0.999; });
    cap.position.y = 0.72 - Math.min(press, PRE) + 2.25 * ex;
    capShadow.material.opacity = (1 - ex) * (1 - away) * (0.85 + Math.min(press, PRE) * 1.2); // darkens a touch as the cap nears the plate
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
    const o = W > 760 ? seg(p, 0.66, 0.74) : 0;
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
  // Words as runs of { t, it } pieces, so "press" + "." stay one word with only the first piece in italic.
  const wordsOf = (node, it = false, out = [], st = { open: false }) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((t) => {
        if (!t) return;
        if (/^\s+$/.test(t)) { st.open = false; return; }
        if (st.open) out.at(-1).push({ t, it }); else out.push([{ t, it }]);
        st.open = true;
      });
      else if (n.nodeType === 1) wordsOf(n, it || n.tagName === 'EM', out, st);
    });
    return out;
  };
  const putWord = (parent, word, space) => word.forEach(({ t, it }, i) => {
    const s = t + (space && i === word.length - 1 ? ' ' : '');
    if (it) { const e = document.createElement('em'); e.textContent = s; parent.append(e); } else parent.append(s);
  });
  function split() {
    groups.forEach((g) => {
      let n = 0;
      g.querySelectorAll('[data-split]').forEach((el) => {
        const tpl = document.createElement('template');
        tpl.innerHTML = el.dataset.html ?? (el.dataset.html = el.innerHTML.trim());
        const words = wordsOf(tpl.content);
        el.textContent = '';
        const spans = words.map((w) => { const s = document.createElement('span'); putWord(s, w, true); el.append(s); return s; });
        const lines = [];
        spans.forEach((s, i) => { const top = s.offsetTop; const L = lines.at(-1); if (L && Math.abs(L.top - top) < 4) L.w.push(words[i]); else lines.push({ top, w: [words[i]] }); });
        el.textContent = '';
        el.setAttribute('aria-label', words.map((w) => w.map((x) => x.t).join('')).join(' '));
        lines.forEach((L) => {
          const m = document.createElement('span'); m.className = 'mask'; m.setAttribute('aria-hidden', 'true');
          const l = document.createElement('span'); l.className = 'line'; l.style.setProperty('--i', n++);
          L.w.forEach((w, k) => putWord(l, w, k < L.w.length - 1));
          m.append(l); el.append(m);
        });
      });
    });
  }
  let textIdx = -1, inRoom = true;
  const stopEls = [...document.querySelectorAll('.stops li')];
  document.querySelectorAll('.deeper').forEach((d) => d.addEventListener('toggle', fitPlate));
  const panel = document.querySelector('.panel'), plateBg = document.querySelector('.plate-bg');
  function fitPlate() { // the plate shrinks to the active group (transform only); the panel box keeps the tallest
    const g = groups[textIdx]; if (!g) return;
    const cs = getComputedStyle(panel), pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    plateBg.style.transform = `scaleY(${((g.offsetHeight + pad) / panel.offsetHeight).toFixed(4)})`;
    plateBg.style.opacity = '1'; // the desk is busy under the type, so the plate stays
  }
  function setText(p) {
    let idx = 0; TEXT_RIG.forEach(([, t], i) => { if (p >= t) idx = i; });
    if (textIdx === -2 || idx === textIdx) return; textIdx = idx;
    groups.forEach((g, i) => { g.dataset.state = i === idx ? 'on' : i < idx ? 'after' : 'before'; g.inert = i !== idx; });
    const here = idx === 2 ? 'switch' : 'key'; let past = true;
    stopEls.forEach((li) => { const cur = li.dataset.stop === here; if (cur) past = false; li.toggleAttribute('aria-current', cur); if (cur) li.setAttribute('aria-current', 'step'); li.toggleAttribute('data-past', past && !cur); });
    fitPlate();
  }
  let shut = null;
  const setShut = (p) => { const s = p >= 0.9; if (s !== shut) { shut = s; root.classList.toggle('shut', s); } };

  /* ---------- loop: render on change, idle shimmer capped near 30 fps ---------- */
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
    renderer.setSize(W, H, false); camera.aspect = W / H; dirty = true; notesOn = -1; gaugeOn = -1;
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
    const op = old(sp);
    if ((sp < 0.12) !== inRoom) { inRoom = sp < 0.12; fitPlate(); }
    setShut(op);
    const dist = rig(sp, now);
    trailLive = pose(op, now, dist);
    annotate(op);
    measure(op);
    const r = 1 - seg(op, 0.18, 0.3); // how much of the room's light is in play; all of it fades on the push-in, no step in the key lighting
    lampLight.intensity = 2400 * r; sun.intensity = 2.6 * r;
    key.intensity = 2.6 * (1 - 0.55 * r); fill.intensity = 0.55 * (1 - 0.5 * r); rim.intensity = 1.1 * (1 - 0.85 * r); hemi.intensity = 0.4 + 0.3 * r;
    renderer.render(scene, camera);
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
  running = false; start();
  document.fonts?.ready.then(() => {
    split(); if (textIdx !== -2) textIdx = -1; dirty = true;
    // Redraw the legends once the grotesk has loaded, so the letters match the page.
    legends.forEach(({ dm, ch, ink }) => { const prev = dm.map; dm.map = legend(ch, ink); dm.needsUpdate = true; prev.dispose(); });
    { const prev = legendMat.uniforms.map.value; legendMat.uniforms.map.value = atlas(); prev.dispose(); }
  });
}
