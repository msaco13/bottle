// By hand, after every publish: node test/live.smoke.mjs   (needs Playwright; see test/app.browser.mjs)
// Opens the LIVE site in a phone-sized Chromium with every call to the server blocked, so it changes nothing and counts nothing:
// a link from the first version still opens, a new phone sees the desk, a phone with people sees its shore.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SITE = 'https://msaco13.github.io/bottle/';
const open = async (url, seed) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/supabase\.co/, (r) => r.abort());                       // nothing reaches the real server
  if (seed) await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
  await page.goto(url);
  await page.waitForFunction(() => window.dev && window.__bottleReady);
  await page.evaluate(() => { window.dev.hold = true; });
  await page.waitForTimeout(500);
  const vis = (id) => page.evaluate((i) => { const e = document.getElementById(i); return !!(e && e.offsetParent !== null); }, id);
  return { page, ctx, errs, vis };
};
const now = Date.now(), K = 'abcdefghijklmnopqrstuv';
let p = await open(SITE + '?dev#1.WyJIYXBweSBiaXJ0aGRheSwgRGFkLlxuU2FtZSBiZW5jaCwgU3VuZGF5IGF0IDk_IiwiTWlrZSJd');
console.log('first-version link opens on the live site:', await p.page.evaluate(() => document.documentElement.classList.contains('reading')), '| errors:', p.errs.length); await p.ctx.close();
p = await open(SITE + '?dev');
console.log('new phone sees the desk:', await p.vis('desk'), '| offers a picture:', await p.vis('picAdd'), '| shore hidden:', !(await p.vis('home')), '| errors:', p.errs.length); await p.ctx.close();
p = await open(SITE + '?dev', { 'bottle-threads': [{ k: K, w: 'Jorge', s: now, t: now }], 'bottle-mine': ['m1'], 'bottle-notes': { [K]: [{ message: 'Hi', name: 'Mike', mood: 'dusk', to: 'Jorge', id: 'm1', at: now }] } });
console.log('phone with people sees its shore:', await p.vis('home'), '|', await p.page.evaluate(() => document.getElementById('people').textContent), '| errors:', p.errs.length);
await p.page.click('#people .row'); await p.page.waitForTimeout(400);
console.log('tap a name:', await p.page.evaluate(() => [document.getElementById('deskTitle').textContent, document.getElementById('make').textContent])); await p.ctx.close();
await browser.close();
