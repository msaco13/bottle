// Against the real Bottle database, by hand: node test/live.test.mjs
// It proves the promises about who can read what. It leaves a few scrambled test rows behind.
import { newKey, newClaim, threadId, seal, add, addOpen, list, open, reach, rpc, notify, box, unbox, hex, b64, SERVER } from '../js/thread.js';
import { newPic, put, get, nameOf } from '../js/pic.js';
import assert from 'node:assert';

const person = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return b64(a); };     // what the server is shown for one phone
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (m, n, to) => ({ m, n, mood: 'dusk', to, id: Math.random().toString(36).slice(2, 12), t: Date.now() });
const say = (s) => console.log('ok    ' + s);

const dad = person(), mike = person(), stranger = person();
const key = newKey(), seat1 = newClaim(), seat2 = newClaim();

// Dad writes to Mike. The conversation is his until someone opens the bottle.
assert.equal((await add(dad, key, note('Same bench, Sunday at 9?', 'Dad', 'Mike'), seat1)).ok, true);
assert.equal((await list(dad, key)).length, 1);
assert.deepEqual(await list(mike, key), [], 'before opening the bottle, even the right person sees nothing');
assert.deepEqual(await list(null, key), []);
assert.equal(await open(dad, key, seat1), 'member', 'the writer looking at his own bottle does not use up its seat');
assert.deepEqual(await reach(dad, key), { others: 0, lit: 0 }, 'nobody has joined yet, so the next bottle still needs its link');
say('a new conversation belongs to its writer');

// Mike opens it: he takes the seat.
assert.equal(await open(mike, key, seat1), 'claimed');
assert.equal(await open(mike, key, seat1), 'member', 'opening it again is fine');
assert.equal((await list(mike, key)).length, 1);
say('the first phone to open a bottle joins the conversation');

// Mike forwards the link. The stranger has everything Mike had: the key and the seat. It is not enough.
assert.equal(await open(stranger, key, seat1), 'taken');
assert.deepEqual(await list(stranger, key), [], 'a forwarded link must not show the conversation');
assert.equal((await add(stranger, key, note('let me in', 'X', 'Dad'), newClaim())).ok, false, 'a forwarded link must not let a stranger write into it');
assert.equal(await open(stranger, key, newClaim()), 'taken', 'nor does guessing a seat');
assert.equal(await rpc('add_bottle', { p_thread: await threadId(key), p_body: await seal(key, note('old way in', 'X', '')) }), undefined, 'nor the door the first version used');
assert.deepEqual(await rpc('thread_bottles', { p_thread: await threadId(key) }), []);
say('a forwarded link shows a stranger nothing and lets them add nothing');

// Mike sends one back. Dad, already in the conversation, opens it, and that uses its seat up too.
await wait(1100);
assert.equal((await add(mike, key, note('See you there.', 'Mike', 'Dad'), seat2)).ok, true);
assert.equal(await open(dad, key, seat2), 'member');
assert.equal((await list(dad, key)).length, 2);
assert.equal(await open(stranger, key, seat2), 'taken', 'a reply forwarded on after it was read has no free seat either');
assert.deepEqual(await list(stranger, key), []);
say('replies are sealed the same way');

// Who can be reached: a member learns that the other phone has joined, and whether its lantern is lit. Nobody else learns anything.
assert.deepEqual(await reach(dad, key), { others: 1, lit: 0 }, 'Mike has joined, with no lantern');
assert.deepEqual(await reach(mike, key), { others: 1, lit: 0 });
assert.deepEqual(await reach(stranger, key), { others: 0, lit: 0 }, 'a stranger is told nothing');
assert.deepEqual(await rpc('bottle_reach', { p_auth: null, p_thread: await threadId(key) }), { others: 0, lit: 0 });
assert.deepEqual(await rpc('bottle_reach', { p_auth: dad, p_thread: 'not a conversation' }), { others: 0, lit: 0 });
const lamp = 'https://fcm.googleapis.com/fcm/send/live-test-' + person();
assert.equal(await rpc('push_save', { p_auth: mike, p_endpoint: lamp, p_p256dh: 'B'.repeat(87), p_key: 'a'.repeat(22) }), 'ok');
assert.deepEqual(await reach(dad, key), { others: 1, lit: 1 }, 'Mike lit a lantern: Dad can send straight to it');
assert.deepEqual(await reach(mike, key), { others: 1, lit: 0 }, 'and Mike is not told his own lantern is someone else\'s');
assert.deepEqual(await reach(stranger, key), { others: 0, lit: 0 });
await rpc('push_drop', { p_auth: mike, p_endpoint: lamp });
assert.deepEqual(await reach(dad, key), { others: 1, lit: 0 }, 'the lantern is out again');
say('a member is told who can be reached, and a stranger is told nothing');

// Conversations from before seals stay as they were: the key alone opens them.
const old = newKey();
assert.equal(await rpc('add_bottle', { p_thread: await threadId(old), p_body: await seal(old, note('from before', 'Ana', '')) }), 'ok');
assert.equal(await open(stranger, old, ''), 'legacy');
assert.equal((await list(stranger, old)).length, 1);
assert.equal((await rpc('thread_bottles', { p_thread: await threadId(old) })).length, 1);
say('conversations made before seals still open with their link alone');

// A shore's own list, scrambled; and the parcel that carries a shore to the Home Screen app, good once.
const blob = await box('shore:secret', { v: 1, threads: [{ k: key, w: 'Mike' }] });
assert.equal(await rpc('shore_put', { p_auth: dad, p_blob: blob }), 'ok');
assert.deepEqual(await unbox('shore:secret', await rpc('shore_get', { p_auth: dad })), { v: 1, threads: [{ k: key, w: 'Mike' }] });
assert.equal(await rpc('shore_get', { p_auth: stranger }), null);
const code = newKey(), id = await hex('bottle-handoff-id:' + code);
assert.equal(await rpc('handoff_put', { p_id: id, p_blob: await box('handoff:' + code, { s: 'x'.repeat(22) }) }), 'ok');
assert.deepEqual(await unbox('handoff:' + code, await rpc('handoff_take', { p_id: id })), { s: 'x'.repeat(22) });
assert.equal(await rpc('handoff_take', { p_id: id }), null, 'a parcel opens once');
say('the shore copy and the one-time parcel work');

// A beach many people fill for one person: anyone holding its key may add and may read. Nobody without it can.
const shore = newKey();
assert.equal(await addOpen(shore, note('Forty looks good on you.', 'Mike', 'Ana')), true);
assert.equal(await addOpen(shore, note('Proud of you, kiddo.', 'Dad', 'Ana')), true, 'a second bottle straight after the first is taken, after a short wait');
const washed = await list(null, shore);
assert.deepEqual(washed.map((n) => n.name), ['Mike', 'Dad'], 'the person it is for finds every bottle, oldest first');
assert.deepEqual(await list(null, newKey()), [], 'a key nobody used holds nothing');
say('a beach takes bottles from anyone with its key and gives them all back');

// A picture: left with the server scrambled, fetched back whole, and out of reach of everything else.
const pic = newPic(), photo = new Uint8Array(2000).map((_, i) => (i * 37) % 256);
assert.equal(await put(pic, photo, 'image/jpeg'), true);
const fetched = await get(pic);
assert.equal(fetched.type, 'image/jpeg');
assert.deepEqual(Array.from(new Uint8Array(await fetched.blob.arrayBuffer())), Array.from(photo), 'a picture comes back exactly as it went in');
assert.equal(await put(pic, photo, 'image/jpeg'), true, 'sending the same one twice is harmless');
assert.equal(await get(newPic()), null, 'a secret that was never used fetches nothing');
const where = `${SERVER.url}/storage/v1/object/pictures/`, head = { apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key };
const raw = new Uint8Array(await (await fetch(`${SERVER.url}/storage/v1/object/public/pictures/${await nameOf(pic)}`)).arrayBuffer());
assert.equal(raw.length, 12 + 1 + photo.length + 16);
assert(!raw.subarray(13, 60).every((b, i) => b === photo[i]), 'what the server holds is not the picture');
assert.equal((await fetch(where + 'not-a-picture.jpg', { method: 'POST', headers: { ...head, 'content-type': 'application/octet-stream' }, body: photo })).ok, false, 'only names worked out from a secret are taken');
assert.equal((await fetch(where + 'a'.repeat(40), { method: 'POST', headers: { ...head, 'content-type': 'image/jpeg' }, body: photo })).ok, false, 'only plain bytes are taken');
assert.equal((await fetch(where + await nameOf(pic), { method: 'DELETE', headers: head })).ok, false, 'nobody outside can delete one');
assert.equal((await get(pic)).type, 'image/jpeg', 'and it is still there');
assert.deepEqual(await (await fetch(`${SERVER.url}/storage/v1/object/list/pictures`, { method: 'POST', headers: { ...head, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 5 }) })).json(), [], 'nor list what is there');
say('a picture is kept scrambled, comes back whole, and cannot be listed, changed or deleted from outside');

// Notifications: only real push services are accepted, and the private parts are out of reach.
assert.equal(await rpc('push_save', { p_auth: dad, p_endpoint: 'https://evil.example/push', p_p256dh: 'B'.repeat(87), p_key: 'a'.repeat(22) }), undefined, 'only real push services');
for (const fn of ['vapid_init', 'push_plan', 'push_self', 'push_gone', 'watch_plan']) assert.equal(await rpc(fn, {}), undefined, fn + ' must not be callable from outside');
for (const t of ['bottles', 'threads', 'members', 'shores', 'push_subs', 'handoffs', 'events']) {
  const r = await fetch(`${SERVER.url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key } });
  const body = await r.text();
  assert(!r.ok || body === '[]', `the table ${t} must not be readable directly (${r.status})`);
}
assert.equal(await rpc('push_key', {}), SERVER.push, 'the page and the sender must agree on the public key');
assert.deepEqual(await notify({ do: 'bottle', auth: stranger, thread: await threadId(key) }), { sent: 0, failed: 0 }, 'a stranger cannot make phones ring');
say('tables are locked, private functions are private, and the notification key matches');
console.log('\nlive ok');
