// Pictures in bottles: what leaves the phone must be unreadable without the secret in the link,
// and a picture must come back exactly as it went in.
import { newPic, isPic, nameOf, wrap, unwrap, put, get, prepare, MAX_GIF } from '../js/pic.js';
import { SERVER } from '../js/thread.js';
import assert from 'node:assert';

const secret = newPic(), other = newPic();
assert(isPic(secret) && secret !== other);
assert(!isPic('short') && !isPic(null) && !isPic('x'.repeat(23)));

// the server knows a picture by a name that says nothing about the secret
const name = await nameOf(secret);
assert.match(name, /^[0-9a-f]{40}$/);
assert.equal(name, await nameOf(secret));
assert.notEqual(name, await nameOf(other));
assert(!name.includes(secret));

// in and out again, byte for byte, and its kind with it
const photo = new Uint8Array(5000).map((_, i) => (i * 37) % 256);
const sealed = await wrap(secret, photo, 'image/jpeg');
assert.equal(sealed.length, 12 + 1 + photo.length + 16, 'twelve random bytes, the kind, the picture, and the seal that shows tampering');
const back = await unwrap(secret, sealed);
assert.equal(back.type, 'image/jpeg');
assert.deepEqual(Array.from(back.bytes), Array.from(photo));
assert.equal((await unwrap(secret, await wrap(secret, photo, 'image/gif'))).type, 'image/gif', 'a GIF stays a GIF');

// unreadable without the secret, and never the same twice
assert.equal(await unwrap(other, sealed), null, 'the wrong secret opens nothing');
const bent = sealed.slice(); bent[40] ^= 1;
assert.equal(await unwrap(secret, bent), null, 'a picture that was tampered with is refused');
assert.equal(await unwrap(secret, new Uint8Array(5)), null);
assert.notDeepEqual(Array.from(await wrap(secret, photo, 'image/jpeg')), Array.from(sealed));
let run = 0, longest = 0;
for (let i = 13; i < sealed.length; i++) { run = sealed[i] === ((sealed[i - 1] + 37) % 256) ? run + 1 : 0; longest = Math.max(longest, run); }
assert(longest < 4, 'nothing of the picture shows through');

// what is not a picture is refused before anything is sent
await assert.rejects(prepare(null), /kind/);
await assert.rejects(prepare({ type: 'text/plain', size: 10 }), /kind/);
await assert.rejects(prepare({ type: 'image/gif', size: MAX_GIF + 1 }), /big/);
const gif = await prepare({ type: 'image/gif', size: 6, arrayBuffer: async () => new Uint8Array([71, 73, 70, 56, 57, 97]).buffer });
assert.deepEqual([gif.type, gif.bytes.length], ['image/gif', 6], 'a GIF is sent exactly as it is, so it still moves');

// with no server, or a dead one, nothing hangs and nothing throws
const saved = { ...SERVER };
SERVER.url = '';
assert.equal(await put(secret, photo, 'image/jpeg'), false);
assert.equal(await get(secret), null);
SERVER.url = 'http://127.0.0.1:9';
const t0 = Date.now();
assert.equal(await put(secret, photo, 'image/jpeg', 3000), false);
assert.equal(await get(secret, 3000), null);
assert(Date.now() - t0 < 8000);
assert.equal(await get('not a picture'), null);
Object.assign(SERVER, saved);

console.log('pic ok');
