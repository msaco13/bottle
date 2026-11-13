import { encode, decode, linkFor, MAX_MESSAGE } from '../js/code.js';
import assert from 'node:assert';
import fs from 'node:fs';

// ---- THE PROMISE: links that are already out in the world keep opening.
// These were made by the first published version (2026-11-12). Never edit them. Only add.
const SENT = [
  ['1.WyJNZWV0IG1lIHdoZXJlIHRoZSBwaWVyIGVuZHMuXG5CcmluZyB0aGUga2l0ZS4gSSB3aWxsIGJyaW5nIHRoZSBjb2ZmZWUuXG5cbkkgaGF2ZSBzb21ldGhpbmcgdG8gdGVsbCB5b3UuIiwiTWljaGFlbCJd',
    'Meet me where the pier ends.\nBring the kite. I will bring the coffee.\n\nI have something to tell you.', 'Michael'],
  ['1.WyJIYXBweSBiaXJ0aGRheSwgRGFkLlxuU2FtZSBiZW5jaCwgU3VuZGF5IGF0IDk_IiwiTWlrZSJd', 'Happy birthday, Dad.\nSame bench, Sunday at 9?', 'Mike'],
  ['1.WyJJZiB5b3UgY2FuIHJlYWQgdGhpcywgdGhlIGJvdHRsZSBtYWRlIGl0IGFjcm9zcy4g8J-NvlxuQ2FsbCBtZSB3aGVuIHlvdSBmaW5kIGl0LiIsIk1pY2hhZWwiXQ',
    'If you can read this, the bottle made it across. \u{1F37E}\nCall me when you find it.', 'Michael'],
  ['1.WyLDiW1vamkg8J+NviBhbmQgYWNjZW50czogSm9zw6kiLCJBbmEiXQ', 'Émoji \u{1F37E} and accents: José', 'Ana'],
  ['1.WyJObyBuYW1lIG9uIHRoaXMgb25lLiJd', 'No name on this one.', ''],
];
for (const [link, message, name] of SENT) {
  assert.deepEqual(decode('#' + link), { message, name, mood: 'dusk', to: '', key: '', claim: '' }, 'an old link no longer opens the same: ' + link.slice(0, 24));
}
// The safety-net reader inside index.html must make the same promise, on its own.
{
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const src = html.slice(html.indexOf('function read(h)'), html.indexOf('window.__plain'));
  assert(src.includes('function read(h)'), 'the safety-net reader is missing from index.html');
  const read = new Function(src + '; return read;')();
  for (const [link, message, name] of SENT) {
    const v = read('#' + link);
    assert(v && v[0] === message && (v[1] || '') === name, 'the safety net reads an old link differently: ' + link.slice(0, 24));
  }
  assert.equal(read('#nonsense'), null);
  // and it reads the newest kind of link too
  const v = read('#' + encode('new kind', 'Ana', 'night', 'Michael', 'abcdefghijklmnopqrstuv'));
  assert(v && v[0] === 'new kind' && v[1] === 'Ana');
}
console.log(`${SENT.length} links from the first version still open, in the app and in the safety net`);

// ---- new links
const KEY = 'Qk3_x9-AbCdEfGhIjKlMnO';
const cases = [
  ['Meet me where the pier ends.', 'Michael', 'dusk', '', ''],
  ['No name on this one.', '', 'dusk', '', ''],
  ['Línea uno\nlínea dos\n\n¿Cómo estás? 你好 שלום', 'José', 'night', '', ''],
  ['Emoji survive too: \u{1F37E}\u{1F30A} and "quotes" & <tags> #hash ?q=1', 'Ana & Co.', 'dawn', 'Michael', KEY],
  ['A reply with no name and no mood', '', 'dusk', 'Michael', KEY],
  ['x'.repeat(MAX_MESSAGE), 'Long', 'night', 'Someone', KEY],
  ['A bottle with a seat', 'Ana', 'dusk', 'Michael', KEY, 'aB3_dE6-gH9jK2mN'],
  ['A seat but no one named', '', 'dusk', '', KEY, 'aB3_dE6-gH9jK2mN'],
];
for (const [m, n, mood, to, key, claim = ''] of cases) {
  const e = encode(m, n, mood, to, key, claim);
  assert(/^1\.[A-Za-z0-9_-]+$/.test(e), 'only link-safe characters');
  const want = { message: m, name: n, mood, to, key, claim };
  assert.deepEqual(decode('#' + e), want);
  assert.deepEqual(decode(e), want);
  assert.deepEqual(decode('#' + encodeURIComponent(e)), want, 'survives being percent-escaped');
}
// a plain dusk bottle is written exactly as the first version wrote it
assert.equal(encode('Happy birthday, Dad.\nSame bench, Sunday at 9?', 'Mike'), SENT[1][0]);
assert.equal(encode('No name on this one.'), SENT[4][0]);
// things a future version might add are ignored, not fatal
{
  const bytes = new TextEncoder().encode(JSON.stringify(['from the future', 'Zed', 'zz', 7, { extra: 1 }, 'more']));
  const future = '1.' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(decode(future), { message: 'from the future', name: 'Zed', mood: 'dusk', to: '', key: '', claim: '' });
}
// a bad key is dropped rather than trusted
assert.equal(decode(encode('m', 'n', 'dusk', 't', 'short')).key, '');
assert.equal(decode(encode('m', 'n', 'dusk', 't', KEY, 'tiny')).claim, '', 'a seat that is not a seat is dropped');
assert.equal(encode('m', 'n', 'dusk', 't', KEY), encode('m', 'n', 'dusk', 't', KEY, ''), 'no seat, no sixth field: links made before seats read the same');
const long = linkFor('https://msaco13.github.io/bottle/', { message: 'x'.repeat(MAX_MESSAGE), name: 'N', mood: 'night', to: 'T', key: KEY });
const typical = linkFor('https://msaco13.github.io/bottle/', { message: cases[0][0], name: 'Michael', mood: 'dusk', to: 'Ana', key: KEY });
console.log(`longest possible link: ${long.length} characters. A typical reply: ${typical.length}`);
assert(long.length < 1000);
assert.equal(decode('#' + encode('y'.repeat(900))).message.length, MAX_MESSAGE, 'over-long messages are cut, not broken');
assert.equal(linkFor('https://a.test/b/?x=1#old', { message: 'hi' }).startsWith('https://a.test/b/#1.'), true);
// junk never throws, and is never mistaken for a bottle
for (const junk of ['', '#', '#hello', '#1.', '#1.!!!!', '#1.eyJ4IjoxfQ', '#2.abcd', null, undefined, '#1.' + 'A'.repeat(50)]) assert.equal(decode(junk), null);
// a link with a line break pasted into it still opens
const e = encode('wrapped by a chat app', 'Sam');
assert.equal(decode('#' + e.slice(0, 20) + '\n ' + e.slice(20)).name, 'Sam');
// a picture: one more optional thing on the end. With one, the words may be empty.
{
  const PIC = 'pppppppppppppppppppppp';
  const withPic = decode(encode('Look at this', 'Mike', 'night', 'Dad', KEY, 'seatseatseatseat', PIC));
  assert.deepEqual(withPic, { message: 'Look at this', name: 'Mike', mood: 'night', to: 'Dad', key: KEY, claim: 'seatseatseatseat', pic: PIC });
  assert.equal(decode(encode('', 'Mike', 'dusk', '', '', '', PIC)).pic, PIC, 'a picture with no words is still a bottle');
  assert.equal(decode(encode('', 'Mike', 'dusk', '', '', '', PIC)).message, '');
  assert.equal(decode(encode('', 'Mike')), null, 'no words and no picture is not a bottle');
  assert.equal('pic' in decode(encode('words', 'Mike', 'dusk', '', '', '', 'not a picture')), false, 'a picture that is not one is dropped');
  assert.equal('pic' in decode(SENT[1][0]), false, 'an old link has never heard of pictures');
  assert.equal(encode('m', 'n', 'dusk', 't', KEY, 'seatseatseatseat'), encode('m', 'n', 'dusk', 't', KEY, 'seatseatseatseat', ''), 'no picture, no seventh field');
  assert.equal(decode(linkFor('https://a.test/', { message: 'hi', pic: PIC }).split('#')[1]).pic, PIC);
  const longest = linkFor('https://msaco13.github.io/bottle/', { message: 'x'.repeat(MAX_MESSAGE), name: 'N'.repeat(40), mood: 'night', to: 'T'.repeat(40), key: KEY, claim: 'seatseatseatseat', pic: PIC });
  assert(longest.length < 1100, 'the longest link with a picture: ' + longest.length);
}
// a beach many people fill for one person: an eighth optional field, and its link needs no words of its own
{
  const invite = decode(encode('Happy 40th', 'Mike', 'dusk', 'Ana', KEY, '', '', 'i'));
  assert.deepEqual(invite, { message: 'Happy 40th', name: 'Mike', mood: 'dusk', to: 'Ana', key: KEY, claim: '', g: 'i' });
  assert.equal(decode(encode('', 'Mike', 'dusk', 'Ana', KEY, '', '', 'o')).g, 'o', 'a beach with nothing said about it is still a beach');
  assert.equal(decode(encode('', 'Mike', 'dusk', 'Ana', '', '', '', 'o')), null, 'but not without its key');
  assert.equal('g' in decode(encode('words', 'Mike', 'dusk', 'Ana', KEY, '', '', 'x')), false, 'anything else there is dropped');
  assert.equal('g' in decode(SENT[1][0]), false, 'an old link has never heard of beaches');
  assert.equal(encode('m', 'n', 'dusk', 't', KEY, 'seatseatseatseat', 'pppppppppppppppppppppp'), encode('m', 'n', 'dusk', 't', KEY, 'seatseatseatseat', 'pppppppppppppppppppppp', ''), 'no beach, no eighth field');
  assert.equal(decode(linkFor('https://a.test/', { message: 'Farewell', name: 'Mike', to: 'Ana', key: KEY, g: 'i' }).split('#')[1]).g, 'i');
}
console.log('code ok');
