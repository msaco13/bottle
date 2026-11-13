import { encode, decode, linkFor, MAX_MESSAGE } from '../js/code.js';
import assert from 'node:assert';

const cases = [
  ['Meet me where the pier ends.', 'Michael'],
  ['No name on this one.', ''],
  ['Línea uno\nlínea dos\n\n¿Cómo estás? 你好 שלום', 'José'],
  ['Emoji survive too: 🍾🌊❤️‍🔥 and "quotes" & <tags> #hash ?q=1', 'Ana & Co.'],
  ['x'.repeat(MAX_MESSAGE), 'Long'],
];
for (const [m, n] of cases) {
  const e = encode(m, n);
  assert(/^1\.[A-Za-z0-9_-]+$/.test(e), 'only link-safe characters');
  assert.deepEqual(decode('#' + e), { message: m, name: n });
  assert.deepEqual(decode(e), { message: m, name: n });
  assert.deepEqual(decode('#' + encodeURIComponent(e)), { message: m, name: n }, 'survives being percent-escaped');
}
const long = linkFor('https://example.test/bottle/', 'x'.repeat(MAX_MESSAGE), 'N');
console.log(`longest possible link: ${long.length} characters. A typical one: ${linkFor('https://example.test/bottle/', cases[0][0], cases[0][1]).length}`);
assert(long.length < 1000);
assert.equal(decode('#' + encode('y'.repeat(900))).message.length, MAX_MESSAGE, 'over-long messages are cut, not broken');
assert.equal(linkFor('https://a.test/b/?x=1#old', 'hi').startsWith('https://a.test/b/#1.'), true);
// junk never throws, and is never mistaken for a bottle
for (const junk of ['', '#', '#hello', '#1.', '#1.!!!!', '#1.eyJ4IjoxfQ', '#2.abcd', null, undefined, '#1.' + 'A'.repeat(50)]) assert.equal(decode(junk), null);
// a link with a line break pasted into it still opens
const e = encode('wrapped by a chat app', 'Sam');
assert.equal(decode('#' + e.slice(0, 20) + '\n ' + e.slice(20)).name, 'Sam');
console.log('code ok');
