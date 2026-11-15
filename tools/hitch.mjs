#!/usr/bin/env node
// Scroll the walkthrough slowly and print every frame over 40 ms with the progress it happened at and the shader program count.
// Usage: node tools/hitch.mjs <url> [--back]
import { chromium } from 'playwright-core';
const url = process.argv[2];
const b = await chromium.launch({ channel: 'chrome', headless: false });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
await pg.goto(url, { waitUntil: 'networkidle' });
await pg.waitForFunction(() => window.__loaded, null, { timeout: 30000 });
await pg.waitForTimeout(1500);
const out = await pg.evaluate(async (back) => {
  const log = []; let last = performance.now(), on = true, progs = window.__programs;
  const tick = (t) => { const d = t - last; last = t; if (d > 40 || window.__programs !== progs) log.push(`${d.toFixed(0)}ms at sp ${window.__sp.toFixed(3)} programs ${progs}->${window.__programs}`); progs = window.__programs; if (on) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const max = document.documentElement.scrollHeight - innerHeight;
  for (let y = 0; y <= max; y += 12) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
  if (back) for (let y = max; y >= 0; y -= 30) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
  on = false; return log;
}, process.argv.includes('--back'));
console.log(out.length ? out.join('\n') : 'no frame over 40 ms'); await b.close();
