// Your shore: what this phone remembers, and who it is to the server.
//
// The memory is small: your name, the conversations you are part of, the ids of
// notes you wrote, and a copy of the notes you have already seen (so the history
// is still here if the server is asleep or gone).
//
// The shore's SECRET is made here and never leaves the phone as it is. Two things
// are worked out from it:
//   a token   shown to the server to say "this is me" (for the seats in thread.js)
//   a key     that scrambles the list of conversations before a copy is kept on
//             the server, so the same shore can be opened from the Home Screen app
// The server can check the token. It cannot work the secret or the key back out of it.

import { rpc, box, unbox, b64, hex, threadId } from './thread.js';

const has = typeof localStorage !== 'undefined';
const get = (k) => { try { return has ? localStorage.getItem(k) : null; } catch { return null; } };
const set = (k, v) => { try { if (has) localStorage.setItem(k, v); } catch {} };
const stored = (k) => { try { const v = JSON.parse(get(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const sha = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

export const myName = () => get('bottle-name') || '';
export function setName(n) { if (n !== myName()) { set('bottle-name', n); save(); } }
export const threads = () => stored('bottle-threads').filter((x) => x && typeof x.k === 'string');

// A note the server knows is mine only if this phone wrote it. A note known just from its link is guessed from the name on it,
// until the conversation loads and says for certain (two people can share a name).
export const isMine = (n) => !!n && (n.id ? stored('bottle-mine').includes(n.id) : !!(n.name && n.name === myName()));
export function wrote(id) { set('bottle-mine', JSON.stringify([id, ...stored('bottle-mine')].slice(0, 300))); save(); }

/** Keep a conversation: its key, who it is with, the newest note already seen (by the server's clock), and their mobile number if one was given. */
export function remember(k, w, seenAt, p) {
  if (!k) return;
  const all = threads(), old = all.find((x) => x.k === k) || {};
  const next = { k, w: w || old.w || '', s: Math.max(old.s || 0, seenAt || 0), t: Date.now() };
  if (p || old.p) next.p = p || old.p;
  set('bottle-threads', JSON.stringify([next, ...all.filter((x) => x.k !== k)].slice(0, 30)));
  if (next.w !== old.w || next.s !== old.s || next.p !== old.p || !old.k) save();
}

/** A mobile number as a phone will dial it: digits, with a leading + if it had one. '' if it is not a number. */
export function mobile(text) {
  const t = String(text || '').trim(), digits = t.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? (t.startsWith('+') ? '+' : '') + digits : '';
}

// What this phone has learned about reaching the other side of each conversation. Kept on this phone only.
//   j: someone else has joined (so a bottle left on the shore will be found)    l: their lantern was lit when last heard
const reaches = () => { try { const v = JSON.parse(get('bottle-reach') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
export function reachOf(k) { const v = reaches()[k]; return v && typeof v === 'object' ? v : {}; }
export function setReach(k, what) {
  if (!k) return;
  const all = reaches(), keep = new Set(threads().map((t) => t.k));
  for (const key of Object.keys(all)) if (!keep.has(key) && key !== k) delete all[key];
  all[k] = { ...(all[k] || {}), ...what, t: Date.now() };
  set('bottle-reach', JSON.stringify(all));
}

// ---------------------------------------------------------------- the notes already seen, kept on the phone

const notes = () => { try { const v = JSON.parse(get('bottle-notes') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
/** What this phone has already seen of a conversation, oldest first. */
export function kept(key) { const v = notes()[key]; return Array.isArray(v) ? v : []; }
/** Add what the server just said to what is kept, and give back the two together. */
export function keep(key, fresh) {
  const by = new Map();
  for (const n of [...kept(key), ...(fresh || [])]) if (n && n.id) by.set(n.id, n);
  const all = [...by.values()].sort((a, b) => a.at - b.at).slice(-80);
  const book = notes();
  book[key] = all;
  const order = threads().map((t) => t.k);
  for (const k of Object.keys(book)) if (k !== key && !order.slice(0, 15).includes(k)) delete book[k];
  set('bottle-notes', JSON.stringify(book));
  return all;
}

// ---------------------------------------------------------------- who this phone is

/** The secret of this shore. Made the first time it is needed. */
export function secret() {
  let s = get('bottle-shore');
  if (!s || !/^[A-Za-z0-9_-]{22}$/.test(s)) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    s = b64(a);
    set('bottle-shore', s);
  }
  return s;
}

let tokenOf = '', tokenIs = '';
/** What the server is shown. Worked out from the secret, and no way back. */
export async function token() {
  const s = secret();
  if (tokenOf !== s) { tokenIs = b64((await sha('bottle-shore-auth:' + s)).subarray(0, 16)); tokenOf = s; }
  return tokenIs;
}

// ---------------------------------------------------------------- a copy with the server, scrambled

const state = () => ({ v: 1, name: myName(), threads: threads(), mine: stored('bottle-mine') });

/** Fold another copy of the shore into this one. Returns true if anything here changed. */
function fold(other) {
  if (!other || typeof other !== 'object') return false;
  const before = JSON.stringify(state());
  const by = new Map();
  for (const t of [...(Array.isArray(other.threads) ? other.threads : []), ...threads()]) {
    if (!t || typeof t.k !== 'string') continue;
    const old = by.get(t.k);
    const one = old ? { k: t.k, w: (t.t || 0) >= (old.t || 0) ? (t.w || old.w || '') : (old.w || t.w || ''), s: Math.max(t.s || 0, old.s || 0), t: Math.max(t.t || 0, old.t || 0) } : { k: t.k, w: t.w || '', s: t.s || 0, t: t.t || 0 };
    const p = old ? ((t.t || 0) >= (old.t || 0) ? (t.p || old.p) : (old.p || t.p)) : t.p;
    if (typeof p === 'string' && p) one.p = p;
    by.set(t.k, one);
  }
  set('bottle-threads', JSON.stringify([...by.values()].sort((a, b) => b.t - a.t).slice(0, 30)));
  set('bottle-mine', JSON.stringify([...new Set([...stored('bottle-mine'), ...(Array.isArray(other.mine) ? other.mine : [])])].slice(0, 300)));
  if (!myName() && typeof other.name === 'string' && other.name) set('bottle-name', other.name.slice(0, 40));
  return JSON.stringify(state()) !== before;
}

/** Bring in whatever the server's copy has that this phone does not. Resolves true if something new arrived. */
export async function pull() {
  try {
    const blob = await rpc('shore_get', { p_auth: await token() });
    if (typeof blob !== 'string') return false;
    return fold(await unbox('shore:' + secret(), blob));
  } catch { return false; }
}

let timer = 0;
/** Send this phone's copy to the server, a moment after the last change. */
export function save() {
  if (!has || typeof window === 'undefined') return;
  clearTimeout(timer);
  timer = setTimeout(() => { saveNow(); }, 1200);
}
export async function saveNow() {
  try {
    clearTimeout(timer);
    await pull();
    const ok = await rpc('shore_put', { p_auth: await token(), p_blob: await box('shore:' + secret(), state()) });
    names();
    return ok === 'ok';
  } catch { return false; }
}

// ---------------------------------------------------------------- carrying the shore to the Home Screen app (iPhone)

/**
 * An iPhone only delivers notifications to a page that has been added to the Home Screen, and that
 * app starts with an empty memory. So the shore is left in a parcel on the server, scrambled, and the
 * app is started with the parcel's one-time code in its address. The code works once, for three days.
 */
export async function carry() {
  try {
    if (!(await saveNow())) return '';
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    const code = b64(a);
    const ok = await rpc('handoff_put', { p_id: await hex('bottle-handoff-id:' + code), p_blob: await box('handoff:' + code, { s: secret() }) });
    return ok === 'ok' ? code : '';
  } catch { return ''; }
}

/** The other end: open the parcel and become that shore. Resolves 'here' already done, 'came' just arrived, 'lost' no parcel. */
export async function arrive(code) {
  try {
    if (!/^[A-Za-z0-9_-]{22}$/.test(code || '')) return 'lost';
    if (get('bottle-carried') === code) return 'here';
    const blob = await rpc('handoff_take', { p_id: await hex('bottle-handoff-id:' + code) });
    const v = typeof blob === 'string' ? await unbox('handoff:' + code, blob) : null;
    if (!v || !/^[A-Za-z0-9_-]{22}$/.test(v.s || '')) return 'lost';
    set('bottle-shore', v.s);
    set('bottle-carried', code);
    await pull();
    save();
    return 'came';
  } catch { return 'lost'; }
}

// ---------------------------------------------------------------- for the notification: who each conversation is with

/** Leave a small list where the notification worker can read it: conversation number -> name. Nothing else. */
export async function names() {
  try {
    if (typeof caches === 'undefined') return;
    const map = {};
    for (const t of threads()) map[await threadId(t.k)] = t.w || '';
    const c = await caches.open('bottle-kv');
    await c.put(new URL('__names', location.href.replace(/[?#].*$/, '')).href, new Response(JSON.stringify(map), { headers: { 'content-type': 'application/json' } }));
  } catch {}
}

/** The conversation a notification pointed at, if this phone knows it. */
export async function threadByNumber(id) {
  for (const t of threads()) if ((await threadId(t.k)) === id) return t;
  return null;
}
