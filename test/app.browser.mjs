// Your shore, by hand: the people list, sending straight to a lit lantern, the text that writes itself, every fallback.
// Drives the page in a phone-sized Chromium with the Bottle server played by this script. Nothing reaches the real one.
//
// Needs Playwright (not a dependency of this project) and the page served locally:
//   npm start                                   in one window
//   node test/app.browser.mjs                   in another. Pictures of each screen are left in .shots/
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const out = process.argv[2] || new URL('../.shots', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail = '') => { results.push([ok, name, detail]); console.log((ok ? 'ok    ' : 'WRONG ') + name + (detail ? '  | ' + detail : '')); };

async function phone({ reach, sent = 0, addOk = true, seed, ios = false }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1' : undefined });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  const calls = [], errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url(), fn = url.split('/').pop();
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    calls.push(fn === 'notify' ? 'notify:' + body.do : fn);
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(v) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (fn === 'bottle_reach') return reach === undefined ? json({ message: 'no such function' }, 404) : json(reach);
    if (fn === 'bottle_add') return addOk ? json('ok') : json({ message: 'down' }, 500);
    if (fn === 'bottle_list') return json([]);
    if (fn === 'bottle_open') return json('member');
    if (fn === 'notify') return json({ sent, failed: 0 });
    if (fn === 'shore_get') return json(null);
    return json('ok');
  });
  if (seed) await page.addInitScript((s) => { if (!localStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('seeded', '1'); } }, seed);
  await page.goto('http://localhost:8899/?dev');
  await page.waitForFunction(() => window.dev && window.__bottleReady);
  await page.evaluate(() => { window.dev.hold = true; });      // the software graphics chip is slow: stop the beach moving so the page stays quick
  await page.waitForTimeout(300);
  const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); return !!(e && e.offsetParent !== null); }, id);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 90000 });
  return { ctx, page, calls, errs, text, shown, shot };
}

const KEY = 'abcdefghijklmnopqrstuv', now = Date.now();
const jorge = { 'bottle-name': 'Mike', 'bottle-threads': [{ k: KEY, w: 'Jorge', s: now - 5000, t: now - 4000 }, { k: 'bbbbbbbbbbbbbbbbbbbbbb', w: 'Dad', s: now - 80000000, t: now - 90000000 }],
  'bottle-mine': ['m1', 'm2'],
  'bottle-notes': { [KEY]: [{ message: 'Game on Sunday?', name: 'Mike', mood: 'dusk', to: 'Jorge', id: 'm1', at: now - 9000 }, { message: 'I am in.', name: 'Jorge', mood: 'night', to: 'Mike', id: 'j1', at: now - 5000 }],
    bbbbbbbbbbbbbbbbbbbbbb: [{ message: 'Happy birthday', name: 'Mike', mood: 'dawn', to: 'Dad', id: 'm2', at: now - 90000000 }, { message: 'Thank you, son.', name: 'Dad', mood: 'dawn', to: 'Mike', id: 'd1', at: now - 80000000 }] } };

// 1. a phone that has never sent a bottle: the plain desk, a number, a link to text
{
  const p = await phone({});
  check('a new phone is shown the desk, not an empty shore', await p.shown('desk') && !(await p.shown('home')));
  check('a new phone is not asked about going home', !(await p.shown('toHome')));
  await p.page.fill('#forWho', 'Jorge'); await p.page.fill('#mobile', '(305) 555-0100'); await p.page.fill('#msg', 'First bottle.');
  await p.shot('1-desk-new');
  await p.page.click('#make');
  await p.page.waitForTimeout(700);
  const href = await p.page.evaluate(() => document.getElementById('text').getAttribute('href'));
  check('with a number, one button texts it to them', await p.shown('text') && (await p.text('text')) === 'Text it to Jorge', href.slice(0, 60));
  check('the text is addressed and carries the link', href.startsWith('sms:3055550100?body=') && decodeURIComponent(href).includes('Jorge, a bottle washed up for you. http://localhost:8899/#1.'));
  check('it goes by link: title and lede say so', (await p.text('madeTitle')) === 'Your bottle is ready' && (await p.text('madeLede')).startsWith('Text this link to Jorge.'), await p.text('madeLede'));
  check('the server was given the note and the lantern asked', p.calls.includes('bottle_add') && p.calls.includes('notify:bottle'));
  await p.shot('1-made-link');
  await p.page.click('#again');
  await p.page.waitForTimeout(500);
  check('afterwards the phone has a shore, with Jorge on it', await p.shown('home') && (await p.text('people')).includes('Jorge') && (await p.text('people')).includes('1 bottle'), await p.text('people'));
  const saved = await p.page.evaluate(() => JSON.parse(localStorage.getItem('bottle-threads'))[0]);
  check('the number is kept with the person', saved.w === 'Jorge' && saved.p === '3055550100');
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
}
// 2. a phone with people, and Jorge's lantern lit: straight to his shore
{
  const p = await phone({ seed: jorge, reach: { others: 1, lit: 1 }, sent: 1 });
  await p.page.waitForTimeout(900);
  check('a phone with people opens on its shore', await p.shown('home') && !(await p.shown('desk')));
  const rows = await p.page.evaluate(() => [...document.querySelectorAll('#people .row')].map((r) => r.textContent));
  check('everyone is listed, newest first, and a lit lantern is shown', rows.length === 2 && rows[0].startsWith('Jorge') && rows[0].includes('2 bottles') && rows[0].includes('lantern lit'), rows.join(' / '));
  await p.shot('2-home');
  await p.page.click('#people .row');
  await p.page.waitForTimeout(500);
  check('tapping a name opens a bottle for them', (await p.text('deskTitle')) === 'A bottle for Jorge' && (await p.text('make')) === 'Send to Jorge', await p.text('deskLede'));
  check('no number is asked for when the lantern is lit', !(await p.shown('mobileRow')) && !(await p.shown('forRow')));
  await p.page.fill('#msg', 'See you at nine.');
  await p.shot('2-desk-direct');
  await p.page.click('#make');
  await p.page.waitForTimeout(1200);
  check('sent straight to the lantern: no link shown', (await p.text('madeTitle')) === 'Sent to Jorge' && !(await p.shown('link')) && !(await p.shown('share')), await p.text('madeLede'));
  check('it says what the bottle leaves on the shore', (await p.text('madeLede')).includes('It is bottle 3 between you, and it leaves a new shell'));
  await p.shot('2-made-sent');
  await p.page.click('#showLink');
  check('the link is one tap away all the same', await p.shown('link') && await p.shown('copy'));
  await p.page.click('#again'); await p.page.waitForTimeout(400);
  check('back on the shore, Jorge now has three', (await p.text('people')).includes('3 bottles'));
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
}
// 3. his lantern was lit, but did not answer this time
{
  const p = await phone({ seed: jorge, reach: { others: 1, lit: 1 }, sent: 0 });
  await p.page.waitForTimeout(700);
  await p.page.click('#people .row'); await p.page.waitForTimeout(400);
  await p.page.fill('#msg', 'Are you there?'); await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('lantern silent: the page says so and offers the link', (await p.text('madeTitle')) === 'Your bottle is ready' && (await p.text('madeLede')).includes('the lantern did not answer') && await p.shown('link'), await p.text('madeLede'));
  await p.shot('3-made-silent');
  await p.ctx.close();
}
// 4. the server is down: the link still works
{
  const p = await phone({ seed: jorge, reach: { others: 1, lit: 1 }, addOk: false });
  await p.page.waitForTimeout(700);
  await p.page.click('#people .row'); await p.page.waitForTimeout(400);
  await p.page.fill('#msg', 'Still here.'); await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('server down: text the link', (await p.text('madeLede')).startsWith('The server could not be reached, so text Jorge the link') && await p.shown('link'));
  await p.ctx.close();
}
// 5. a server that has not been taught about lanterns yet (today's): the old way, and it learns from the send
{
  const p = await phone({ seed: jorge, sent: 1 });
  await p.page.waitForTimeout(900);
  const rows = await p.page.evaluate(() => [...document.querySelectorAll('#people .row')].map((r) => r.textContent));
  check('untaught server: the shore still lists everyone', rows.length === 2 && !rows[0].includes('lantern lit'), rows.join(' / '));
  check('untaught server: asked once, then left alone', p.calls.filter((c) => c === 'bottle_reach').length === 1, String(p.calls.filter((c) => c === 'bottle_reach').length));
  await p.page.click('#people .row'); await p.page.waitForTimeout(400);
  check('untaught server: a link is made as before', (await p.text('make')) === 'Create bottle');
  await p.page.fill('#msg', 'Old way.'); await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('and when the lantern answers, it says no text is needed', (await p.text('madeTitle')) === 'Sent to Jorge' && (await p.text('madeLede')).includes('has already been told. No need to text this one.'), await p.text('madeLede'));
  await p.page.click('#again'); await p.page.waitForTimeout(400);
  await p.page.click('#people .row'); await p.page.waitForTimeout(300);
  check('next time it goes straight there', (await p.text('make')) === 'Send to Jorge');
  await p.ctx.close();
}
// 6. a new bottle is waiting, and an iPhone's text link
{
  const waiting = JSON.parse(JSON.stringify(jorge)); waiting['bottle-threads'][1].s = now - 85000000;      // Dad's last was never opened here
  const p = await phone({ seed: waiting, ios: true });
  await p.page.waitForTimeout(900);
  const first = await p.page.evaluate(() => document.querySelector('#people .row').textContent);
  check('a waiting bottle comes first and says so', first.startsWith('Dad') && first.includes('A new bottle washed up'), first);
  check('and the shore says a bottle is waiting', (await p.text('homeLede')) === 'A bottle is waiting for you.');
  await p.shot('6-home-waiting');
  await p.page.click('#newOne'); await p.page.waitForTimeout(300);
  check('someone new: the full desk, with a way back', await p.shown('forRow') && await p.shown('toHome') && (await p.text('deskTitle')) === 'Message in a bottle');
  await p.page.fill('#forWho', 'Ana'); await p.page.fill('#mobile', '+1 305 555 0199'); await p.page.fill('#msg', 'Hello.');
  await p.page.click('#make'); await p.page.waitForTimeout(600);
  const href = await p.page.evaluate(() => document.getElementById('text').getAttribute('href'));
  check('an iPhone writes the text link its own way', href.startsWith('sms:+13055550199&body='), href.slice(0, 40));
  await p.page.click('#again'); await p.page.waitForTimeout(300);
  await p.page.click('#people .row'); await p.page.waitForTimeout(2500);
  check('tapping a waiting bottle opens it on the beach', await p.page.evaluate(() => location.hash.startsWith('#1.') && document.documentElement.classList.contains('reading')));
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
}
await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(bad.length ? `\n${bad.length} WRONG` : `\nall ${results.length} ok`);
process.exit(bad.length ? 1 : 0);
