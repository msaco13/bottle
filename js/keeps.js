// Keepsakes: what a conversation leaves on its shore.
//
// Every bottle sent back and forth leaves a shell on the dry sand, and lights one star.
// Every fifth bottle leaves a starfish instead. Ten bottles join the stars into a figure
// with a name of its own.
//
// Nothing here is stored and nothing is sent. Where each shell lies and how the stars are
// laid out is worked out from the conversation's key, which both phones already hold, so
// the two of you see the same shore. How many there are is the number of notes this phone
// already knows of. A stranger with a forwarded link knows of one note, and sees one shell.
//
// Pure: no page, no server. Tested in test/keeps.test.mjs.

export const MAX_SHELLS = 12;
export const STARS = 10;
/** Where the lantern stands on the sand (scene.js and flat.js draw it there). Shells keep clear of it. */
const LAMP = [0.27, 1.16];

/** A steady stream of numbers from 0 to 1, the same every time for the same words. */
function stream(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far left or right of the middle a phone held upright can see the dry sand, this far up the beach. Less a margin. */
const reach = (z) => 0.277 * (0.337 + (2.75 - z) * 0.961) - 0.08;

const FIRST = ['Quiet', 'Patient', 'Wandering', 'Faithful', 'Little', 'Sleeping', 'Bright', 'Listening', 'Returning', 'Barefoot', 'Salt', 'Lantern'];
const SECOND = ['Oar', 'Heron', 'Anchor', 'Gull', 'Sail', 'Shell', 'Tide', 'Dolphin', 'Lighthouse', 'Kite', 'Compass', 'Otter'];

/**
 * The keepsakes of a conversation.
 *   seed   the conversation's key (or, for a link from before conversations, the note itself)
 *   count  how many bottles have gone between the two of you
 * Shell 3 is in the same place whether there are 3 shells or 12, so the shore only ever gains.
 * Each shell: { x, z, r, turn, kind (0 scallop, 1 sea snail, 2 starfish), tint, a }. Each star: { u, v, a }.
 * a is how far it has faded in, 0 to 1: see grow().
 */
export function keepsakes(seed, count) {
  const n = Math.max(0, Math.floor(count) || 0);
  const rs = stream('shells:' + seed), shells = [];
  for (let i = 0; i < MAX_SHELLS; i++) {
    const kind = i % 5 === 4 ? 2 : (rs() < 0.55 ? 0 : 1);
    const r = [0.041, 0.036, 0.056][kind] + rs() * 0.009;
    // They lie where the highest tide leaves things: a band of sand just above the water's reach, and above the line of words
    // at the foot of the screen. Of a couple of hundred places tried, the one with the most room round it wins.
    let x = 0, z = 0, most = -9;
    for (let turn = 0; turn < 240; turn++) {
      const cz = 1.02 + rs() * 0.21, cx = (rs() * 2 - 1) * reach(cz);
      let room = Math.hypot(cx - LAMP[0], cz - LAMP[1]) - 0.05 - r;
      for (const s of shells) room = Math.min(room, Math.hypot(cx - s.x, cz - s.z) - s.r - r);
      if (room > most) { most = room; x = cx; z = cz; }
    }
    shells.push({ x, z, r, turn: rs() * 6.283, kind, tint: rs(), a: 0 });
  }
  // The stars run left to right across the sky, wandering up and down, so the line that joins them never crosses itself.
  const rt = stream('stars:' + seed), stars = [];
  let v = 0.2 + rt() * 0.6;
  for (let i = 0; i < STARS; i++) {
    v += (rt() - 0.5) * 0.95;
    if (v < 0.04) v = 0.08 - v;
    if (v > 0.96) v = 1.92 - v;
    stars.push({ u: -1 + 2 * (i + 0.5 + (rt() - 0.5) * 0.6) / STARS, v, a: 0 });
  }
  const rn = stream('name:' + seed);
  const name = 'The ' + FIRST[Math.floor(rn() * FIRST.length)] + ' ' + SECOND[Math.floor(rn() * SECOND.length)];
  return { count: n, shells: shells.slice(0, Math.min(n, MAX_SHELLS)), stars: stars.slice(0, Math.min(n, STARS)), whole: n >= STARS, join: 0, name };
}

/** Where a star hangs: the x and y of its direction from the viewer. wide: the picture is wider than it is tall, and shows less sky. */
export function starAt(star, wide) {
  return wide ? [star.u * 0.30, 0.035 + star.v * 0.07] : [-0.07 + star.u * 0.14, 0.12 + star.v * 0.085];
}

/** Let new keepsakes fade in, one after another. Called once a frame. */
export function grow(k, dt) {
  if (!k) return;
  for (const list of [k.shells, k.stars]) {
    for (const s of list) {
      if (s.a >= 1) continue;
      s.a = Math.min(1, s.a + dt * 1.5);
      if (s.a < 0.55) break;                           // the next one waits its turn
    }
  }
  const done = k.whole && k.stars.every((s) => s.a >= 1);
  k.join = Math.max(0, Math.min(1, k.join + (done ? dt : -dt) * 0.8));
}

/** The one line under a note that says what the shore is keeping. '' when there is nothing to say. */
export function keepLine(k) {
  if (!k || k.count < 1) return '';
  const n = k.count;
  if (n === 1) return 'This bottle left a shell on the sand. Every bottle between you leaves one, and lights a star.';
  if (n < STARS) return `${n} shells on this shore, one for every bottle between you. ${STARS - n === 1 ? 'One more bottle' : (STARS - n) + ' more bottles'} and your stars join up.`;
  return `${n} bottles between you. Your stars have joined up: ${k.name}.`;
}
