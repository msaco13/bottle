// Conversations: the scrambling, and the promise that nothing depends on the server.
import { newKey, newClaim, claimHash, threadId, seal, unseal, box, unbox, add, list, open, SERVER } from '../js/thread.js';
import fs from 'node:fs';
import assert from 'node:assert';

const key = newKey(), other = newKey();
assert(/^[A-Za-z0-9_-]{22}$/.test(key), 'a key is 22 link-safe characters');
assert.notEqual(key, other);

// the conversation number is steady for a key, differs between keys, and gives nothing away about the key
const id = await threadId(key);
assert.equal(id, await threadId(key));
assert.notEqual(id, await threadId(other));
assert(/^[A-Za-z0-9_-]{22}$/.test(id) && !id.includes(key.slice(0, 8)));

// a note comes back exactly, only with the right key, and never looks the same twice on the server
const note = { m: 'See you at the pier. \u{1F37E}\nBring the kite.', n: 'Ana', mood: 'night', to: 'Michael', id: 'abc123', t: 1794500000000 };
const a = await seal(key, note), b = await seal(key, note);
assert.notEqual(a, b, 'the same note must scramble differently each time');
assert(!a.includes('pier') && !Buffer.from(a.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1').includes('pier'), 'the server must not be able to read it');
assert.deepEqual(await unseal(key, a), note);
assert.equal(await unseal(other, a), null, 'the wrong key reads nothing');
assert.equal(await unseal(key, a.slice(0, -3) + 'AAA'), null, 'a tampered note is refused');
assert.equal(await unseal(key, 'not-a-note'), null);
console.log(`a 40 character note is ${a.length} characters on the server, unreadable without the key`);
assert((await seal(key, { m: 'x'.repeat(600), n: 'n'.repeat(40), mood: 'night', to: 't'.repeat(40), id: 'abcdefghij', t: 1794500000000 })).length < 3000, 'the longest note fits the server limit');

// seats: 16 link-safe characters, kept on the server only as a fingerprint
const seatA = newClaim();
assert(/^[A-Za-z0-9_-]{16}$/.test(seatA) && seatA !== newClaim());
assert(/^[0-9a-f]{64}$/.test(await claimHash(seatA)) && !(await claimHash(seatA)).includes(seatA));
// anything can be boxed with a secret, and only that secret opens it
const boxed = await box('shore:secret', { threads: [{ k: key }] });
assert.deepEqual(await unbox('shore:secret', boxed), { threads: [{ k: key }] });
assert.equal(await unbox('shore:other', boxed), null);

// with no server, or a dead one, everything quietly carries on
const saved = { ...SERVER };
SERVER.url = ''; SERVER.key = '';
const me = 'a'.repeat(22);
assert.equal(await add(me, key, note, newClaim()), false);
assert.equal(await list(me, key), null, 'no server: null, so the page falls back on what the phone has kept');
assert.equal(await open(me, key, newClaim()), null);
SERVER.url = 'http://127.0.0.1:9'; SERVER.key = 'x';            // nothing listens here
const t0 = Date.now();
assert.equal(await add(me, key, note, newClaim()), false);
assert.equal(await list(me, key), null);
assert(Date.now() - t0 < 14000, 'a dead server must not hang the page');
Object.assign(SERVER, saved);

// the built file is up to date with the source
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
for (const f of ['code', 'scene', 'flat', 'story', 'audio', 'thread', 'shore', 'lantern', 'count', 'main']) {
  const src = fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8');
  const probe = src.split('\n').filter((l) => l.length > 50 && !l.startsWith('import') && !l.startsWith('export'))[3];
  assert(app.includes(probe), `app.js is stale: rebuild (node build.mjs) after changing js/${f}.js`);
}
// the safety net in the page reports to the same server as the app
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(page.includes(JSON.stringify(SERVER.url)) && page.includes(JSON.stringify(SERVER.key)), 'index.html has a different server address from js/thread.js: rebuild');

// device families, as the counter names them
const { device } = await import('../js/count.js');
assert.equal(device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), 'iPhone iOS 18.1 · Safari 18');
assert.equal(device('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), 'Android 14 · Chrome 130');
assert.equal(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.0 (iPhone15,2; iOS 17_5)'), 'iPhone iOS 17.5 · Instagram');
assert.equal(device('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'), 'Android 13 · Samsung 25');
console.log('thread ok');
