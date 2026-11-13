// Written in the sand: what the finger traced must come back as it was traced, and junk must never be mistaken for it.
import { pack, unpack, pointsIn, frame, paint, MAX_POINTS, SAND_TYPE } from '../js/sand.js';
import { wrap, unwrap, newPic } from '../js/pic.js';
import assert from 'node:assert';

const strokes = [[0.1, 0.2, 0.15, 0.25, 0.2, 0.3], [0.5, 0.5], [0.9, 0.1, 0.8, 0.2]];
const bytes = pack(strokes, 0.46);
assert.equal(bytes.length, 3 + (2 + 12) + (2 + 4) + (2 + 8));
const back = unpack(bytes);
assert.equal(back.aspect, 0.46);
assert.equal(back.strokes.length, 3);
assert.equal(pointsIn(back.strokes), 6);
back.strokes.forEach((s, i) => s.forEach((v, j) => assert(Math.abs(v - strokes[i][j]) < 1 / 60000, 'a point comes back where it was put')));

// numbers off the pad are pulled back onto it, half a point is dropped, an empty stroke is dropped
const odd = unpack(pack([[-1, 2, 0.5, 0.5, 0.7], [], [0.3]], 3));
assert.deepEqual(odd.strokes.map((s) => s.length), [4]);
assert.deepEqual(odd.strokes[0].slice(0, 2), [0, 1]);
assert.equal(unpack(pack([], 0.5)), null, 'nothing written is nothing');
assert.equal(unpack(pack([[0.2, 0.2]], 99)).aspect, 10, 'an absurd shape is pulled back to a possible one');

// a long scribble is cut at the limit, not broken
const long = [Array.from({ length: (MAX_POINTS + 500) * 2 }, (_, i) => (i % 97) / 97)];
assert.equal(pointsIn(unpack(pack(long, 0.5)).strokes), MAX_POINTS);
assert(pack(long, 0.5).length < 20000, 'and it stays small: ' + pack(long, 0.5).length + ' bytes');

// junk is never mistaken for it, and never throws
for (const junk of [new Uint8Array(0), new Uint8Array([1]), new Uint8Array([2, 0, 46, 0, 1, 0, 0, 0, 0]), new Uint8Array([1, 0, 46, 0, 9, 1, 2]), new Uint8Array([1, 0, 46, 0, 0]), null, 'words']) assert.equal(unpack(junk), null);

// it travels the same way a picture does: scrambled, and marked as sand
const secret = newPic();
const got = await unwrap(secret, await wrap(secret, bytes, SAND_TYPE));
assert.equal(got.type, SAND_TYPE);
assert.deepEqual(Array.from(got.bytes), Array.from(bytes));

// the writing keeps its shape on a screen of another shape
assert.deepEqual(frame(400, 800, 0.5), { x: 0, y: 0, w: 400, h: 800 });
const wide = frame(800, 400, 0.5);
assert.deepEqual([wide.w, wide.h, wide.x, wide.y], [200, 400, 300, 0]);

// painting never throws: with nothing written, half written, with the wave coming and going, under every sky
let calls = 0;
const anything = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anything()), apply: () => { calls++; return anything(); }, set: () => true });
for (const mood of [0, 1, 2, 9]) for (const shown of [0, 0.4, 1]) for (const wave of [null, { front: 0.3, back: false }, { front: 0.6, back: true }]) paint(anything(), 390, 844, mood, back.strokes, back.aspect, shown, wave);
paint(anything(), 390, 844, 0, [], 0.5, 1, null);
assert(calls > 500);
console.log('sand ok: ' + pack(long, 0.5).length + ' bytes for the longest scribble');
