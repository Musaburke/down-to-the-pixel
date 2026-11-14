import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const url = (/^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + process.argv[2]);
const out = process.argv[3] ?? '.tmp/check'; // screenshots land here
mkdirSync(out, { recursive: true });
async function run(name, launchArgs, ctxOpts, fn) {
  const b = await chromium.launch({ channel: 'chrome', args: launchArgs });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts })).newPage();
  const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(url + (fn.q ?? ''), { waitUntil: 'networkidle' });
  await pg.waitForTimeout(800);
  await fn(pg);
  console.log(name, 'live=' + await pg.evaluate(() => document.documentElement.classList.contains('live')), 'errors:', errs.length ? errs : 'none');
  await b.close();
}
const scrollShot = async (pg, frac, file) => {
  await pg.evaluate((f) => { const w = document.querySelector('.walk'); scrollTo(0, w.offsetTop + (w.offsetHeight - innerHeight) * f); }, frac);
  await pg.waitForTimeout(1600);
  await pg.screenshot({ path: `${out}/${file}.jpg`, quality: 70 });
};
await run('normal', [], {}, async (pg) => { await scrollShot(pg, 0.35, 'real-scroll-035'); await scrollShot(pg, 0.9, 'real-scroll-090');
  console.log('  state', await pg.evaluate(() => [...document.querySelectorAll('.group')].map((g) => g.dataset.state).join(',')), 'hud:', await pg.evaluate(() => document.querySelector('.hud')?.textContent)); });
await run('debug', [], {}, Object.assign(async (pg) => { await scrollShot(pg, 0.5, 'debug-050'); console.log(' ', await pg.evaluate(() => document.querySelector('.hud').textContent.replace(/\n/g, ' | '))); }, { q: '?debug=cam' }));
await run('reduced', [], { reducedMotion: 'reduce' }, async (pg) => { await pg.screenshot({ path: `${out}/reduced-top.jpg`, quality: 70 }); await scrollShot(pg, 0.5, 'reduced-mid'); });
await run('nowebgl', ['--disable-webgl', '--disable-3d-apis'], {}, async (pg) => { await pg.screenshot({ path: `${out}/nowebgl.jpg`, quality: 70, fullPage: true }); });
await run('offscreen', [], {}, async (pg) => { await pg.evaluate(() => scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(600);
  const n = await pg.evaluate(() => new Promise((r) => { const gl = document.querySelector('canvas').getContext('webgl2'); let c = 0; const o = gl.drawElements.bind(gl); gl.drawElements = (...a) => { c++; return o(...a); }; setTimeout(() => r(c), 1000); }));
  console.log('  draw calls in 1s while offscreen:', n); });
