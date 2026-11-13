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
async function phone({ reach, sent = 0, addOk = true, seed, ios = false, picOk = true, at = '?dev' }) {
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
    calls.push(fn === 'notify' ? 'notify:' + body.do : fn);
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(v) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (fn === 'bottle_reach') return reach === undefined ? json({ message: 'no such function' }, 404) : json(reach);
    if (fn === 'bottle_add') return addOk ? json('ok') : json({ message: 'down' }, 500);
    if (fn === 'bottle_list') return json([]);
    if (fn === 'bottle_open') return json('member');
    if (fn === 'notify') return json({ sent: typeof sent === 'function' ? sent(calls.filter((c) => c === 'notify:bottle').length) : sent, failed: 0 });
    if (fn === 'shore_get') return json(null);
    return json('ok');
  });
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
  check('everyone is listed, newest first, and a lit lantern is shown', rows.length === 2 && rows[0].startsWith('Jorge') && rows[0].includes('2 bottles') && rows[0].includes('notifications on'), rows.join(' / '));
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
  check('lantern silent: the page says so and offers the link', (await p.text('madeTitle')) === 'Your bottle is ready' && (await p.text('madeLede')).includes('phone could not be told this time') && await p.shown('link'), await p.text('madeLede'));
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
  check('untaught server: the shore still lists everyone', rows.length === 2 && !rows[0].includes('notifications on'), rows.join(' / '));
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
  check('the one with a number gets a text already addressed, with her own link', rows[2].text.startsWith('Ana') && rows[2].href.startsWith('sms:+13055550199?body=') && decodeURIComponent(rows[2].href).includes('Ana, a bottle washed up for you. http://localhost:8899/#1.'), rows[2].href.slice(0, 50));
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
  check('the desk offers a picture', await p.shown('picAdd') && (await p.text('picAdd')) === 'Add a picture or GIF');
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
  check('an unsigned note says whose conversation it came from', got[0] === 'Not signed. From your bottles with Jorge.' && got[1] === 'Send one back to Jorge', got.join(' | '));
  check('and a phone with people is offered the way back to its shore', got[2] === 'Back to your shore');
  got = await read({ message: 'my own, unsigned', name: '', mood: 'dusk', to: 'Jorge', key: KEY });
  check('this phone\u2019s own unsigned note is not put down to the other person', got[0] === '' && got[1] === 'Send another to Jorge', got.join(' | '));
  got = await read({ message: 'signed', name: 'Jorge', mood: 'dusk', to: 'Mike', key: KEY });
  check('a signed note is signed as before', got[0] === '~ Jorge' && got[1] === 'Send one back to Jorge', got.join(' | '));
  got = await read({ message: 'from nowhere', name: '', mood: 'dusk', to: '', key: 'zzzzzzzzzzzzzzzzzzzzzz' });
  check('an unsigned note from a conversation this phone does not know says nothing it cannot know', got[0] === '' && got[1] === 'Send one back', got.join(' | '));
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
await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(bad.length ? `\n${bad.length} WRONG` : `\nall ${results.length} ok`);
process.exit(bad.length ? 1 : 0);
