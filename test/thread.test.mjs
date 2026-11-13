// Conversations: the scrambling, and the promise that nothing depends on the server.
import { newKey, threadId, seal, unseal, add, list, SERVER } from '../js/thread.js';
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

// with no server, or a dead one, everything quietly carries on
const saved = { ...SERVER };
SERVER.url = ''; SERVER.key = '';
assert.equal(await add(key, note), false);
assert.deepEqual(await list(key), []);
SERVER.url = 'http://127.0.0.1:9'; SERVER.key = 'x';            // nothing listens here
const t0 = Date.now();
assert.equal(await add(key, note), false);
assert.deepEqual(await list(key), []);
assert(Date.now() - t0 < 14000, 'a dead server must not hang the page');
Object.assign(SERVER, saved);

// the built file is up to date with the source
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
for (const f of ['code', 'scene', 'story', 'audio', 'thread', 'main']) {
  const src = fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8');
  const probe = src.split('\n').filter((l) => l.length > 50 && !l.startsWith('import') && !l.startsWith('export'))[3];
  assert(app.includes(probe), `app.js is stale: rebuild (node build.mjs) after changing js/${f}.js`);
}
console.log('thread ok');
