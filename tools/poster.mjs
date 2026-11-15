#!/usr/bin/env node
// Render the opening frame as still images, shown the moment the page loads while the live scene starts up.
// Also the phone still. Usage: node tools/poster.mjs <base-url>   (writes public/poster/*.webp; needs cwebp)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4321';
mkdirSync('public/poster', { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, w, h, dpr, q] of [['desk-wide', 1600, 1000, 1, 80], ['desk-tall', 390, 844, 2, 78]]) {
  const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
  await pg.goto(`${base}/?p=0`, { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => window.__loaded, null, { timeout: 30000 });
  await pg.waitForTimeout(1200);
  const png = `.tmp/${name}.png`;
  await pg.locator('.stage canvas').screenshot({ path: png });
  execFileSync('cwebp', ['-quiet', '-q', String(q), png, '-o', `public/poster/${name}.webp`]); rmSync(png);
  console.log(`public/poster/${name}.webp`);
  await pg.close();
}
await b.close();
