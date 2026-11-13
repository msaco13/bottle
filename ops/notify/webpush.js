// Web Push, by hand, with nothing but the Web Crypto every modern runtime has.
// RFC 8291 (message encryption), RFC 8188 (aes128gcm), RFC 8292 (VAPID).
// Shared by the notification sender (ops/notify/index.ts) and the tests (test/push.test.mjs).

const te = new TextEncoder();
export const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64 = (str) => { let b = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; const bin = atob(b), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
export async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

/** A new sender identity: { jwk (private, stays on the server), pub (public, goes to browsers) }. */
export async function newVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))) };
}

/** The signed pass a push service asks for. aud is the origin of the endpoint. */
export async function vapidToken(aud, jwk, sub) {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o) => b64u(te.encode(JSON.stringify(o)));
  const head = part({ typ: 'JWT', alg: 'ES256' }), body = part({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head + '.' + body)));
  return `${head}.${body}.${b64u(sig)}`;
}

/** Scramble a payload so only that one browser can read it. sub: { p256dh, auth } as the browser gave them. */
export async function encrypt(sub, payload) {
  const ua = unb64(sub.p256dh), auth = unb64(sub.auth);
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const minePub = new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey));
  const theirs = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(te.encode('WebPush: info\0'), ua, minePub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const head = new Uint8Array(21);
  head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return concat(head, minePub, sealed);
}

/** Send one message. Returns the push service's status: 201 sent, 404 or 410 that browser is gone. */
export async function send(sub, data, vapid, about) {
  const url = new URL(sub.endpoint);
  const body = await encrypt(sub, te.encode(JSON.stringify(data)));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high', authorization: `vapid t=${await vapidToken(url.origin, vapid.jwk, about)}, k=${vapid.pub}` },
    body,
  });
  try { await r.arrayBuffer(); } catch { /* nothing to read */ }
  return r.status;
}
