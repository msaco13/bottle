// Web Push, checked from the receiving side: a browser's half of RFC 8291, written out here,
// must be able to open what the sender scrambles. And the signed pass must verify.
import { encrypt, vapidToken, newVapid, hkdf, b64u, unb64 } from '../ops/notify/webpush.js';
import assert from 'node:assert';

const te = new TextEncoder();
const concat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

// what a browser makes when it subscribes
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const sub = { p256dh: b64u(uaPub), auth: b64u(auth) };
assert.equal(sub.p256dh.length, 87); assert.equal(sub.auth.length, 22);

const said = JSON.stringify({ t: 'abcdefghijklmnopqrstuv' });
const body = await encrypt(sub, te.encode(said));

// the header: salt (16), record size (4), key length (1) = 65, the sender's public key
assert.equal(new DataView(body.buffer).getUint32(16), 4096);
assert.equal(body[20], 65);
assert.equal(body[21], 4, 'an uncompressed P-256 point');
const salt = body.subarray(0, 16), asPub = body.subarray(21, 86), sealed = body.subarray(86);

// the browser's side
const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const ikm = await hkdf(auth, shared, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), sealed));
assert.equal(plain[plain.length - 1], 2, 'the last record ends with the byte 2');
assert.equal(new TextDecoder().decode(plain.subarray(0, -1)), said);
assert.notDeepEqual(await encrypt(sub, te.encode(said)), body, 'never the same twice');

// the pass: three parts, signed with the sender's key, naming the push service and a contact that is not an email
const v = await newVapid();
assert.equal(unb64(v.pub).length, 65);
const token = await vapidToken('https://fcm.googleapis.com', v.jwk, 'https://example.test/');
const [h, p, s] = token.split('.');
const pub = await crypto.subtle.importKey('raw', unb64(v.pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64(s), te.encode(h + '.' + p)), 'the pass must verify with the public key');
const claims = JSON.parse(new TextDecoder().decode(unb64(p)));
assert.equal(claims.aud, 'https://fcm.googleapis.com');
assert(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600, 'a pass may not last more than a day');
assert.equal(unb64(s).length, 64);
console.log('push ok');
