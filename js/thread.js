// Conversations. Every bottle carries a secret key shared by the bottles sent back
// and forth after it. With that key a phone can ask the server for the rest of the
// conversation, so an old link shows the newest reply and the earlier notes.
//
// What the server holds is scrambled with the key (AES-GCM) before it leaves the
// phone, and the key only ever travels inside links, after the #. The server sees
// a conversation number and unreadable text. It cannot read a single note.
//
// SEALS. A conversation is sealed: only its members may read it or add to it. Each
// bottle carries one seat (its "claim"). The first phone to open that bottle takes
// the seat. A link that is forwarded on, and opened by someone else later, finds
// the seat taken: they can read the one note that is in the link, and nothing else.
// "Who is asking" is a token made from a secret that never leaves the phone (shore.js).
//
// A bottle never NEEDS the server: the note itself is in the link. If the server is
// slow, asleep or gone, bottles still open and replies still send.

export const SERVER = {
  url: 'https://segtizidayglyouweszn.supabase.co',     // the Bottle project. It holds nothing else.
  // Its publishable key. It is meant to be public: all it can do is call the functions below.
  key: 'sb_publishable_2XYYYTBW-AEQN6IaXllIjQ_mQkYc4PP',
  // The public half of the key notifications are signed with. Also meant to be public.
  push: 'BN4Fq7TPzNUleFeKu7mcCiiu5VQtrmy4sJ2JKRUPJwJwNnPfrSgHIn6lBE2YEZEaSIqL3ns0TDAlJfRuzaRXzIA',
};

export const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64 = (str) => { let b = str.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; const bin = atob(b), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
const sha = async (text) => new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(text)));
export const hex = async (text) => Array.from(await sha(text), (b) => b.toString(16).padStart(2, '0')).join('');
const random = (n) => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return b64(a); };

/** A new conversation secret: 16 random bytes as 22 link-safe characters. */
export function newKey() { return random(16); }
/** A new seat for one bottle: 12 random bytes as 16 link-safe characters. */
export function newClaim() { return random(12); }

/** The public number of a conversation. Worked out from the key, and useless for reading anything. */
export async function threadId(key) { return b64((await sha('bottle-thread:' + key)).subarray(0, 16)); }
/** What the server keeps of a seat: its fingerprint, never the seat itself. */
export async function claimHash(claim) { return hex('bottle-claim:' + claim); }

async function aes(secret) {
  return subtle().importKey('raw', await sha('bottle-key:' + secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Scramble anything with a secret. */
export async function box(secret, value) {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await aes(secret), new TextEncoder().encode(JSON.stringify(value))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

/** Unscramble it. null if the secret is wrong or it has been tampered with. */
export async function unbox(secret, text) {
  try {
    const raw = unb64(text);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await aes(secret), raw.subarray(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

/** Scramble a note for the server. */
export const seal = (key, note) => box(key, note);
/** Unscramble one. null if it is not ours or has been tampered with. */
export async function unseal(key, body) {
  const v = await unbox(key, body);
  return v && typeof v.m === 'string' ? v : null;       // v.p, if there, is the secret of a picture that came with it
}

/** Ask the server something. Resolves to its answer (which may be null), or undefined if it could not be asked. */
export async function rpc(fn, args, ms = 6000) {
  if (!SERVER.url || !subtle() || typeof fetch !== 'function') return undefined;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(`${SERVER.url}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'content-type': 'application/json', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key },
      body: JSON.stringify(args),
    });
    if (!r.ok) return undefined;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return undefined;                 // no signal, server asleep, blocked: carry on without it
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the notification sender to do something. Never waited on by anything that matters. One more try if it does not answer. */
export async function notify(body, ms = 8000) {
  if (!SERVER.url || typeof fetch !== 'function') return null;
  for (let turn = 0; turn < 2; turn++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), ms);
    try {
      const r = await fetch(`${SERVER.url}/functions/v1/notify`, { method: 'POST', signal: ctl ? ctl.signal : undefined, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) return await r.json();
    } catch { /* try once more */ } finally { clearTimeout(timer); }
    if (turn === 0) await new Promise((res) => setTimeout(res, 1200));
  }
  return null;
}

/**
 * Open a bottle: take its seat in the conversation, or learn where this phone stands.
 *   'claimed' this phone just took the seat      'member' it already belongs
 *   'legacy'  an old conversation, open as before 'none'   the server has never heard of it
 *   'taken'   another phone opened this bottle first: no earlier notes, no replying into it
 *   null      the server could not be asked
 */
export async function open(auth, key, claim) {
  if (!key || !auth || !subtle()) return null;
  try {
    const r = await rpc('bottle_open', { p_auth: auth, p_thread: await threadId(key), p_claim: claim || null });
    return typeof r === 'string' ? r : null;
  } catch { return null; }
}

/**
 * Put a note in its conversation, with the seat its link will carry. note: { m, n, mood, to, id, t }.
 * Resolves { ok, told }: ok if the server took it, and told is a promise of how many of the other side's phones
 * were told by their lanterns (0 if none is lit, or the sender could not be reached). The link never waits on either.
 */
export async function add(auth, key, note, claim) {
  const no = { ok: false, told: Promise.resolve(0) };
  if (!key || !auth || !subtle()) return no;
  try {
    const thread = await threadId(key);
    const r = await rpc('bottle_add', { p_auth: auth, p_thread: thread, p_body: await seal(key, note), p_claim: claim ? await claimHash(claim) : null });
    if (r !== 'ok') return no;
    // A lantern lit for someone (note.k === 'l') says so to the sender, so the other phone can be told what it is. Nothing else about a note is ever passed on.
    return { ok: true, told: notify({ do: 'bottle', auth, thread, ...(note && note.k === 'l' ? { k: 'l' } : {}) }).then((n) => (n && n.sent > 0 ? n.sent : 0), () => 0) };
  } catch { return no; }
}

/**
 * Who else is in a conversation, and can they be told? Resolves { others, lit }: how many other phones have joined,
 * and how many of those have a lantern lit. null if the server could not say (asleep, or it does not know how yet).
 * It tells a member a count and nothing more.
 */
export async function reach(auth, key) {
  if (!key || !auth || !subtle()) return null;
  try {
    const r = await rpc('bottle_reach', { p_auth: auth, p_thread: await threadId(key) }, 4000);
    return r && typeof r.others === 'number' ? { others: r.others, lit: r.lit || 0 } : null;
  } catch { return null; }
}

/**
 * Add a note to a beach that many people are filling (see the "g" links in code.js). Anyone holding the beach's key may add
 * and may read: that is what makes it a card everyone signs. Resolves true if the server took it.
 * Two people adding in the same second are asked to wait, so it tries a few times.
 */
export async function addOpen(key, note) {
  if (!key || !subtle()) return false;
  try {
    const thread = await threadId(key), body = await seal(key, note);
    for (let turn = 0; turn < 4; turn++) {
      if ((await rpc('add_bottle', { p_thread: thread, p_body: body })) === 'ok') return true;
      await new Promise((res) => setTimeout(res, 1300));
    }
    return false;
  } catch { return false; }
}

/** Every note in a conversation this phone belongs to, oldest first. null if the server could not be asked. */
export async function list(auth, key) {
  if (!key || !subtle()) return null;
  try {
    const rows = await rpc('bottle_list', { p_auth: auth || null, p_thread: await threadId(key) });
    if (!Array.isArray(rows)) return null;
    const out = [], seen = new Set();
    for (const row of rows) {
      const v = await unseal(key, row.body);
      if (!v || seen.has(v.id)) continue;
      seen.add(v.id);
      const note = { message: v.m, name: v.n || '', mood: v.mood || 'dusk', to: v.to || '', id: v.id, at: Date.parse(row.created_at) || v.t || 0 };
      if (typeof v.p === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v.p)) note.pic = v.p;
      if (v.k === 'l') note.kind = 'l';             // not a bottle: a lantern lit for the other person, with no words
      out.push(note);
    }
    return out.sort((a, b) => a.at - b.at);
  } catch { return null; }
}
