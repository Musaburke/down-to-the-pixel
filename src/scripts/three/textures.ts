/* Small canvas textures, drawn once. `rand` is seeded, so the grain is the same on every load;
   keep the order of calls the same or the grain changes. */
import * as THREE from 'three';

interface TexOptions { srgb?: boolean; repeat?: number }

export function tex(size: number, draw: (g: CanvasRenderingContext2D, n: number) => void, o: TexOptions = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat, o.repeat); }
  t.anisotropy = 4;
  return t;
}

export const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

/** Fine grain as a normal map: random heights, lightly blurred, turned into slopes. */
export const grainNormal = (size: number, strength: number) => tex(size, (g, n) => {
  const h = new Float32Array(n * n).map(() => rand()), b = new Float32Array(n * n);
  const at = (a: Float32Array, x: number, y: number) => a[((y + n) % n) * n + ((x + n) % n)]!;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) b[y * n + x] = (at(h, x, y) * 4 + at(h, x + 1, y) + at(h, x - 1, y) + at(h, x, y + 1) + at(h, x, y - 1)) / 8;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (at(b, x + 1, y) - at(b, x - 1, y)) * strength, dy = (at(b, x, y + 1) - at(b, x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}, { repeat: 7 });

/** Painted wood: long grain streaks along u. The first paint, until the photo arrives. */
export const woodTex = (base: string, dark: string, repeat = 1) => tex(512, (g, n) => {
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 90; i++) { g.fillStyle = dark; g.globalAlpha = 0.05 + rand() * 0.16; g.fillRect(0, rand() * n, n, 0.6 + rand() * 3.2); }
  g.globalAlpha = 1;
}, { srgb: true, repeat });

/** Soft round contact shadow. */
export const blobTex = () => tex(128, (g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(0,0,0,0.62)'); r.addColorStop(0.55, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, n, n);
});

/** The page's static grain tile, as a data URL. */
export function grainTile(): string {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const g = c.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(160, 160);
  for (let i = 0; i < 160 * 160; i++) { const v = rand() > 0.5 ? 255 : 0; img.data.set([v, v, v, 90 * rand()], i * 4); }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** One keycap legend in the page's grotesk. */
export const legend = (ch: string, ink: string) => tex(512, (g, n) => {
  g.clearRect(0, 0, n, n); g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 ${n * 0.5}px "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif`; g.fillText(ch, n / 2, n * 0.53);
}, { srgb: true });

/** A soft-edged dark rectangle: the contact shadow under something box-shaped. `core` is the solid part, 0..1 of the tile. */
export const softRect = (aspect: number, core = 0.62, dark = 0.8) => {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.max(16, Math.round(256 / aspect));
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const w = c.width * core, h = c.height - (c.width - w);
  g.shadowColor = `rgba(0,0,0,${dark})`; g.shadowBlur = (c.width - w) * 0.42; g.shadowOffsetX = c.width * 2; g.fillStyle = '#000';
  g.fillRect((c.width - w) / 2 - c.width * 2, (c.height - h) / 2, w, h); // drawn off canvas: only its blurred shadow lands on it
  return new THREE.CanvasTexture(c);
};

/** A woven sleeve as a height map: two sets of diagonal strands crossing. */
export const braidTex = () => tex(64, (g, n) => {
  g.fillStyle = '#777'; g.fillRect(0, 0, n, n); g.lineWidth = n / 9; g.lineCap = 'round';
  for (const [dir, tone] of [[1, '#d8d8d8'], [-1, '#a8a8a8']] as const) { g.strokeStyle = tone;
    for (let i = -4; i <= 8; i++) { g.beginPath(); g.moveTo(i * n / 4, 0); g.lineTo(i * n / 4 + dir * n, n); g.stroke(); } }
}, { repeat: 1 });
