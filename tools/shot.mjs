#!/usr/bin/env node
// One screenshot of any URL once the scene is ready. Usage: node tools/shot.mjs <url> <out.jpg|png> [W H] [--hd]
import { chromium } from 'playwright-core';
const a = process.argv.slice(2).filter((x) => x !== '--hd'), [url, out, W = 1440, H = 900] = a;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: process.argv.includes('--hd') ? 2 : 1 });
pg.on('pageerror', (e) => console.log('pageerror', e.message)); pg.on('console', (m) => { if (m.type() === 'error') console.log('error', m.text()); });
await pg.goto(url, { waitUntil: 'networkidle' });
await pg.waitForFunction(() => window.__ready && (window.__loaded ?? true), null, { timeout: 30000 }).catch(() => console.log('never ready'));
await pg.waitForTimeout(900);
await pg.screenshot({ path: out, ...(out.endsWith('.png') ? {} : { quality: 90 }) });
await b.close(); console.log(out);
