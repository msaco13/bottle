// Keepsakes: the shells and stars a conversation leaves on its shore.
// They must be the same on both phones, must only ever be added to, and must stay where a phone can see them.
import { keepsakes, grow, keepLine, starAt, MAX_SHELLS, STARS } from '../js/keeps.js';
import { Flat } from '../js/flat.js';
import assert from 'node:assert';

const KEY = 'abcdefghijklmnopqrstuv';
const strip = (k) => JSON.stringify({ shells: k.shells.map((s) => [s.x, s.z, s.r, s.turn, s.kind, s.tint]), stars: k.stars.map((s) => [s.u, s.v]), name: k.name });

// the same key gives the same shore, on any phone, every time
assert.equal(strip(keepsakes(KEY, 7)), strip(keepsakes(KEY, 7)));
assert.notEqual(strip(keepsakes(KEY, 7)), strip(keepsakes(KEY + 'x', 7)), 'another conversation has another shore');

// a shore only gains: what lay there at 3 bottles lies in the same place at 12
const full = keepsakes(KEY, 40);
for (let n = 0; n <= 14; n++) {
  const k = keepsakes(KEY, n);
  assert.equal(k.count, n);
  assert.equal(k.shells.length, Math.min(n, MAX_SHELLS));
  assert.equal(k.stars.length, Math.min(n, STARS));
  assert.equal(k.whole, n >= STARS);
  assert.equal(k.name, full.name);
  k.shells.forEach((s, i) => assert.deepEqual([s.x, s.z, s.kind], [full.shells[i].x, full.shells[i].z, full.shells[i].kind]));
  k.stars.forEach((s, i) => assert.deepEqual([s.u, s.v], [full.stars[i].u, full.stars[i].v]));
}
assert.equal(keepsakes(KEY, -3).shells.length, 0);
assert.equal(keepsakes(KEY, NaN).shells.length, 0);
assert.match(full.name, /^The [A-Z][a-z]+ [A-Z][a-z]+$/);

// over many conversations: every shell is on dry sand a phone held upright can see, clear of the lantern and of each other
const flat = new Flat({ width: 0, height: 0, getContext: () => ({}) });
flat.resize(390, 844, 1);
flat.cam.target = [0, 0, -1.5];                          // where the camera looks while the bottle is being dragged up the sand
let closest = 9;
for (let c = 0; c < 300; c++) {
  const k = keepsakes('conversation ' + c, 12);
  k.shells.forEach((s, i) => {
    assert(s.z >= 1.02 && s.z <= 1.23, 'on the sand the tide does not reach');
    assert(Math.hypot(s.x - 0.27, s.z - 1.16) - s.r > 0.02, 'clear of the lantern');
    assert.equal(s.kind === 2, i % 5 === 4, 'every fifth is a starfish');
    const p = flat.project([s.x, 0, s.z]);
    assert(p.front && p.x > 8 && p.x < 382 && p.y > 600 && p.y < 720, `shell ${i} of conversation ${c} is on the screen, above the line of words (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    for (let j = 0; j < i; j++) closest = Math.min(closest, Math.hypot(s.x - k.shells[j].x, s.z - k.shells[j].z) - s.r - k.shells[j].r);
  });
  // the stars run left to right, so the line through them never doubles back, and they keep clear of the moon
  k.stars.forEach((s, i) => {
    assert(s.v >= 0 && s.v <= 1 && s.u > -1 && s.u < 1);
    if (i) assert(s.u > k.stars[i - 1].u, 'left to right');
    const at = starAt(s, false);
    assert(at[0] < 0.10 && at[1] > 0.11 && at[1] < 0.21, 'in the band of sky a phone shows, left of the moon');
  });
}
assert(closest > 0, 'no shell lies on another (the tightest gap: ' + closest.toFixed(3) + ')');

// fading in: one after another, and the lines only once all ten are lit
const k = keepsakes(KEY, 10);
grow(k, 0.1);
assert(k.shells[0].a > 0 && k.shells[1].a === 0, 'the second waits for the first');
assert.equal(k.join, 0);
for (let i = 0; i < 600; i++) grow(k, 1 / 60);
assert(k.shells.every((s) => s.a === 1) && k.stars.every((s) => s.a === 1));
assert.equal(k.join, 1);
grow(null, 0.1);

// the line under the note
assert.equal(keepLine(null), '');
assert.equal(keepLine(keepsakes(KEY, 0)), '');
assert.match(keepLine(keepsakes(KEY, 1)), /left a shell/);
assert.match(keepLine(keepsakes(KEY, 4)), /^4 shells .* 6 more bottles and your stars join up\.$/);
assert.match(keepLine(keepsakes(KEY, 9)), /One more bottle and your stars join up\.$/);
assert.equal(keepLine(keepsakes(KEY, 12)), `12 bottles between you. Your stars have joined up: ${full.name}.`);

console.log(`keeps ok: 300 shores, tightest gap between two shells ${closest.toFixed(3)}. This one is "${full.name}"`);
