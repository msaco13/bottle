// A picture in a bottle.
//
// A picture cannot travel inside a link, so it is kept on the server. Before it leaves the phone it
// is scrambled (AES-GCM) with a secret that only ever travels inside the link, after the #. The
// server is given unreadable bytes under a name worked out from that secret. It cannot open the
// picture, and cannot tell a photo from a GIF.
//
// A photo is made smaller first, so it is quick to send and to open. A GIF is kept exactly as it
// is, so it still moves.
//
// The words of a bottle never depend on any of this: they are in the link. If the picture cannot
// be fetched, the note is still read.

import { SERVER, b64 } from './thread.js';

export const MAX_GIF = 3500000;          // a GIF is sent whole: this is the most the server will take, less a little
const LONG_SIDE = 1600;                  // a photo's longer side, in dots, after it is made smaller
const TYPES = ['application/octet-stream', 'image/jpeg', 'image/gif', 'image/png', 'image/webp'];
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
const sha = async (text) => new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(text)));

/** A new secret for one picture: 16 random bytes as 22 link-safe characters. */
export function newPic() { const a = new Uint8Array(16); globalThis.crypto.getRandomValues(a); return b64(a); }
export const isPic = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s);

/** The name the server knows a picture by. Worked out from the secret, and no way back. */
export async function nameOf(secret) { return Array.from((await sha('bottle-pic-name:' + secret)).subarray(0, 20), (b) => b.toString(16).padStart(2, '0')).join(''); }
const keyOf = async (secret) => subtle().importKey('raw', await sha('bottle-pic-key:' + secret), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Scramble a picture. What comes out is 12 random bytes, then the picture and its kind, unreadable without the secret. */
export async function wrap(secret, bytes, type) {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const plain = new Uint8Array(bytes.length + 1);
  plain[0] = Math.max(0, TYPES.indexOf(type));
  plain.set(bytes, 1);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await keyOf(secret), plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}

/** Unscramble one. null if the secret is wrong or it has been tampered with. */
export async function unwrap(secret, data) {
  try {
    const raw = data instanceof Uint8Array ? data : new Uint8Array(data);
    const plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await keyOf(secret), raw.subarray(12)));
    const type = TYPES[plain[0]];
    return type && plain[0] > 0 ? { bytes: plain.subarray(1), type } : null;
  } catch { return null; }
}

/**
 * Make a chosen file ready to send. A GIF is kept as it is. Anything else is redrawn as a photo no longer than 1600 dots a side.
 * Resolves { bytes, type }. Throws 'big' (a GIF over the limit), 'kind' (not a picture) or 'open' (the phone could not read it).
 */
export async function prepare(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('kind');
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF) throw new Error('big');
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: 'image/gif' };
  }
  let img = null, w = 0, h = 0, url = '';
  try {
    if (typeof createImageBitmap === 'function') { try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { img = null; } }
    if (!img) {
      url = URL.createObjectURL(file);
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('open')); i.src = url; });
    }
    w = img.width || img.naturalWidth; h = img.height || img.naturalHeight;
    if (!w || !h) throw new Error('open');
    const k = Math.min(1, LONG_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    if (!g) throw new Error('open');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);          // a see-through picture gets a white page behind it
    g.drawImage(img, 0, 0, c.width, c.height);
    const shot = (q) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));
    let blob = await shot(0.82);
    if (blob && blob.size > 700000) blob = await shot(0.68);
    if (!blob) throw new Error('open');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'image/jpeg' };
  } catch (e) {
    throw new Error(e && /^(big|kind)$/.test(e.message) ? e.message : 'open');
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (img && img.close) img.close();
  }
}

const at = (name) => `${SERVER.url}/storage/v1/object/pictures/${name}`;

/** Scramble a picture and leave it with the server. Resolves true once it is really there. */
export async function put(secret, bytes, type, ms = 45000) {
  if (!SERVER.url || !subtle() || typeof fetch !== 'function') return false;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(at(await nameOf(secret)), {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'content-type': 'application/octet-stream', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key },
      body: await wrap(secret, bytes, type),
    });
    if (r.ok) return true;
    return /uplicate|already exists/i.test(await r.text());         // sent twice (a second try after a dropped answer): it is there
  } catch { return false; } finally { clearTimeout(timer); }
}

/** Fetch a picture and unscramble it. Resolves { blob, type }, or null if it could not be had. */
export async function get(secret, ms = 30000) {
  if (!isPic(secret) || !SERVER.url || !subtle() || typeof fetch !== 'function') return null;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(`${SERVER.url}/storage/v1/object/public/pictures/${await nameOf(secret)}`, { signal: ctl ? ctl.signal : undefined });
    if (!r.ok) return null;
    const v = await unwrap(secret, await r.arrayBuffer());
    return v ? { blob: new Blob([v.bytes], { type: v.type }), type: v.type } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
