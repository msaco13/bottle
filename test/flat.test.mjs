// The flat shore (the safety net for a phone with no 3D): the whole story must play on it by touch alone,
// and painting it must never throw, in any state, under any sky.
import { Flat } from '../js/flat.js';
import { Story } from '../js/story.js';
import { DRY_LINE } from '../js/scene.js';
import { keepsakes, grow } from '../js/keeps.js';
import assert from 'node:assert';

// a canvas that accepts every drawing call and counts them
let calls = 0;
const anything = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anything()), apply: () => { calls++; return anything(); }, set: () => true });
const canvas = { width: 0, height: 0, getContext: (kind) => (kind === '2d' ? anything() : null) };

const view = new Flat(canvas);
view.resize(390, 844, 2);
assert.equal(view.scale, 1.5, 'the flat picture is kept light');
assert.equal(canvas.width, 585);
assert(view.flat && view.info().startsWith('2D beach'));
assert.throws(() => new Flat({ getContext: () => null }), /no drawing surface/);

const story = new Story(view);
const paint = () => view.draw({ time: story.t, dim: 0.3, ripples: story.ripples, shadow: [story.bx, story.bz, 0.27, 1], bottle: story.visible ? story.bottleMatrix() : null, cork: story.corkMatrix(), note: story.noteMatrix(), noteOut: story.note > 0.55, wet: 1 });
const run = (secs) => { for (let i = 0; i < secs * 60; i++) { story.update(1 / 60); if (i % 6 === 0) paint(); } };
const seen = [];
const drag = (from, to, steps = 12) => { story.down(from.x, from.y); for (let i = 1; i <= steps; i++) { story.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); story.update(1 / 60); paint(); } story.up(); };

for (const mood of [0, 1, 2]) {
  view.mood = mood; view.lamp = mood === 1 ? 1 : 0;
  paint();
}
// and with everything a long conversation leaves on the shore: shells, a starfish, the joined stars
view.keeps = keepsakes('abcdefghijklmnopqrstuv', 12);
for (let i = 0; i < 400; i++) grow(view.keeps, 1 / 60);
for (const mood of [0, 1, 2]) { view.mood = mood; paint(); }
story.down(195, 600); story.up(); seen.push(story.state);
run(12);
assert(story.seen, 'the bottle comes into sight');
const at = story.onScreen([0, 0, 0]);
assert(at.x > 0 && at.x < 390 && at.y > 0 && at.y < 844, 'the bottle is on the screen where a finger can reach it');
const dry = view.project([0.1, 0, DRY_LINE + 0.5]);
drag(at, dry); seen.push(story.state);
run(3); seen.push(story.state);
const cork = story.onScreen([0, 0.475, 0]);
drag(cork, { x: cork.x, y: cork.y - 130 }); run(0.5); seen.push(story.state);
drag({ x: 195, y: 520 }, { x: 195, y: 280 }); run(0.5); seen.push(story.state);
assert.deepEqual(seen, ['adrift', 'lift', 'held', 'open', 'reading'], 'by touch alone, on the flat shore: ' + seen.join(' > '));
run(2);
assert(calls > 5000, 'and it was painted the whole way');
console.log('flat ok: ' + seen.join(' > '));
