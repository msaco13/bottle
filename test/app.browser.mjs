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

const shelf = new Map();          // the pictures the pretend server is holding, by name
const open = new Map();           // and the beaches many people are filling: conversation number -> rows
async function phone({ reach, sent = 0, addOk = true, seed, ios = false, picOk = true, listOk = true, at = '?dev', share = '' }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1' : undefined });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  const calls = [], errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url(), fn = url.split('/').pop().split('?')[0];
    if (url.includes('/storage/v1/object/')) {
      if (route.request().method() === 'POST') {
        calls.push('picture:add');
        if (!picOk) return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"down"}' });
        shelf.set(fn, route.request().postDataBuffer());
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Key":"pictures/' + fn + '"}' });
      }
      calls.push('picture:get');
      return shelf.has(fn) ? route.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: shelf.get(fn) })
        : route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"not found"}' });
    }
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    calls.push(fn === 'notify' ? 'notify:' + body.do + (body.k ? ':' + body.k : '') : fn);
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(v) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (fn === 'bottle_reach') return reach === undefined ? json({ message: 'no such function' }, 404) : json(reach);
    if (fn === 'bottle_add') return addOk ? json('ok') : json({ message: 'down' }, 500);
    if (fn === 'add_bottle') {
      if (!addOk) return json({ message: 'down' }, 500);
      const rows = open.get(body.p_thread) || [];
      rows.push({ id: rows.length + 1, body: body.p_body, created_at: new Date(Date.now() + rows.length * 1000).toISOString() });
      open.set(body.p_thread, rows);
      return json('ok');
    }
    if (fn === 'bottle_list') return listOk ? json([...(open.get(body.p_thread) || [])].reverse()) : json({ message: 'down' }, 500);
    if (fn === 'bottle_open') return json('member');
    if (fn === 'notify') return json({ sent: typeof sent === 'function' ? sent(calls.filter((c) => c.startsWith('notify:bottle')).length) : sent, failed: 0 });
    if (fn === 'shore_get') return json(null);
    return json('ok');
  });
  // a phone with a share sheet: 'ok' the person sends it, 'abort' they close the sheet without sending
  if (share) await page.addInitScript((how) => { window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return how === 'ok' ? Promise.resolve() : Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' })); }; }, share);
  if (seed) await page.addInitScript((s) => { if (!localStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('seeded', '1'); } }, seed);
  await page.goto('http://localhost:8899/' + at);
  await page.waitForFunction(() => window.dev && window.__bottleReady);
  await page.evaluate(() => { window.dev.hold = true; });      // the software graphics chip is slow: stop the beach moving so the page stays quick
  await page.waitForTimeout(300);
  const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); return !!(e && e.offsetParent !== null); }, id);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 90000 });
  return { ctx, page, calls, errs, text, shown, shot };
}

const KEY = 'abcdefghijklmnopqrstuv', now = Date.now();
/** Tap the first name on the list, then "Write to ..." on the beach it leads to. */
const writeTo = async (p) => { await p.page.click('#people .row'); await p.page.waitForTimeout(250); await p.page.click('#visitWrite'); };
const jorge = { 'bottle-name': 'Mike', 'bottle-threads': [{ k: KEY, w: 'Jorge', s: now - 5000, t: now - 4000 }, { k: 'bbbbbbbbbbbbbbbbbbbbbb', w: 'Dad', s: now - 80000000, t: now - 90000000 }],
  'bottle-mine': ['m1', 'm2'],
  'bottle-notes': { [KEY]: [{ message: 'Game on Sunday?', name: 'Mike', mood: 'dusk', to: 'Jorge', id: 'm1', at: now - 9000 }, { message: 'I am in.', name: 'Jorge', mood: 'night', to: 'Mike', id: 'j1', at: now - 5000 }],
    bbbbbbbbbbbbbbbbbbbbbb: [{ message: 'Happy birthday', name: 'Mike', mood: 'dawn', to: 'Dad', id: 'm2', at: now - 90000000 }, { message: 'Thank you, son.', name: 'Dad', mood: 'dawn', to: 'Mike', id: 'd1', at: now - 80000000 }] } };

// 1. a phone that has never sent a bottle: the plain desk, a number, a link to text
{
  const p = await phone({});
  check('a new phone is shown the desk, not an empty shore', await p.shown('desk') && !(await p.shown('home')));
  check('a new phone is not asked about going home', !(await p.shown('toHome')));
  await p.page.fill('#forWho', 'Jorge');
  check('their number is not asked for up front: it is behind one small link', await p.shown('mobileAsk') && !(await p.shown('mobileRow')));
  await p.page.click('#mobileAsk'); await p.page.fill('#mobile', '(305) 555-0100'); await p.page.fill('#msg', 'First bottle.');
  await p.shot('1-desk-new');
  await p.page.click('#make');
  await p.page.waitForTimeout(700);
  const href = await p.page.evaluate(() => document.getElementById('text').getAttribute('href'));
  check('with a number, one button texts it to them', await p.shown('text') && (await p.text('text')) === 'Text it to Jorge', href.slice(0, 60));
  check('the text is addressed and carries the link', href.startsWith('sms:3055550100?body=') && decodeURIComponent(href).includes('Jorge, a bottle washed up for you. Open it, then write back: http://localhost:8899/#1.'));
  check('it goes by link: the screen says there is one step left, and nothing to copy', (await p.text('madeTitle')) === 'Last step: send it to Jorge' && (await p.text('madeLede')).startsWith('Your note is inside the link, so one tap sends the whole bottle. Nothing to copy or paste.'), await p.text('madeLede'));
  check('and once the server has it, that the answer will come back here', (await p.text('madeNext')) === 'When Jorge writes back, it shows up here.', await p.text('madeNext'));
  check('the server was given the note and the lantern asked', p.calls.includes('bottle_add') && p.calls.includes('notify:bottle'));
  check('with one tap to send it, the bare link is out of sight', !(await p.shown('link')) && (await p.text('copy')) === 'Copy the link instead');
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
  check('everyone is listed, newest first, and a lit lantern is shown', rows.length === 2 && rows[0].startsWith('Jorge') && rows[0].includes('2 bottles') && rows[0].includes('notifications on'), rows.join(' / '));
  await p.shot('2-home');
  await p.page.click('#people .row');
  await p.page.waitForTimeout(400);
  check('tapping a name leads to the beach the two share', await p.shown('visit') && !(await p.shown('home')) && (await p.text('visitWho')) === 'The beach you share with Jorge' && (await p.text('visitWrite')) === 'Write to Jorge', await p.text('visitWho'));
  await p.shot('2-beach');
  await p.page.click('#visitWrite');
  await p.page.waitForTimeout(500);
  check('and from there, one tap opens a bottle for them', (await p.text('deskTitle')) === 'A bottle for Jorge' && (await p.text('make')) === 'Send to Jorge', await p.text('deskLede'));
  check('no number is asked for when the lantern is lit', !(await p.shown('mobileRow')) && !(await p.shown('mobileAsk')) && !(await p.shown('forRow')));
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
  await writeTo(p); await p.page.waitForTimeout(400);
  await p.page.fill('#msg', 'Are you there?'); await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('lantern silent: the page says so and offers the link', (await p.text('madeTitle')) === 'Your bottle is ready' && (await p.text('madeLede')).includes('phone could not be told this time') && await p.shown('link'), await p.text('madeLede'));
  await p.shot('3-made-silent');
  await p.ctx.close();
}
// 4. the server is down: the link still works
{
  const p = await phone({ seed: jorge, reach: { others: 1, lit: 1 }, addOk: false });
  await p.page.waitForTimeout(700);
  await writeTo(p); await p.page.waitForTimeout(400);
  await p.page.fill('#msg', 'Still here.'); await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('server down: text the link', (await p.text('madeLede')).startsWith('The server could not be reached, so text Jorge the link') && await p.shown('link'));
  await p.ctx.close();
}
// 5. a server that has not been taught about lanterns yet (today's): the old way, and it learns from the send
{
  const p = await phone({ seed: jorge, sent: 1 });
  await p.page.waitForTimeout(900);
  const rows = await p.page.evaluate(() => [...document.querySelectorAll('#people .row')].map((r) => r.textContent));
  check('untaught server: the shore still lists everyone', rows.length === 2 && !rows[0].includes('notifications on'), rows.join(' / '));
  check('untaught server: asked once, then left alone', p.calls.filter((c) => c === 'bottle_reach').length === 1, String(p.calls.filter((c) => c === 'bottle_reach').length));
  await writeTo(p); await p.page.waitForTimeout(400);
  check('untaught server: a link is made as before', (await p.text('make')) === 'Seal it and send');
  await p.page.fill('#msg', 'Old way.'); await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('and when the lantern answers, it says no text is needed', (await p.text('madeTitle')) === 'Sent to Jorge' && (await p.text('madeLede')).includes('has already been told. No need to text this one.'), await p.text('madeLede'));
  await p.page.click('#again'); await p.page.waitForTimeout(400);
  await writeTo(p); await p.page.waitForTimeout(300);
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
  check('someone new: the full desk, with a way back', await p.shown('forRow') && await p.shown('toHome') && (await p.text('deskTitle')) === 'Cast your bottle');
  await p.page.fill('#forWho', 'Ana'); await p.page.click('#mobileAsk'); await p.page.fill('#mobile', '+1 305 555 0199'); await p.page.fill('#msg', 'Hello.');
  await p.page.click('#make'); await p.page.waitForTimeout(600);
  const href = await p.page.evaluate(() => document.getElementById('text').getAttribute('href'));
  check('an iPhone writes the text link its own way', href.startsWith('sms:+13055550199&body='), href.slice(0, 40));
  await p.page.click('#again'); await p.page.waitForTimeout(300);
  await p.page.click('#people .row'); await p.page.waitForTimeout(2500);
  check('tapping a waiting bottle opens it on the beach', await p.page.evaluate(() => location.hash.startsWith('#1.') && document.documentElement.classList.contains('reading')));
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
}
// 7. one bottle for several people: a bottle each, straight to the lit lantern, a link for each of the others
{
  const three = JSON.parse(JSON.stringify(jorge));
  three['bottle-threads'].push({ k: 'cccccccccccccccccccccc', w: 'Ana', s: now - 99000000, t: now - 99000000, p: '+13055550199' });
  three['bottle-notes'].cccccccccccccccccccccc = [{ message: 'Hola', name: 'Ana', mood: 'dusk', to: 'Mike', id: 'a1', at: now - 99000000 }];
  three['bottle-reach'] = { [KEY]: { j: 1, l: 1, t: now } };                    // Jorge's lantern was lit when last heard
  const p = await phone({ seed: three, sent: (n) => (n === 1 ? 1 : 0) });       // the server here cannot say who is reachable; only the first phone answers its lantern
  await p.page.waitForTimeout(900);
  check('with several people, the shore offers one bottle for several', await p.shown('several'));
  await p.page.click('#several'); await p.page.waitForTimeout(200);
  check('nothing can be written until two are chosen', await p.page.evaluate(() => document.getElementById('newOne').disabled) && (await p.text('newOne')) === 'Choose two or more');
  for (let i = 0; i < 3; i++) await p.page.click(`#people .person:nth-child(${i + 1}) .row`);
  await p.page.waitForTimeout(200);
  check('three are ticked', (await p.page.evaluate(() => document.querySelectorAll('#people .row.picked').length)) === 3 && (await p.text('newOne')) === 'Write to these 3');
  await p.shot('7-choosing');
  await p.page.click('#newOne'); await p.page.waitForTimeout(400);
  check('the desk names all three', (await p.text('deskTitle')) === 'A bottle for Jorge, Dad and Ana' && (await p.text('make')) === 'Send to 3 people', await p.text('deskLede'));
  await p.page.fill('#msg', 'Beach on Saturday. Who is in?');
  await p.page.click('#make'); await p.page.waitForTimeout(3500);
  const rows = await p.page.evaluate(() => [...document.querySelectorAll('.sentRow')].map((r) => ({ text: r.textContent, href: (r.querySelector('a') || {}).href || '', done: r.classList.contains('done') })));
  check('each person has a line, and the title adds them up', rows.length === 3 && (await p.text('madeTitle')) === '1 sent, 2 to text', (await p.text('madeTitle')) + ' | ' + rows.map((r) => r.text).join(' / '));
  check('the lit lantern was told and needs nothing more', rows[0].text.startsWith('Jorge') && rows[0].done && rows[0].text.includes('phone has been told') && !rows[0].href);
  check('the one with a number gets a text already addressed, with her own link', rows[2].text.startsWith('Ana') && rows[2].href.startsWith('sms:+13055550199?body=') && decodeURIComponent(rows[2].href).includes('Ana, a bottle washed up for you. Open it, then write back: http://localhost:8899/#1.'), rows[2].href.slice(0, 50));
  check('the one without a number gets his own link to pass on', rows[1].text.startsWith('Dad') && /(Share|Copy) Dad\u2019s link/.test(rows[1].text), rows[1].text);
  check('three notes went to three conversations', p.calls.filter((c) => c === 'bottle_add').length === 3);
  const kept = await p.page.evaluate(() => { const n = JSON.parse(localStorage.getItem('bottle-notes')); return Object.values(n).map((v) => v.length); });
  check('and each conversation remembers its own', kept.join(',') === '3,3,2', kept.join(','));
  await p.shot('7-sent-many');
  await p.page.click('#again'); await p.page.waitForTimeout(400);
  check('back on the shore, no one is ticked any more', (await p.page.evaluate(() => document.querySelectorAll('#people .row.picked').length)) === 0 && (await p.text('newOne')) === 'A bottle for someone new');
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
}
// 8. a picture in the bottle: chosen, made smaller, scrambled, sent, and shown on the paper at the other end
{
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFklEQVR42mP8z8Dwn4EIwMRAJBhVCAA7VAIKzTXl3QAAAABJRU5ErkJggg==', 'base64');
  const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const p = await phone({});
  check('the desk offers a picture', await p.shown('picAdd') && (await p.text('picAdd')) === 'Picture or GIF');
  await p.page.setInputFiles('#picFile', { name: 'beach.png', mimeType: 'image/png', buffer: PNG });
  await p.page.waitForFunction(() => /tucked in\./.test(document.getElementById('picSay').textContent), null, { timeout: 20000 });
  check('a chosen photo is tucked in, and shown small on the desk', (await p.text('picSay')) === 'Your picture is tucked in.' && await p.shown('picThumb') && !(await p.shown('picAdd')));
  check('what left the phone is scrambled, not a picture', shelf.size === 1 && ![...shelf.values()][0].subarray(0, 60).toString('latin1').match(/JFIF|PNG|GIF8/) && /^[0-9a-f]{40}$/.test([...shelf.keys()][0]), [...shelf.keys()][0]);
  await p.page.fill('#forWho', 'Ana'); await p.page.fill('#msg', 'Remember this place?');
  await p.shot('8-desk-picture');
  await p.page.click('#make'); await p.page.waitForTimeout(700);
  const link = await p.page.evaluate(() => document.getElementById('link').value);
  check('the link carries the picture\u2019s secret, and it is not the name the server knows', /#1\./.test(link) && !link.includes([...shelf.keys()][0]));
  await p.ctx.close();
  // the other phone
  const q = await phone({ at: link.replace('http://localhost:8899/', '').replace('#', '?dev#') });
  await q.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await q.page.waitForFunction(() => document.getElementById('picWrap').classList.contains('got'), null, { timeout: 20000 });
  const seen = await q.page.evaluate(() => { const i = document.getElementById('pic'); return [i.naturalWidth, i.naturalHeight, document.getElementById('words').textContent]; });
  check('the other phone sees the picture on the paper, above the words', seen[0] === 8 && seen[1] === 6 && seen[2] === 'Remember this place?', seen.join(' x '));
  await q.page.waitForTimeout(2500);
  await q.shot('8-letter-picture');
  await q.page.click('#pic'); await q.page.waitForTimeout(200);
  check('a tap shows it large, and a tap puts it away', await q.shown('picBig'));
  await q.page.click('#picBig'); await q.page.waitForTimeout(200);
  check('and it is put away again', !(await q.shown('picBig')));
  check('no errors', !p.errs.length && !q.errs.length, [...p.errs, ...q.errs].join(' ; '));
  await q.ctx.close();
  // a GIF goes as it is; a picture with no words is still a bottle
  const g = await phone({});
  await g.page.setInputFiles('#picFile', { name: 'wave.gif', mimeType: 'image/gif', buffer: GIF });
  await g.page.waitForFunction(() => /tucked in\./.test(document.getElementById('picSay').textContent), null, { timeout: 20000 });
  check('a GIF is tucked in as a GIF', (await g.text('picSay')) === 'Your GIF is tucked in.');
  await g.page.click('#make'); await g.page.waitForTimeout(600);
  const gifLink = await g.page.evaluate(() => document.getElementById('link').value);
  check('a picture with no words still makes a bottle', (await g.text('madeTitle')) === 'Your bottle is ready' && /#1\./.test(gifLink));
  await g.ctx.close();
  const h = await phone({ at: gifLink.replace('http://localhost:8899/', '').replace('#', '?dev#') });
  await h.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await h.page.waitForFunction(() => document.getElementById('picWrap').classList.contains('got'), null, { timeout: 20000 });
  check('and the GIF arrives still a GIF', await h.page.evaluate(async () => (await (await fetch(document.getElementById('pic').src)).blob()).type === 'image/gif'));
  await h.ctx.close();
  // things that go wrong are said plainly, and a bottle never leaves without the picture it was given
  const big = await phone({});
  await big.page.setInputFiles('#picFile', { name: 'huge.gif', mimeType: 'image/gif', buffer: Buffer.concat([GIF, Buffer.alloc(3600000)]) });
  await big.page.waitForFunction(() => /too big/.test(document.getElementById('picSay').textContent), null, { timeout: 20000 });
  check('a GIF that is too big is refused with the reason', (await big.text('picSay')).startsWith('That GIF is too big to send'));
  await big.page.fill('#msg', 'With a picture that would not go.'); await big.page.click('#make'); await big.page.waitForTimeout(500);
  check('and the bottle is not made without it', !(await big.shown('made')) && await big.shown('desk'));
  await big.page.click('#picDrop'); await big.page.click('#make'); await big.page.waitForTimeout(500);
  check('until the picture is removed', await big.shown('made'));
  await big.ctx.close();
  const down = await phone({ picOk: false });
  await down.page.setInputFiles('#picFile', { name: 'beach.png', mimeType: 'image/png', buffer: PNG });
  await down.page.waitForFunction(() => /could not be sent/.test(document.getElementById('picSay').textContent), null, { timeout: 20000 });
  check('a server that will not take the picture is said so', (await down.text('picSay')) === 'It could not be sent just now. Remove it and try again.');
  await down.ctx.close();
  // a picture that has gone missing does not hold up the words
  shelf.clear();
  const lost = await phone({ at: link.replace('http://localhost:8899/', '').replace('#', '?dev#') });
  await lost.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await lost.page.waitForFunction(() => /could not be brought in/.test(document.getElementById('picNote').textContent), null, { timeout: 20000 });
  check('a picture that cannot be fetched says so, and the words are there all the same', (await lost.text('words')) === 'Remember this place?' && (await lost.text('picNote')).includes('Tap here to try again'));
  await lost.ctx.close();
}
// 9. a note nobody signed, in a conversation this phone knows: it still says who it is from
{
  const { linkFor } = await import('../js/code.js');
  const to = (b) => linkFor('http://localhost:8899/', b).replace('http://localhost:8899/', '').replace('#', '?dev#');
  const read = async (b) => {
    const p = await phone({ seed: jorge, at: to(b) });
    await p.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
    await p.page.waitForTimeout(1500);
    const got = [await p.text('sign'), await p.text('reply'), await p.text('fresh')];
    await p.ctx.close();
    return got;
  };
  let got = await read({ message: 'ha', name: '', mood: 'night', to: 'Mike', key: KEY });
  check('an unsigned note says whose conversation it came from', got[0] === 'Not signed. From your bottles with Jorge.' && got[1] === 'Write back to Jorge', got.join(' | '));
  check('and a phone with people is offered the way back to its shore', got[2] === 'Back to your beaches');
  got = await read({ message: 'my own, unsigned', name: '', mood: 'dusk', to: 'Jorge', key: KEY });
  check('this phone\u2019s own unsigned note is not put down to the other person', got[0] === '' && got[1] === 'Send another to Jorge', got.join(' | '));
  got = await read({ message: 'signed', name: 'Jorge', mood: 'dusk', to: 'Mike', key: KEY });
  check('a signed note is signed as before', got[0] === '~ Jorge' && got[1] === 'Write back to Jorge', got.join(' | '));
  got = await read({ message: 'from nowhere', name: '', mood: 'dusk', to: '', key: 'zzzzzzzzzzzzzzzzzzzzzz' });
  check('an unsigned note from a conversation this phone does not know says nothing it cannot know', got[0] === '' && got[1] === 'Write back', got.join(' | '));
}
// 10. the little things: rename or remove someone, a quick way through the preview, shells out of the way of the words
{
  const p = await phone({ seed: jorge });
  await p.page.waitForTimeout(700);
  check('the shore offers to rename or remove someone', await p.shown('editPeople') && (await p.text('editPeople')) === 'Rename or remove someone');
  await p.page.click('#editPeople'); await p.page.waitForTimeout(200);
  check('names become fields, and the other buttons step aside', (await p.page.evaluate(() => document.querySelectorAll('#people input.rowEdit').length)) === 2 && !(await p.shown('newOne')) && (await p.text('editPeople')) === 'Done');
  await p.page.fill('#people .person:nth-child(1) input', 'Jorge M.'); await p.page.press('#people .person:nth-child(1) input', 'Tab');
  await p.page.click('#people .person:nth-child(2) .peek'); await p.page.waitForTimeout(150);
  check('removing asks for a second tap', (await p.page.evaluate(() => document.querySelector('#people .person:nth-child(2) .peek').textContent)) === 'Tap again to remove' && (await p.page.evaluate(() => document.querySelectorAll('#people .person').length)) === 2);
  await p.page.click('#people .person:nth-child(2) .peek'); await p.page.waitForTimeout(200);
  await p.page.click('#editPeople'); await p.page.waitForTimeout(600);
  const rows = await p.page.evaluate(() => [...document.querySelectorAll('#people .row')].map((r) => r.textContent));
  const kept = await p.page.evaluate(() => ({ th: JSON.parse(localStorage.getItem('bottle-threads')), gone: JSON.parse(localStorage.getItem('bottle-gone')), notes: Object.keys(JSON.parse(localStorage.getItem('bottle-notes'))) }));
  check('one is renamed and the other is gone from this phone', rows.length === 1 && rows[0].startsWith('Jorge M.') && kept.th.length === 1 && kept.th[0].w === 'Jorge M.' && kept.gone[0] === 'bbbbbbbbbbbbbbbbbbbbbb' && kept.notes.length === 1, rows.join(' / '));
  await p.ctx.close();
  // a name given by hand stays, whatever a note is signed with
  const { linkFor } = await import('../js/code.js');
  const named = JSON.parse(JSON.stringify(jorge)); named['bottle-threads'][0].w = 'Jorge M.'; named['bottle-threads'][0].n = 1;
  const at = (b, q) => linkFor('http://localhost:8899/', b).replace('http://localhost:8899/', '').replace('#', q + '#');
  const r = await phone({ seed: named, at: at({ message: 'signed another way', name: 'J-Dog', mood: 'dusk', to: 'Mike', key: KEY }, '?dev') });
  await r.page.touchscreen.tap(20, 20);
  await r.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(4); window.dev.hold = true; });
  await r.page.waitForTimeout(1200);
  check('a name given by hand is kept when a note is signed differently', (await r.page.evaluate(() => JSON.parse(localStorage.getItem('bottle-threads'))[0].w)) === 'Jorge M.');
  check('shells fade out of the way while a note is read', (await r.page.evaluate(() => window.dev.scene.keepHide)) > 0.95, String(await r.page.evaluate(() => window.dev.scene.keepHide)));
  await r.ctx.close();
  // "See what they will see"
  const w = await phone({});
  await w.page.fill('#msg', 'A look before it goes.'); await w.page.click('#make'); await w.page.waitForTimeout(500);
  const href = await w.page.evaluate(() => document.getElementById('try').getAttribute('href'));
  check('the preview link says it is a preview', /\?dev&see#1\./.test(href), href.slice(0, 50));
  await w.ctx.close();
  const v = await phone({ at: href.replace('http://localhost:8899/', '') });
  await v.page.evaluate(() => { window.dev.hold = false; window.dev.frame(1 / 60); window.dev.hold = true; });
  check('and the way straight to the note is offered at once', await v.page.evaluate(() => document.getElementById('skip').classList.contains('show')));
  await v.ctx.close();
  const n = await phone({ at: href.replace('http://localhost:8899/', '').replace('&see', '') });
  await n.page.evaluate(() => { window.dev.hold = false; window.dev.frame(1 / 60); window.dev.hold = true; });
  check('someone opening the real link is not hurried', !(await n.page.evaluate(() => document.getElementById('skip').classList.contains('show'))));
  await n.ctx.close();
}
// 11. a beach many people fill for one person: started, added to from an invitation, and opened bottle by bottle
{
  const { linkFor } = await import('../js/code.js');
  const { threadId, seal } = await import('../js/thread.js');
  const rel = (l, q = '?dev') => l.replace('http://localhost:8899/', '').replace('#', q + '#');
  // the one who starts it
  const p = await phone({});
  check('the desk offers a beach from everyone', await p.shown('gatherB'));
  await p.page.click('#gatherB'); await p.page.waitForTimeout(200);
  check('starting a beach asks who it is for and what for', (await p.text('deskTitle')) === 'A beach full of bottles' && await p.shown('occasion') && await p.shown('forWho') && (await p.text('make')) === 'Start the beach');
  await p.page.fill('#who', 'Mike'); await p.page.fill('#msg', 'Forty looks good on you.');
  await p.page.click('#make'); await p.page.waitForTimeout(300);
  check('it will not start without saying who it is for', (await p.text('gatherSay')) === 'Say who the beach is for.' && await p.shown('desk'));
  await p.page.fill('#forWho', 'Ana'); await p.page.fill('#occasion', 'Happy 40th');
  await p.page.click('#make');
  await p.page.waitForFunction(() => document.getElementById('made').classList.contains('gather'), null, { timeout: 15000 });
  await p.page.waitForTimeout(500);
  check('started: two things to pass on, and the first bottle counted', (await p.text('madeTitle')) === 'The beach is started' && await p.shown('inviteCopy') && await p.shown('beachCopy') && (await p.text('gatherCount')) === '1 bottle so far, from Mike.', await p.text('gatherCount'));
  check('the links speak of the person', (await p.text('beachLabel')) === '2. When it is time, send Ana the beach' && (await p.text('beachCopy')) === 'Copy the link to Ana\u2019s beach');
  await p.shot('11-started');
  const g = await p.page.evaluate(() => JSON.parse(localStorage.getItem('bottle-gathers'))[0]);
  check('this phone remembers the beach it started', g.to === 'Ana' && g.o === 'Happy 40th' && /^[A-Za-z0-9_-]{22}$/.test(g.k));
  await p.page.click('#again'); await p.page.waitForTimeout(500);
  check('and finds it again on its shore', await p.shown('home') && (await p.text('gathers')).startsWith('A beach for Ana'), await p.text('gathers'));
  await p.page.click('#gathers .row'); await p.page.waitForTimeout(400);
  check('a tap brings its links back', (await p.text('madeTitle')) === 'The beach for Ana' && await p.shown('beachCopy'));
  await p.ctx.close();
  const invite = linkFor('http://localhost:8899/', { message: 'Happy 40th', name: 'Mike', to: 'Ana', key: g.k, g: 'i' });
  const beachLink = linkFor('http://localhost:8899/', { message: 'Happy 40th', name: 'Mike', to: 'Ana', key: g.k, g: 'o' });
  // two people with the invitation
  for (const [who, words, sky] of [['Dad', 'Proud of you, kiddo.', 'night'], ['Jorge', 'Drinks are on you.', 'dawn']]) {
    const c = await phone({ at: rel(invite) });
    await c.page.waitForTimeout(600);
    check(who + ': the invitation says whose beach and what for', (await c.text('deskTitle')) === 'A bottle for Ana' && (await c.text('deskLede')).startsWith('Mike is filling a beach with bottles for Ana: Happy 40th.') && (await c.text('make')) === 'Add my bottle', await c.text('deskLede'));
    check(who + ': and how many are in so far', /^\d bottles? so far, from Mike/.test(await c.text('gatherSay')), await c.text('gatherSay'));
    check(who + ': nothing but a name and a note is asked for', !(await c.shown('forRow')) && !(await c.shown('mobileRow')) && !(await c.shown('mobileAsk')) && !(await c.shown('occasion')));
    await c.page.fill('#who', who); await c.page.fill('#msg', words);
    await c.page.click(`#moods [data-mood=${sky}]`);
    if (who === 'Dad') await c.shot('11-invited');
    await c.page.click('#make');
    await c.page.waitForFunction(() => document.getElementById('made').classList.contains('joined'), null, { timeout: 15000 });
    await c.page.waitForTimeout(400);
    check(who + ': the bottle is in, and only the invitation is offered on', (await c.text('madeTitle')) === 'Your bottle is in the water' && await c.shown('inviteCopy') && !(await c.shown('beachCopy')), await c.text('gatherCount'));
    await c.ctx.close();
  }
  check('three bottles are with the server, scrambled', (open.get(await threadId(g.k)) || []).length === 3 && !JSON.stringify(open.get(await threadId(g.k))).includes('Proud'));
  // a server that will not take a bottle
  const d = await phone({ at: rel(invite), addOk: false });
  await d.page.fill('#msg', 'This one will not go.'); await d.page.click('#make');
  await d.page.waitForFunction(() => /could not be added/.test(document.getElementById('gatherSay').textContent), null, { timeout: 30000 });
  check('a bottle the server will not take is said so, and the words are kept', await d.shown('desk') && (await d.page.evaluate(() => document.getElementById('msg').value)) === 'This one will not go.');
  await d.ctx.close();
  // the person it is for
  const a = await phone({ at: rel(beachLink) });
  await a.page.waitForTimeout(500);
  await a.page.evaluate(() => { window.dev.hold = false; window.dev.run(0.3); window.dev.hold = true; });
  check('the beach says how many washed up', (await a.text('hint')) === '3 bottles washed up for you. Touch the water', await a.text('hint'));
  const bring = async () => { await a.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; }); await a.page.touchscreen.tap(20, 20); await a.page.waitForTimeout(900); return [await a.text('dear'), await a.text('words'), await a.text('sign'), await a.text('reply'), await a.text('keepNote')]; };
  let got = await bring();
  check('the first bottle is the one who started it', got[0] === 'For Ana' && got[1] === 'Forty looks good on you.' && got[2] === '~ Mike' && got[3] === 'Bring in the next bottle (2 left)' && got[4].startsWith('1 of 3 opened.'), got.join(' | '));
  await a.page.click('#reply'); await a.page.waitForTimeout(300);
  check('the next one rides in: the note is put away and the story starts again', (await a.page.evaluate(() => !document.getElementById('letter').classList.contains('show') && ['adrift', 'arrive'].includes(window.dev.story.state))));
  check('and it comes under its own sky', (await a.page.evaluate(() => document.documentElement.dataset.mood)) === 'night');
  got = await bring();
  check('the second bottle', got[1] === 'Proud of you, kiddo.' && got[2] === '~ Dad' && got[3] === 'Bring in the last bottle' && got[4].startsWith('2 of 3 opened.'), got.join(' | '));
  await a.page.click('#reply'); await a.page.waitForTimeout(300);
  got = await bring();
  check('the last bottle, and what comes after', got[1] === 'Drinks are on you.' && got[3] === 'Write a bottle of your own' && (await a.text('sealNote')) === 'That was the last one. 3 bottles, from 3 people.', got.join(' | ') + ' | ' + await a.text('sealNote'));
  check('each one opened left a shell and lit a star', await a.page.evaluate(() => window.dev.scene.keeps.shells.length === 3 && window.dev.scene.keeps.stars.length === 3));
  check('the ones opened can be read again', (await a.page.evaluate(() => [...document.querySelectorAll('#shelf .chip')].map((c) => c.textContent).join(','))) === 'Jorge,Dad,Mike');
  check('no errors', !a.errs.length, a.errs.join(' ; '));
  await a.ctx.close();
  // a dozen in the water, for a look
  const KEY2 = 'gggggggggggggggggggggg', rows = [];
  for (let i = 0; i < 12; i++) rows.push({ id: i + 1, body: await seal(KEY2, { m: 'Bottle ' + (i + 1), n: 'Friend ' + (i + 1), mood: 'dusk', to: 'Ana', id: 'f' + i, t: now + i }), created_at: new Date(now + i * 1000).toISOString() });
  open.set(await threadId(KEY2), rows);
  for (const flat of ['', '&flat']) {
    const m = await phone({ at: rel(linkFor('http://localhost:8899/', { message: '', name: 'Mike', to: 'Ana', key: KEY2, g: 'o' }), '?dev' + flat) });
    await m.page.waitForTimeout(500);
    await m.page.evaluate(() => { window.dev.hold = false; window.dev.run(0.5); window.dev.hold = true; });
    check((flat ? 'flat' : '3D') + ': a dozen wait in the water', (await m.text('hint')) === '12 bottles washed up for you. Touch the water' && !m.errs.length, m.errs.join(' ; '));
    await m.shot('11-dozen' + (flat ? '-flat' : ''));
    await m.ctx.close();
  }
  // the server cannot be reached
  const x = await phone({ at: rel(beachLink), listOk: false });
  await x.page.waitForTimeout(400);
  await x.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await x.page.waitForTimeout(700);
  check('a beach that cannot be fetched says so and offers to try again', (await x.text('words')).startsWith('The bottles could not be brought in just now.') && (await x.text('reply')) === 'Try again');
  await x.ctx.close();
}
// 12. a lantern lit for someone: one tap, no words
{
  const lamps = JSON.parse(JSON.stringify(jorge));
  lamps['bottle-notes'][KEY].push({ message: '', name: 'Jorge', mood: 'night', to: 'Mike', id: 'l1', at: now - 1000, kind: 'l' });      // Jorge lit one, after the last note seen here
  const p = await phone({ seed: lamps, sent: 1 });
  await p.page.waitForTimeout(900);
  const rows = () => p.page.evaluate(() => [...document.querySelectorAll('#people .person')].map((r) => r.textContent));
  let r = await rows();
  check('a lantern lit for this phone is news on the shore', r[0].startsWith('Jorge') && r[0].includes('Lit a lantern for you') && r[0].includes('Light one back') && (await p.text('homeLede')) === 'Jorge lit a lantern for you.', r.join(' / '));
  check('and it glows on the sand', (await p.page.evaluate(() => window.dev.scene.lamp)) === 1);
  check('a lantern is not a bottle: it is not counted as one', r[1].includes('2 bottles'), r[1]);
  check('anyone who has joined can be lit a lantern', r[1].includes('Lantern'));
  await p.page.click('#people .person:nth-child(1) .peek.lamp'); await p.page.waitForTimeout(900);
  r = await rows();
  check('one tap lights one back, and says their phone was told', r[0].includes('Lantern lit. Jorge\u2019s phone has been told.') && r[0].includes('Lit'), r[0]);
  check('the sender is told it is a lantern, and nothing else', p.calls.includes('notify:bottle:l') && p.calls.includes('bottle_add'));
  const kept = await p.page.evaluate((k) => ({ notes: JSON.parse(localStorage.getItem('bottle-notes'))[k], th: JSON.parse(localStorage.getItem('bottle-threads')).find((t) => t.k === k) }), KEY);
  check('it is kept with the conversation as a lantern, and theirs is marked seen', kept.notes.filter((n) => n.kind === 'l').length === 2 && kept.notes.filter((n) => n.kind !== 'l').length === 2 && kept.th.s >= now - 1000);
  await p.page.click('#people .person:nth-child(1) .peek.lamp', { force: true }).catch(() => {});
  check('a second tap straight away sends nothing more', p.calls.filter((c) => c === 'notify:bottle:l').length === 1);
  await p.ctx.close();
  const q = await phone({ seed: lamps, sent: 0 });
  await q.page.waitForTimeout(900);
  await q.page.click('#people .person:nth-child(2) .peek.lamp'); await q.page.waitForTimeout(900);
  check('with their notifications off, it waits on their shore and says so', (await q.page.evaluate(() => document.querySelector('#people .person:nth-child(2)').textContent)).includes('Lantern lit. Dad will see it on opening Bottle.'));
  await q.ctx.close();
  const x = await phone({ seed: lamps, addOk: false });
  await x.page.waitForTimeout(900);
  await x.page.click('#people .person:nth-child(2) .peek.lamp'); await x.page.waitForTimeout(900);
  check('a lantern the server will not take is said so', (await x.page.evaluate(() => document.querySelector('#people .person:nth-child(2)').textContent)).includes('It could not be lit just now.'));
  await x.ctx.close();
  // someone who has never joined cannot be lit one
  const alone = { 'bottle-name': 'Mike', 'bottle-threads': [{ k: KEY, w: 'Ana', s: 0, t: now }], 'bottle-mine': ['m1'], 'bottle-notes': { [KEY]: [{ message: 'Hello?', name: 'Mike', mood: 'dusk', to: 'Ana', id: 'm1', at: now }] } };
  const a = await phone({ seed: alone });
  await a.page.waitForTimeout(900);
  check('someone who has not opened a bottle yet is not offered a lantern', !(await a.page.evaluate(() => !!document.querySelector('#people .peek.lamp'))));
  await a.ctx.close();
}
// 13. written in the sand: traced with a finger, seen once at the other end, and taken by a wave
{
  const { decode } = await import('../js/code.js');
  shelf.clear();
  const p = await phone({ seed: jorge, sent: 1 });
  await p.page.waitForTimeout(700);
  await writeTo(p); await p.page.waitForTimeout(300);
  check('the desk offers the sand', await p.shown('sandAdd') && (await p.text('sandAdd')) === 'Write in the sand');
  await p.page.click('#sandAdd'); await p.page.waitForTimeout(300);
  check('the wet sand opens to write on', await p.page.evaluate(() => document.getElementById('sand').className === 'show pad') && await p.shown('sandDone') && (await p.text('sandSay')).startsWith('Write or draw with a finger.'));
  const stroke = async (pts) => { await p.page.mouse.move(pts[0][0], pts[0][1]); await p.page.mouse.down(); for (const [x, y] of pts.slice(1)) await p.page.mouse.move(x, y, { steps: 4 }); await p.page.mouse.up(); };
  await stroke([[80, 300], [80, 420], [80, 360], [150, 360], [150, 300], [150, 420]]);       // H
  await stroke([[210, 300], [210, 420]]);                                                     // I
  await stroke([[210, 270], [211, 270]]);
  await p.shot('13-pad');
  await p.page.click('#sandDone'); await p.page.waitForTimeout(300);
  check('what was written is shown small on the desk, in place of the words', await p.page.evaluate(() => document.getElementById('desk').classList.contains('sand')) && await p.shown('sandThumb') && !(await p.shown('msg')) && !(await p.shown('picAdd')));
  await p.page.click('#make');
  await p.page.waitForFunction(() => document.getElementById('compose').classList.contains('done'), null, { timeout: 20000 });
  await p.page.waitForTimeout(1200);
  const link = await p.page.evaluate(() => document.getElementById('link').value), b = decode(link.slice(link.indexOf('#')));
  check('it is sent as something written in the sand, not as a bottle', b && b.g === 's' && /^[A-Za-z0-9_-]{22}$/.test(b.pic) && b.message === '' && (await p.text('madeTitle')) === 'Sent to Jorge', (await p.text('madeTitle')) + ' | ' + (await p.text('madeLede')));
  check('what left the phone is scrambled and small', shelf.size === 1 && [...shelf.values()][0].length < 2000, String([...shelf.values()][0].length));
  check('the sender is told it is sand, so the other phone can say so', p.calls.includes('notify:bottle:s'));
  const mine = await p.page.evaluate((k) => JSON.parse(localStorage.getItem('bottle-notes'))[k].slice(-1)[0], KEY);
  check('this phone keeps it as sand', mine.kind === 's' && mine.pic === b.pic);
  await p.page.click('#again'); await p.page.waitForTimeout(500);
  check('sand is not counted as a bottle', (await p.text('people')).includes('2 bottles'), await p.text('people'));
  await p.ctx.close();
  const rel = (q) => link.replace('http://localhost:8899/', '').replace('#', q + '#');
  // the other phone, at the real pace, for a look
  const v = await phone({ at: rel('?dev') });
  await v.page.evaluate(() => { window.dev.hold = false; });
  check('the beach waits, and says who wrote', (await v.page.evaluate(() => document.getElementById('sand').className)) === 'show view wait' && (await v.text('sandSay')) === 'Mike wrote in the sand for you. Touch the sand');
  await v.page.click('#sand'); await v.page.waitForTimeout(2600);
  await v.shot('13-written');
  await v.page.waitForTimeout(2500);
  await v.shot('13-wave');
  await v.page.waitForFunction(() => document.getElementById('sand').classList.contains('card'), null, { timeout: 30000 });
  check('then the tide takes it', (await v.text('sandTitle')) === 'The tide took it' && (await v.text('sandBack')) === 'Write back to Mike in the sand' && (await v.text('sandLede')).startsWith('Mike wrote that in the sand for you.'));
  check('this phone remembers that it is gone', (await v.page.evaluate(() => JSON.parse(localStorage.getItem('bottle-washed')))).includes(b.pic));
  await v.shot('13-gone');
  await v.page.goto('http://localhost:8899/' + rel('?dev&quick')); await v.page.waitForTimeout(1500);
  await v.page.waitForFunction(() => window.__bottleReady && document.getElementById('sand').classList.contains('card'), null, { timeout: 20000 });
  check('opened again, it says the tide has been', (await v.text('sandTitle')) === 'The tide already took this one');
  await v.page.click('#sandBack'); await v.page.waitForTimeout(400);
  check('writing back opens the sand, addressed to them', (await v.page.evaluate(() => document.getElementById('sand').className)) === 'show pad' && (await v.text('deskTitle')) === 'Write back to Mike');
  check('no errors', !v.errs.length, v.errs.join(' ; '));
  await v.ctx.close();
  // the writer looking at their own does not use it up
  const w = await phone({ at: rel('?dev&quick&see') });
  await w.page.evaluate(() => { window.dev.hold = false; });
  await w.page.click('#sand');
  await w.page.waitForFunction(() => document.getElementById('sand').classList.contains('card'), null, { timeout: 20000 });
  check('the writer looking at their own does not use it up', !(await w.page.evaluate(() => localStorage.getItem('bottle-washed'))));
  await w.ctx.close();
  // nothing written
  const e = await phone({ seed: jorge });
  await e.page.waitForTimeout(600);
  await writeTo(e); await e.page.waitForTimeout(300);
  await e.page.click('#sandAdd'); await e.page.waitForTimeout(200);
  await e.page.click('#sandDone'); await e.page.waitForTimeout(200);
  check('nothing written leaves the desk as it was', !(await e.page.evaluate(() => document.getElementById('desk').classList.contains('sand'))) && await e.shown('msg'));
  await e.ctx.close();
  // it cannot be fetched
  shelf.clear();
  const x = await phone({ at: rel('?dev&quick') });
  await x.page.evaluate(() => { window.dev.hold = false; });
  await x.page.click('#sand');
  await x.page.waitForFunction(() => document.getElementById('sand').classList.contains('card'), null, { timeout: 40000 });
  check('what cannot be fetched says so, and is not marked as gone', (await x.text('sandTitle')) === 'It could not be brought in' && (await x.text('sandBack')) === 'Try again' && !(await x.page.evaluate(() => localStorage.getItem('bottle-washed'))));
  await x.ctx.close();
}
// 14. writing back: the page says how an answer gets there, and nobody is left holding a bare link
{
  const { linkFor } = await import('../js/code.js');
  const rel = (b, q = '?dev') => linkFor('http://localhost:8899/', b).replace('http://localhost:8899/', '').replace('#', q + '#');
  const fromMike = { message: 'Dinner on Friday?', name: 'Mike', mood: 'dusk', to: 'Ana', key: 'hhhhhhhhhhhhhhhhhhhhhh', claim: 'cccccccccccccccc' };
  const toNote = async (p) => { await p.page.touchscreen.tap(20, 20); await p.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; }); await p.page.waitForTimeout(1500); };
  // someone new
  const d = await phone({});
  check('someone new is shown the three steps: write, text it, they write back', await d.shown('steps') && (await d.text('steps')).replace(/\s+/g, ' ').trim() === '1Write a note 2Text it in one tap 3They write back', (await d.text('steps')).replace(/\s+/g, ' '));
  await d.page.click('#howDesk'); await d.page.waitForTimeout(200);
  check('"How it works" opens six plain lines', await d.shown('howcard') && (await d.page.evaluate(() => document.querySelectorAll('#howcard li').length)) === 6 && (await d.text('howcard')).includes('Nothing to copy or paste.'));
  await d.shot('14-how');
  await d.page.click('#howClose'); await d.page.waitForTimeout(200);
  check('and is put away with one tap', !(await d.shown('howcard')));
  check('a picture and the sand sit side by side', await d.page.evaluate(() => Math.abs(document.getElementById('picAdd').getBoundingClientRect().top - document.getElementById('sandAdd').getBoundingClientRect().top) < 2));
  await d.shot('14-desk-new');
  await d.ctx.close();
  // Ana's phone, which has never used it: she reads Mike's bottle
  const a = await phone({ at: rel(fromMike), share: 'ok' });
  await toNote(a);
  check('under a note the button says "Write back", by name', (await a.text('reply')) === 'Write back to Mike' && await a.page.evaluate(() => document.getElementById('reply').classList.contains('call')));
  check('and one line says how: one tap, nothing to copy', (await a.text('replyHow')) === 'Write your note, then one tap sends it back. Nothing to copy or paste.' && await a.shown('replyHow'), await a.text('replyHow'));
  await a.page.waitForTimeout(1800); await a.shot('14-letter');
  await a.page.click('#reply'); await a.page.waitForTimeout(500);
  check('the desk says it is an answer, and how it will go', (await a.text('deskTitle')) === 'Write back to Mike' && (await a.text('deskLede')) === 'Write your note. Then one tap sends it to Mike, already written out. Nothing to copy or paste.' && !(await a.shown('steps')), await a.text('deskLede'));
  check('it is signed with the name the note was addressed to', (await a.page.evaluate(() => document.getElementById('who').value)) === 'Ana');
  await a.page.fill('#msg', 'Friday works. Seven?');
  await a.shot('14-desk-back');
  await a.page.click('#make'); await a.page.waitForTimeout(1200);
  const shared = await a.page.evaluate(() => window.__shared);
  check('one tap opens the share sheet with the words and the link', shared.length === 1 && shared[0].text === 'Mike, a bottle washed up for you. Open it, then write back:' && /#1\./.test(shared[0].url), JSON.stringify(shared).slice(0, 120));
  check('once it is handed over the screen turns to what happens next', (await a.text('madeTitle')) === 'Off it goes' && (await a.text('madeLede')).match(/^When Mike taps it, your bottle washes up on [A-Z][a-z]+ [A-Z][a-z]+, the beach you share\./) && (await a.text('madeNext')) === 'When Mike writes back, it shows up here.', (await a.text('madeTitle')) + ' | ' + (await a.text('madeLede')));
  check('no bare link is shown, and it can be sent again', !(await a.shown('link')) && (await a.text('share')) === 'Send it again' && (await a.text('copy')) === 'Copy the link');
  await a.shot('14-made-passed');
  check('no errors', !a.errs.length, a.errs.join(' ; '));
  await a.ctx.close();
  // she closes the share sheet without sending
  const c = await phone({ at: rel(fromMike), share: 'abort' });
  await toNote(c);
  await c.page.click('#reply'); await c.page.waitForTimeout(400);
  await c.page.fill('#msg', 'Friday works.'); await c.page.click('#make'); await c.page.waitForTimeout(1200);
  check('a share sheet closed without sending leaves one clear thing to do', (await c.text('madeTitle')) === 'Last step: send it to Mike' && (await c.text('share')) === 'Send it to Mike' && await c.shown('share') && !(await c.shown('link')), (await c.text('madeTitle')) + ' | ' + (await c.text('share')));
  await c.shot('14-made-last-step');
  await c.page.click('#share'); await c.page.waitForTimeout(300);
  check('and the button opens the sheet again', (await c.page.evaluate(() => window.__shared.length)) === 2 && (await c.text('madeTitle')) === 'Last step: send it to Mike');
  await c.ctx.close();
  // Mike has notifications on: the line under the button says it goes straight there
  const l = await phone({ at: rel(fromMike), reach: { others: 1, lit: 1 }, sent: 1 });
  await toNote(l);
  check('when their notifications are on, it says the answer goes straight to their phone', (await l.text('replyHow')) === 'It goes straight to Mike\u2019s phone. Nothing to copy, nothing to text.', await l.text('replyHow'));
  await l.page.click('#reply'); await l.page.waitForTimeout(400);
  check('and the desk sends, it does not make a link', (await l.text('make')) === 'Send to Mike' && (await l.text('deskLede')).includes('goes straight to Mike\u2019s phone. Nothing to copy or text.'), await l.text('deskLede'));
  await l.page.fill('#msg', 'Seven it is.'); await l.page.click('#make'); await l.page.waitForTimeout(1200);
  check('and it is sent', (await l.text('madeTitle')) === 'Sent to Mike' && !(await l.shown('share')) && !(await l.shown('link')));
  await l.ctx.close();
  // a phone that knows the conversation: its own last note, and the row of earlier ones
  const m = await phone({ seed: jorge, at: rel({ message: 'Game on Sunday?', name: 'Mike', mood: 'dusk', to: 'Jorge', key: KEY }) });
  await toNote(m);
  check('under this phone\u2019s own note: where the answer will show up', (await m.text('reply')) === 'Send another to Jorge' && (await m.text('replyHow')) === 'When Jorge writes back, it shows up here.' && !(await m.page.evaluate(() => document.getElementById('reply').classList.contains('call'))), await m.text('replyHow'));
  await m.page.click('#newest'); await m.page.waitForTimeout(1500);
  check('the newer note is one tap away, and its button says "Write back"', (await m.text('words')) === 'I am in.' && (await m.text('reply')) === 'Write back to Jorge');
  check('the earlier notes are called what they are: a conversation', (await m.page.evaluate(() => (document.querySelector('.shelfHead') || {}).textContent)) === 'You and Jorge: 2 bottles so far', await m.page.evaluate(() => (document.querySelector('.shelfHead') || {}).textContent));
  // the browser offers to put the page on the home screen: the offer is under the note, not only on the shore
  check('nothing is offered until the browser offers it', !(await m.shown('keepA')));
  await m.page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await m.page.waitForTimeout(200);
  check('after a note, the phone is offered to keep Bottle on its home screen', await m.shown('keepA') && (await m.text('keepA')) === 'Keep Bottle on your home screen');
  await m.page.waitForTimeout(1200); await m.shot('14-letter-keep');
  await m.page.click('#keepA'); await m.page.waitForTimeout(300);
  check('one tap takes the offer, and it is not made twice', (await m.page.evaluate(() => window.__prompted)) === 1 && !(await m.shown('keepA')));
  check('no errors', !m.errs.length, m.errs.join(' ; '));
  await m.ctx.close();
}
// 15. the beach two people share: its name, whose it is, a shell to tap for every bottle, and something small tucked in
{
  const { decode } = await import('../js/code.js');
  const { placeName } = await import('../js/keeps.js');
  const PLACE = placeName(KEY);
  const run = (p, secs) => p.page.evaluate((n) => { window.dev.hold = false; window.dev.run(n); window.dev.hold = true; }, secs);
  const p = await phone({ seed: jorge, sent: 1, reach: { others: 1, lit: 1 } });
  await p.page.waitForTimeout(800);
  check('the list is "Your beaches", and each row names the beach', (await p.page.evaluate(() => document.querySelector('#home h1').textContent)) === 'Your beaches' && (await p.page.evaluate(() => document.querySelector('#people .row').textContent)).includes(PLACE + ' \u00b7 2 bottles'), await p.page.evaluate(() => document.querySelector('#people .row').textContent));
  check('the word "shore" is gone from the list', !(await p.text('home')).toLowerCase().includes('shore'));
  check('"Read last" is gone from the list: bottles are read again on the beach', !(await p.page.evaluate(() => [...document.querySelectorAll('#people .peek')].some((b) => b.textContent === 'Read last'))));
  await p.page.click('#people .row');
  await run(p, 5); await p.page.waitForTimeout(400);
  check('a beach has a name of its own, and says whose it is and what it keeps', (await p.text('visitName')) === PLACE && (await p.text('visitWho')) === 'The beach you share with Jorge' && (await p.text('visitSay')) === '2 bottles between you so far. Each one left a shell and lit a star. Tap a shell to read it again.', (await p.text('visitName')) + ' | ' + (await p.text('visitSay')));
  const marks = await p.page.evaluate(() => [...document.querySelectorAll('.mark')].map((m) => { const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, seen: m.style.opacity, label: m.getAttribute('aria-label') }; }));
  check('every bottle is a shell with a ring to tap, on the sand, above the buttons', marks.length === 2 && marks.every((m) => m.seen === '1' && m.x > 20 && m.x < 370 && m.y > 844 * 0.55 && m.y < 844 * 0.84) && marks[0].label.startsWith('Bottle 1, from you') && marks[1].label.startsWith('Bottle 2, from Jorge'), JSON.stringify(marks));
  check('with its shells and its stars, seen from a step further back', await p.page.evaluate(() => { const s = window.dev.scene; return s.keeps.shells.length === 2 && s.keeps.stars.length === 2 && s.keeps.shells.every((x) => x.a === 1) && s.cam.fov > 1.3; }));
  await p.shot('15-beach');
  await p.page.click('#visitLamp'); await p.page.waitForTimeout(900);
  check('a lantern can be lit from the beach', (await p.text('visitSay')) === 'Lantern lit. Jorge\u2019s phone has been told.' && p.calls.includes('notify:bottle:l') && (await p.text('visitLamp')) === 'Lantern lit', await p.text('visitSay'));
  await p.page.click('.mark:nth-child(2)');
  await p.page.waitForFunction(() => window.dev && window.__bottleReady && /[?&]re\b/.test(location.search), null, { timeout: 30000 });
  await p.page.evaluate(() => { window.dev.hold = true; }); await p.page.waitForTimeout(1500);
  check('a tap on a shell picks that bottle up again, straight to its note', (await p.text('words')) === 'I am in.' && (await p.page.evaluate(() => window.dev.story.state === 'reading' && document.getElementById('letter').classList.contains('show'))));
  check('and the way back names the beach', (await p.text('fresh')) === 'Back to ' + PLACE, await p.text('fresh'));
  await p.page.touchscreen.tap(20, 20); await p.page.waitForTimeout(1200);
  check('the line under the note says which beach it is on, and whose', (await p.text('keepNote')).startsWith(PLACE + ', the beach you share with Jorge: 2 shells'), await p.text('keepNote'));
  await p.page.waitForFunction(() => getComputedStyle(document.getElementById('after')).opacity === '1', null, { timeout: 30000 });
  await p.page.click('#fresh');
  await p.page.waitForFunction(() => window.dev && window.__bottleReady && document.getElementById('visit').classList.contains('show') && !location.hash, null, { timeout: 30000 });
  await p.page.evaluate(() => { window.dev.hold = true; }); await p.page.waitForTimeout(300);
  check('the way back leads to the same beach', (await p.text('visitName')) === PLACE && !(await p.page.evaluate(() => /[?&]re\b/.test(location.search))) && !(await p.shown('home')));
  await p.page.click('#visitBack'); await p.page.waitForTimeout(300);
  check('and from the beach, back to the list', await p.shown('home') && !(await p.shown('visit')) && (await p.page.evaluate(() => window.dev.scene.keeps === null)));
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
  // something tucked in
  const t = await phone({});
  check('the desk offers to tuck something in', await t.shown('tuckAdd') && (await t.text('tuckAdd')) === 'Tuck something in' && !(await t.shown('tuckPick')));
  await t.page.click('#tuckAdd'); await t.page.waitForTimeout(150);
  check('six small things to choose from', (await t.page.evaluate(() => document.querySelectorAll('#tuckPick button svg').length)) === 6 && await t.shown('tuckPick'));
  await t.page.click('#tuckPick [data-tuck=f]'); await t.page.waitForTimeout(150);
  check('the one chosen is shown, and what becomes of it is said', (await t.text('tuckSay')) === 'A pressed flower is tucked in. It stays on the beach you share.' && await t.shown('tuckIcon') && !(await t.shown('tuckPick')) && !(await t.shown('tuckAdd')));
  await t.page.click('#tuckDrop'); await t.page.waitForTimeout(100);
  check('it can be taken out again', await t.shown('tuckAdd') && !(await t.shown('tuckIcon')));
  await t.page.click('#tuckAdd'); await t.page.click('#tuckPick [data-tuck=f]');
  await t.page.fill('#forWho', 'Ana'); await t.page.fill('#who', 'Mike'); await t.page.fill('#msg', 'Found this on the walk home.');
  await t.shot('15-desk-tuck');
  await t.page.click('#make'); await t.page.waitForTimeout(900);
  const link = await t.page.evaluate(() => document.getElementById('link').value), b = decode(link.slice(link.indexOf('#')));
  check('the link carries what was tucked in', b && b.tuck === 'f' && b.message === 'Found this on the walk home.');
  check('and the phone keeps it with the note', (await t.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('bottle-notes')))[0][0].tuck)) === 'f');
  await t.page.click('#again'); await t.page.waitForTimeout(400);
  await t.page.click('#people .row'); await run(t, 4); await t.page.waitForTimeout(300);
  check('on the beach, what was tucked in stands by its shell', (await t.page.evaluate(() => document.querySelectorAll('.mark svg').length)) === 1 && (await t.page.evaluate(() => document.querySelector('.mark').getAttribute('aria-label'))).includes('with a pressed flower'), await t.page.evaluate(() => document.querySelector('.mark').getAttribute('aria-label')));
  check('a beach with one bottle says so', (await t.text('visitSay')).startsWith('1 bottle between you so far.') && (await t.text('visitWho')) === 'The beach you share with Ana');
  await t.ctx.close();
  // the other phone
  const o = await phone({ at: link.replace('http://localhost:8899/', '').replace('#', '?dev#') });
  await o.page.touchscreen.tap(20, 20);
  await o.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await o.page.waitForFunction(() => getComputedStyle(document.getElementById('after')).opacity === '1', null, { timeout: 30000 });
  await o.page.waitForTimeout(600);
  check('at the other end it lies on the paper, and the page says who tucked it in', await o.shown('tuckArt') && (await o.page.evaluate(() => !!document.querySelector('#tuckArt svg'))) && (await o.text('tuckNote')) === 'Mike tucked in a pressed flower.', await o.text('tuckNote'));
  const place = placeName(b.key);
  check('a first bottle says which beach it washed up on, and whose', (await o.text('keepNote')) === `This is ${place}, the beach you share with Mike. Every bottle between you leaves a shell here and lights a star.`, await o.text('keepNote'));
  check('and offers a walk on it', await o.shown('toBeach') && (await o.text('toBeach')) === 'Visit ' + place);
  await o.shot('15-letter-tuck');
  await o.page.click('#toBeach');
  await o.page.waitForFunction(() => window.dev && window.__bottleReady && document.getElementById('visit').classList.contains('show'), null, { timeout: 30000 });
  check('the walk leads to that beach', (await o.text('visitName')) === place && (await o.text('visitWho')) === 'The beach you share with Mike');
  check('no errors', !o.errs.length && !t.errs.length, [...o.errs, ...t.errs].join(' ; '));
  await o.ctx.close();
  // a bottle without one is as it always was
  const n = await phone({ seed: jorge, at: (await import('../js/code.js')).linkFor('http://localhost:8899/', { message: 'I am in.', name: 'Jorge', mood: 'night', to: 'Mike', key: KEY }).replace('http://localhost:8899/', '').replace('#', '?dev#') });
  await n.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await n.page.waitForTimeout(800);
  check('a bottle with nothing tucked in shows nothing extra', !(await n.shown('tuck')));
  await n.ctx.close();
}
// 16. a bottle sealed until a time: chosen on the desk, carried in the link, and shown out at sea until then
{
  const { decode, linkFor } = await import('../js/code.js');
  const rel = (l, q = '?dev') => l.replace('http://localhost:8899/', '').replace('#', q + '#');
  const run = (p, secs) => p.page.evaluate((n) => { window.dev.hold = false; window.dev.run(n); window.dev.hold = true; }, secs);
  const p = await phone({ share: 'ok' });
  check('the desk offers to seal it until later, beside tucking something in', await p.shown('whenAdd') && (await p.text('whenAdd')) === 'Seal it until later' && await p.page.evaluate(() => Math.abs(document.getElementById('tuckAdd').getBoundingClientRect().top - document.getElementById('whenAdd').getBoundingClientRect().top) < 2));
  await p.page.click('#whenAdd'); await p.page.waitForTimeout(150);
  const quick = await p.page.evaluate(() => [...document.querySelectorAll('#whenQuick button')].map((b) => b.textContent));
  check('a few quick times, or a day and time of their own', quick[0] === 'In an hour' && quick[quick.length - 1] === 'Tomorrow at 8 am' && await p.shown('whenAt') && !(await p.shown('whenAdd')), quick.join(', '));
  await p.page.evaluate(() => { const i = document.getElementById('whenAt'); i.value = '2020-01-01T08:00'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  check('a time already gone is refused', (await p.text('whenWarn')) === 'Choose a time that is still to come.' && await p.shown('whenAt'));
  await p.page.click('#whenQuick button:last-child'); await p.page.waitForTimeout(150);
  check('a quick time is taken, and the desk says what the other person will see', /^Sealed until .+\. Until then they see it out at sea\.$/.test(await p.text('whenSay')) && !(await p.shown('whenAt')), await p.text('whenSay'));
  await p.page.click('#whenDrop'); await p.page.waitForTimeout(100);
  check('and it can be unsealed again', await p.shown('whenAdd'));
  const T = Math.round((Date.now() + 3 * 86400000) / 60000) * 60000;
  await p.page.click('#whenAdd');
  await p.page.evaluate((t) => { const d = new Date(t), pad = (n) => String(n).padStart(2, '0'), i = document.getElementById('whenAt'); i.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); i.dispatchEvent(new Event('change', { bubbles: true })); }, T);
  await p.page.fill('#forWho', 'Ana'); await p.page.fill('#who', 'Mike'); await p.page.fill('#msg', 'Happy birthday. Not a minute early.');
  await p.shot('16-desk-sealed');
  await p.page.click('#make'); await p.page.waitForTimeout(1200);
  const link = await p.page.evaluate(() => document.getElementById('link').value), b = decode(link.slice(link.indexOf('#')));
  check('the link carries the time, to the minute', b && b.when === T && b.message === 'Happy birthday. Not a minute early.', b && String(b.when - T));
  check('the words that go with it say a bottle is on its way, not what it says', (await p.page.evaluate(() => window.__shared[0].text)) === 'Ana, a bottle is on its way to you. Tap to see when it washes up:');
  check('the screen says how long it stays sealed', (await p.text('madeLede')).includes(' It stays sealed until '), await p.text('madeLede'));
  check('and the phone keeps the time with the note', (await p.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('bottle-notes')))[0][0].when)) === T);
  const tryHref = await p.page.evaluate(() => document.getElementById('try').getAttribute('href'));
  // the writer looks at what they will see: the bottle at sea, and a way to open their own
  await p.page.goto(tryHref);
  await p.page.waitForFunction(() => window.dev && window.__bottleReady && document.getElementById('wait').classList.contains('show'), null, { timeout: 30000 });
  await p.page.evaluate(() => { window.dev.hold = true; });
  check('"See what they will see" shows it out at sea, and lets the writer open their own', (await p.text('waitWho')) === 'This is what Ana will see until then.' && await p.shown('waitOpen'), await p.text('waitWho'));
  await p.page.click('#waitOpen');
  await p.page.waitForFunction(() => window.dev && window.__bottleReady && /[?&]re\b/.test(location.search), null, { timeout: 30000 });
  await p.page.evaluate(() => { window.dev.hold = true; }); await p.page.waitForTimeout(1200);
  check('the writer can read their own sealed bottle', (await p.text('words')) === 'Happy birthday. Not a minute early.' && !(await p.shown('wait')));
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
  // the other phone, before the time
  const o = await phone({ at: rel(link) });
  await run(o, 2); await o.page.waitForTimeout(300);
  check('before its time the bottle is shown out at sea, and the note is not', await o.shown('wait') && !(await o.page.evaluate(() => document.getElementById('letter').classList.contains('show'))) && (await o.text('words')) === '' && (await o.text('waitTitle')) === 'Still at sea');
  check('it says who sealed it, when it washes up, and how long that is', (await o.text('waitWho')) === 'Mike sealed this bottle for you, Ana.' && (await o.text('waitWhen')).startsWith('It washes up ') && /^(3 days|2 days and 23 hours) to go$/.test(await o.text('waitLeft')) && !(await o.shown('waitOpen')), (await o.text('waitWhen')) + ' | ' + (await o.text('waitLeft')));
  await o.shot('16-at-sea');
  await o.page.touchscreen.tap(195, 500); await o.page.mouse.click(195, 520); await run(o, 1); await o.page.waitForTimeout(500);
  check('a touch does not start the story, and no way round is offered', (await o.page.evaluate(() => window.dev.story.state)) === 'arrive' && (await o.text('hint')) === '' && !(await o.page.evaluate(() => document.getElementById('skip').classList.contains('show'))));
  check('the touch takes the seat, so the beach is theirs and the list knows a bottle is coming', o.calls.includes('bottle_open') && (await o.page.evaluate(() => (JSON.parse(localStorage.getItem('bottle-threads') || '[]')[0] || {}).w)) === 'Mike');
  check('no errors', !o.errs.length, o.errs.join(' ; '));
  await o.ctx.close();
  // once its time has come it is a bottle like any other
  const late = await phone({ at: rel(linkFor('http://localhost:8899/', { message: 'Now you may.', name: 'Mike', mood: 'dusk', to: 'Ana', key: 'kkkkkkkkkkkkkkkkkkkkkk', when: Date.now() - 120000 })) });
  await run(late, 0.5);
  check('once its time has come, it opens like any other', !(await late.shown('wait')) && (await late.text('hint')) === 'Touch the water');
  await late.ctx.close();
  // on the list and on the beach: on its way, and then news
  const soon = Date.now() + 2 * 86400000;
  const held = JSON.parse(JSON.stringify(jorge));
  held['bottle-notes'][KEY].push({ message: 'Do not peek.', name: 'Jorge', mood: 'night', to: 'Mike', id: 'j2', at: now - 2000, when: soon });
  const h = await phone({ seed: held });
  await h.page.waitForTimeout(800);
  const row = await h.page.evaluate(() => { const r = document.querySelector('#people .row'); return [r.textContent, r.classList.contains('new')]; });
  check('on the list, a sealed bottle is on its way, not news', row[0].includes('A bottle is on its way. It washes up ') && !row[1] && (await h.text('homeLede')).startsWith('One beach for each person'), row[0]);
  await h.page.click('#people .row'); await run(h, 4); await h.page.waitForTimeout(300);
  check('the name leads to the beach, which says a bottle is coming', await h.shown('visit') && (await h.text('visitSay')).startsWith('A bottle from Jorge is on its way. It washes up '), await h.text('visitSay'));
  check('its shell says it is still at sea', (await h.page.evaluate(() => document.querySelector('.mark:nth-child(3)').getAttribute('aria-label'))).endsWith('Still at sea'));
  await h.page.click('.mark:nth-child(3)');
  await h.page.waitForFunction(() => window.dev && window.__bottleReady && document.getElementById('wait').classList.contains('show'), null, { timeout: 30000 });
  check('and picking it up early shows it out at sea, not its words', (await h.text('words')) === '' && (await h.text('waitWho')) === 'Jorge sealed this bottle for you, Mike.');
  await h.ctx.close();
  const come = JSON.parse(JSON.stringify(jorge));
  come['bottle-notes'][KEY].push({ message: 'Now.', name: 'Jorge', mood: 'night', to: 'Mike', id: 'j3', at: now - 9000000, when: now - 1000 });      // written long before the last one seen here, due a moment ago
  const d = await phone({ seed: come });
  await d.page.waitForTimeout(800);
  check('when its time comes it is news, however long ago it was written', (await d.page.evaluate(() => document.querySelector('#people .row').textContent)).includes('A new bottle washed up') && (await d.text('homeLede')) === 'A bottle is waiting for you.');
  await d.ctx.close();
}
// 17. cast out to sea, for no one: written, cast out, watched going, and gone
{
  const c = await phone({});
  check('someone with nobody to write to is offered the sea', await c.shown('castB') && (await c.text('castB')) === 'Or cast one out to sea, for no one');
  await c.page.click('#castB'); await c.page.waitForTimeout(250);
  check('the desk asks for the words and a sky, and nothing else', (await c.text('deskTitle')) === 'Cast it out to sea' && (await c.text('make')) === 'Cast it out' && await c.shown('msg') && await c.shown('moods') && !(await c.shown('forWho')) && !(await c.shown('who')) && !(await c.shown('picAdd')) && !(await c.shown('tuckAdd')) && !(await c.shown('whenAdd')) && !(await c.shown('mobileAsk')) && !(await c.shown('steps')), await c.text('deskLede'));
  await c.shot('17-desk-cast');
  await c.page.click('#make'); await c.page.waitForTimeout(200);
  check('nothing is cast without words', await c.shown('desk'));
  await c.page.fill('#msg', 'I should have called more often.');
  await c.page.click('#make'); await c.page.waitForTimeout(300);
  check('the desk steps aside so the bottle can be watched going', !(await c.shown('desk')) && (await c.text('hint')) === 'There it goes' && await c.page.evaluate(() => document.getElementById('hint').classList.contains('show')));
  await c.page.evaluate(() => { window.dev.hold = false; window.dev.run(4); window.dev.hold = true; });
  await c.shot('17-going');
  await c.page.evaluate(() => { window.dev.hold = false; window.dev.run(6); window.dev.hold = true; }); await c.page.waitForTimeout(300);
  check('then it is gone, and the page says so', await c.shown('made') && (await c.text('madeTitle')) === 'It is out to sea' && (await c.text('madeLede')).startsWith('Nobody will read it.') && !(await c.shown('link')) && !(await c.shown('share')) && !(await c.shown('copy')) && !(await c.shown('try')));
  check('nothing was sent', !c.calls.includes('bottle_add') && !c.calls.includes('add_bottle') && !c.calls.some((x) => x.startsWith('notify')) && !c.calls.includes('picture:add'), c.calls.join(','));
  check('and nothing was kept on the phone', await c.page.evaluate(() => !localStorage.getItem('bottle-notes') && !localStorage.getItem('bottle-threads') && document.getElementById('msg').value === '' && !JSON.stringify(Object.entries(localStorage)).includes('called more often')));
  await c.shot('17-gone');
  await c.page.click('#again'); await c.page.waitForTimeout(300);
  check('afterwards the desk is the plain one again', await c.shown('desk') && (await c.text('deskTitle')) === 'Cast your bottle' && await c.shown('forWho'));
  check('no errors', !c.errs.length, c.errs.join(' ; '));
  await c.ctx.close();
  // a phone with beaches is offered it on the list; a page showing a bottle is not
  const m = await phone({ seed: jorge });
  await m.page.waitForTimeout(600);
  check('a phone with beaches is offered the sea on its list', await m.shown('castA'));
  await m.page.click('#castA'); await m.page.waitForTimeout(250);
  check('and gets the same desk, with the way back', (await m.text('deskTitle')) === 'Cast it out to sea' && await m.shown('toHome'));
  await m.ctx.close();
}
// 18. the desk as people see it: names, the words and the send button, with the rest behind "Add something"
{
  const p = await phone({ at: '?dev&fold', share: 'ok' });
  check('the desk is called by the one name', (await p.text('deskTitle')) === 'Cast your bottle' && (await p.page.title()).startsWith('Cast Your Bottle'));
  check('a new person sees names, the words and the send button, and little else', await p.shown('forWho') && await p.shown('who') && await p.shown('msg') && await p.shown('make') && !(await p.shown('picAdd')) && !(await p.shown('sandAdd')) && !(await p.shown('tuckAdd')) && !(await p.shown('whenAdd')) && !(await p.shown('moods')) && !(await p.shown('mobileAsk')));
  check('the whole desk fits on the screen', (await p.page.evaluate(() => document.getElementById('compose').scrollHeight <= innerHeight)), String(await p.page.evaluate(() => document.getElementById('desk').offsetHeight)));
  check('a blank page offers a few ways to begin', await p.shown('starts') && (await p.page.evaluate(() => document.querySelectorAll('#starts button').length)) === 6);
  await p.shot('18-desk-simple');
  await p.page.click('#starts button:first-child'); await p.page.waitForTimeout(150);
  check('a tap puts the first words down and steps aside', (await p.page.evaluate(() => document.getElementById('msg').value)) === 'Happy birthday! ' && !(await p.shown('starts')) && (await p.text('left')) === '584');
  check('"Add something" says what is behind it', await p.shown('moreAdd') && (await p.text('moreAdd')).startsWith('Add something'));
  await p.page.click('#moreAdd'); await p.page.waitForTimeout(150);
  check('one tap brings out the picture, the sand, the keepsake, the seal, the sky and their number', await p.shown('picAdd') && await p.shown('sandAdd') && await p.shown('tuckAdd') && await p.shown('whenAdd') && await p.shown('moods') && await p.shown('mobileAsk') && !(await p.shown('moreAdd')));
  await p.shot('18-desk-open');
  await p.page.fill('#forWho', 'Ana'); await p.page.fill('#who', 'Mike');
  await p.page.click('#make'); await p.page.waitForTimeout(1200);
  check('after sending, the page asks who else deserves one', await p.shown('another') && (await p.text('another')) === 'Who else deserves a bottle?' && (await p.text('madeTitle')) === 'Off it goes');
  await p.shot('18-who-else');
  await p.page.click('#another'); await p.page.waitForTimeout(300);
  check('and that leads to a fresh, simple desk', await p.shown('desk') && (await p.text('deskTitle')) === 'Cast your bottle' && (await p.page.evaluate(() => document.getElementById('msg').value)) === '' && !(await p.shown('picAdd')) && await p.shown('toHome'));
  check('no errors', !p.errs.length, p.errs.join(' ; '));
  await p.ctx.close();
  // an answer is simple too, and has no starters; casting out shows its sky without a fold
  const { linkFor } = await import('../js/code.js');
  const r = await phone({ at: linkFor('http://localhost:8899/', { message: 'Dinner?', name: 'Mike', mood: 'dusk', to: 'Ana', key: 'rrrrrrrrrrrrrrrrrrrrrr', claim: 'cccccccccccccccc' }).replace('http://localhost:8899/', '').replace('#', '?dev&fold#') });
  await r.page.touchscreen.tap(20, 20);
  await r.page.evaluate(() => { window.dev.hold = false; document.getElementById('skip').click(); window.dev.run(1); window.dev.hold = true; });
  await r.page.waitForFunction(() => getComputedStyle(document.getElementById('after')).opacity === '1', null, { timeout: 30000 });
  await r.page.click('#reply'); await r.page.waitForTimeout(400);
  check('writing back is simple too, with no starters', await r.shown('msg') && await r.shown('moreAdd') && !(await r.shown('picAdd')) && !(await r.shown('starts')));
  await r.shot('18-desk-back');
  await r.ctx.close();
  const c = await phone({ at: '?dev&fold' });
  await c.page.click('#castB'); await c.page.waitForTimeout(250);
  check('casting one out shows its sky, with nothing folded away', await c.shown('moods') && !(await c.shown('moreAdd')) && !(await c.shown('starts')));
  await c.ctx.close();
}
await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(bad.length ? `\n${bad.length} WRONG` : `\nall ${results.length} ok`);
process.exit(bad.length ? 1 : 0);
