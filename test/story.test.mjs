// The whole story, played headless: by touch alone, then by tilt and shake.
import { Scene, swash, DRY_LINE, CORK_SEAT } from '../js/scene.js';
import { Story } from '../js/story.js';
import assert from 'node:assert';

// The real camera maths, without a screen.
const view = { cam: { pos: [0, 1.22, 2.75], target: [0, 0, -1.5], fov: 62 * Math.PI / 180 }, W: 390, H: 844 };
for (const k of ['basis', 'viewProj', 'project', 'ground']) view[k] = Scene.prototype[k].bind(view);
const DT = 1 / 60;
const run = (s, secs) => { for (let k = 0; k < secs * 60; k++) s.update(DT); };

// the camera and the ground agree with each other
{
  const p = view.project([0.4, 0, 0.6]), back = view.ground(p.x, p.y, 0);
  assert(Math.hypot(back[0] - 0.4, back[2] - 0.6) < 1e-6, 'a point on the sand should project and come back');
  assert.equal(view.ground(195, 40, 0), null, 'a touch on the sky lands nowhere');
  const dry = view.project([0, 0, DRY_LINE + 0.4]);
  assert(dry.y < view.H - 40 && dry.y > view.H * 0.5, 'dry sand should be on screen, low down: y=' + dry.y.toFixed(0));
}

// ---- by touch alone
{
  const s = new Story(view), seen = [];
  const pull = () => { for (const e of s.events) seen.push(e); s.events.length = 0; };
  assert.equal(s.hint(), 'Touch the water');
  s.down(200, 400); s.up();
  assert.equal(s.state, 'adrift');
  let maxZ = -9, hints = new Set();
  for (let k = 0; k < 60 * 45; k++) { s.update(DT); maxZ = Math.max(maxZ, s.bz); hints.add(s.hint()); }
  pull();
  assert(s.seen && seen.includes('sighted'));
  assert(maxZ < DRY_LINE, 'the sea must never carry the bottle onto dry sand by itself (max ' + maxZ.toFixed(2) + ')');
  assert(maxZ > 0.2, 'but it should wash well up the beach (max ' + maxZ.toFixed(2) + ')');
  const c0 = s.onScreen([0, 0, 0]);
  assert(c0.x > 30 && c0.x < 360 && c0.y > 250 && c0.y < 820, `the bottle should be on screen and reachable: ${c0.x.toFixed(0)},${c0.y.toFixed(0)}`);
  console.log(`adrift: the bottle washes between the sea and z=${maxZ.toFixed(2)} (dry sand starts at ${DRY_LINE}). On screen at ${c0.x.toFixed(0)},${c0.y.toFixed(0)} of 390x844`);
  // a touch on the water, not the bottle, only makes a ripple
  s.down(40, 300); s.up(); pull();
  assert(seen.includes('ripple') && s.state === 'adrift');
  // let go while it is still in the wet: it stays where the sea can take it back
  s.down(c0.x, c0.y); assert(s.grab, 'a touch on the bottle should take hold of it');
  const wet = view.project([0, 0.07, 0.5]); s.move(wet.x, wet.y); s.up(); pull();
  assert.equal(s.state, 'adrift'); assert(seen.includes('drop'));
  run(s, 3);
  // drag it out
  const c1 = s.onScreen([0, 0, 0]);
  s.down(c1.x, c1.y);
  assert.equal(s.hint(), 'Keep going, up onto the dry sand');
  const dry = view.project([0.1, 0.07, DRY_LINE + 0.45]);
  for (let k = 1; k <= 20; k++) s.move(c1.x + (dry.x - c1.x) * k / 20, c1.y + (dry.y - c1.y) * k / 20);
  assert.equal(s.hint(), 'Let go');
  s.up(); pull();
  assert.equal(s.state, 'lift');
  run(s, 1.4); pull();
  assert.equal(s.state, 'held'); assert(seen.includes('clink'));
  // held: it should fill a good part of the screen, upright, cork at the top
  const top = s.onScreen([0, 0.5, 0]), bot = s.onScreen([0, -0.5, 0]);
  console.log(`held: the bottle spans ${(Math.abs(bot.y - top.y) / view.H * 100).toFixed(0)}% of the screen height, cork at y=${top.y.toFixed(0)}`);
  assert(top.y < bot.y && top.y > 60 && bot.y < view.H - 60, 'upright and fully on screen');
  assert(Math.abs(bot.y - top.y) > view.H * 0.5);
  assert.equal(s.hint(), 'Drag to turn it. Then pull the cork up');
  // dragging the body turns it, and does not pull the cork
  const mid = s.onScreen([0, -0.1, 0]);
  s.down(mid.x, mid.y); s.move(mid.x + 60, mid.y); s.up();
  assert.equal(s.cork, 0);
  // pulling the cork up opens it
  const ck = s.onScreen([0, CORK_SEAT + 0.02, 0]);
  s.down(ck.x, ck.y);
  // the cork is near the top of the screen: it must come out before the finger runs out of room
  let pulled = 0;
  for (let k = 1; k <= 30; k++) { s.move(ck.x, ck.y - k * 8); pulled = k * 8; s.update(DT); if (s.state === 'open') break; }
  s.up(); pull();
  assert(pulled < ck.y - 30, `the cork needs ${pulled}px of pull but there are only ${ck.y.toFixed(0)}px above it`);
  console.log(`cork: out after a ${pulled}px pull (${ck.y.toFixed(0)}px of room above it)`);
  assert.equal(s.state, 'open'); assert(seen.includes('pop')); assert(s.fly, 'the cork should be in the air');
  assert.equal(s.hint(), 'Pull the note up and out');
  run(s, 2); assert.equal(s.fly, null);
  // pulling the note out
  s.down(mid.x, mid.y);
  for (let k = 1; k <= 40; k++) { s.move(mid.x, mid.y - k * 8); s.update(DT); if (s.state === 'reading') break; }
  s.up(); pull();
  assert.equal(s.state, 'reading'); assert(seen.includes('reveal'));
  console.log('touch only: ' + seen.filter((e) => e.startsWith('state:')).map((e) => e.slice(6)).join(' > '));
}

// ---- with tilt and shake
{
  const s = new Story(view);
  s.down(200, 400); s.up(); run(s, 12);
  s.tilt(0, 1);
  const c = s.onScreen([0, 0, 0]), dry = view.project([0, 0.07, DRY_LINE + 0.4]);
  s.down(c.x, c.y); s.move(dry.x, dry.y); s.up(); run(s, 1.4);
  assert.equal(s.state, 'held');
  assert(/shake/.test(s.hint()));
  // tilting the phone leans the bottle the other way, like a weight hanging in the hand, and it settles
  s.tilt(0.5, 0.87); run(s, 3);
  assert(s.rz < -0.3 && s.rz > -0.8, 'it should lean against the tilt: ' + s.rz.toFixed(2));
  s.tilt(0, 1); run(s, 3);
  assert(Math.abs(s.rz) < 0.05, 'and come back to rest');
  // a gentle wobble is not a shake
  s.shake(4); assert.equal(s.cork, 0);
  let n = 0;
  while (s.state === 'held' && n < 20) { s.shake(14); run(s, 0.2); n++; }
  assert.equal(s.state, 'open');
  console.log(`tilt and shake: the cork came out after ${n} shakes`);
  assert(n >= 3 && n <= 6);
  // upright, the note stays in. Tipped over, it slides out.
  run(s, 2); assert(s.note < 0.01);
  s.tilt(0, -0.8);
  let t = 0; while (s.state === 'open' && t < 10) { s.update(DT); t += DT; }
  assert.equal(s.state, 'reading');
  console.log(`               tipped upside down, the note slid out in ${t.toFixed(1)} s`);
}
// the water's edge in the test is the same sum the shader draws
assert(Math.abs(swash(0, 0) - (-0.55 + 1.25 * 0 + 0)) < 1e-9);
console.log('story ok');
