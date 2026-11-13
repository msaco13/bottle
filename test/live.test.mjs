// Against the real Bottle database. Run by hand: node test/live.test.mjs
// Proves a conversation round trip, and that the public key can do nothing else.
import { SERVER, newKey, threadId, add, list, seal } from '../js/thread.js';
import assert from 'node:assert';

const rest = (path, init = {}) => fetch(SERVER.url + path, { ...init, headers: { apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key, 'content-type': 'application/json', ...(init.headers || {}) } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const key = newKey();
assert.deepEqual(await list(key), [], 'a new conversation starts empty');
const t0 = Date.now();
assert.equal(await add(key, { m: 'First bottle (automated check, safe to ignore)', n: 'Test A', mood: 'dusk', to: '', id: 'live-a', t: Date.now() }), true, 'the server should take a note');
const ms = Date.now() - t0;
await wait(1200);
assert.equal(await add(key, { m: 'And one back', n: 'Test B', mood: 'night', to: 'Test A', id: 'live-b', t: Date.now() }), true);
const got = await list(key);
assert.deepEqual(got.map((n) => [n.name, n.message, n.to]), [['Test A', 'First bottle (automated check, safe to ignore)', ''], ['Test B', 'And one back', 'Test A']]);
console.log(`round trip ok: two notes stored and read back in order. One save took ${ms} ms`);

// someone with a different key sees nothing
assert.deepEqual(await list(newKey()), []);
// the brakes: too fast, bad shapes
assert.equal(await add(key, { m: 'too soon', n: '', id: 'x', t: 1 }), false, 'two notes in the same second should be refused');
const id = await threadId(key);
for (const bad of [{ p_thread: 'short', p_body: await seal(key, { m: 'x' }) }, { p_thread: id, p_body: 'tiny' }, { p_thread: id, p_body: 'A'.repeat(3001) }, { p_thread: id, p_body: 'has spaces and <tags> ' + 'A'.repeat(60) }]) {
  const r = await rest('/rest/v1/rpc/add_bottle', { method: 'POST', body: JSON.stringify(bad) });
  assert(!r.ok, 'a malformed note must be refused');
}
// the public key cannot read, list, change or delete the table directly
for (const [method, path, body] of [['GET', '/rest/v1/bottles?select=*', null], ['POST', '/rest/v1/bottles', { thread: id, body: 'A'.repeat(60) }], ['DELETE', '/rest/v1/bottles?id=gt.0', null], ['PATCH', '/rest/v1/bottles?id=gt.0', { body: 'A'.repeat(60) }]]) {
  const r = await rest(path, { method, body: body ? JSON.stringify(body) : undefined, headers: { prefer: 'return=representation' } });
  const txt = await r.text();
  assert(!r.ok || txt === '[]', `${method} on the table must not work (got ${r.status} ${txt.slice(0, 60)})`);
}
assert.equal((await list(key)).length, 2, 'nothing was changed by those attempts');
console.log('locked down: the public key can only add a note or read a conversation it already holds the key to');
console.log('live ok');
