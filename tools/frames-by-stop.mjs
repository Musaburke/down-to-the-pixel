#!/usr/bin/env node
// Average frame time per stretch of the walkthrough, headed (real GPU). Usage: node tools/frames-by-stop.mjs <url>
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: false });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
await pg.goto(process.argv[2], { waitUntil: 'networkidle' });
await pg.waitForFunction(() => window.__loaded, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
const rows = await pg.evaluate(async () => {
  const out = {}, max = document.documentElement.scrollHeight - innerHeight;
  let last = performance.now();
  for (let y = 0; y <= max; y += 10) {
    scrollTo(0, y); const t = await new Promise((r) => requestAnimationFrame(r)); const dt = t - last; last = t;
    const k = (Math.floor((window.__sp ?? 0) * 20) / 20).toFixed(2); (out[k] ??= []).push(dt);
  }
  return Object.entries(out).map(([k, a]) => `${k}  ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1)} ms  (${a.length} frames)`);
});
console.log(rows.join('\n')); await b.close();
