#!/usr/bin/env node
// Capture every stop of the walkthrough at 1440x900 and 390x844 (pinned with ?p=).
// Usage: node tools/stops.mjs <base-url> <out-dir> [--only 0,0.2] [--desktop] [--hd] [--q key=value]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : undefined; };
const [base, out] = args;
export const STOPS = [0, 0.06, 0.13, 0.2, 0.264, 0.36, 0.456, 0.552, 0.63, 0.696, 0.77, 0.84, 0.92, 1];
const only = val('--only')?.split(',').map(Number) ?? STOPS;
const extra = val('--q') ? '&' + val('--q') : '';
const sizes = args.includes('--desktop') ? [[1440, 900]] : [[1440, 900], [390, 844]];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: args.includes('--hd') ? 2 : 1 });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    for (const p of only) {
      await page.goto(`${base}/?p=${p}${extra}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => window.__ready && (window.__loaded ?? true), null, { timeout: 30000 }).catch(() => errs.push(`p=${p}: never ready`));
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/p${p.toFixed(3).replace('.', '_')}-${w}.jpg`, quality: 88 });
    }
    if (errs.length) console.log(`${w}: errors`, errs);
    await page.close();
  }
} finally { await browser.close(); }
console.log('captured', only.length, 'stops to', out);
