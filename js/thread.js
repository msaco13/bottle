// Conversations. Every bottle carries a secret key shared by the bottles sent back
// and forth after it. With that key a phone can ask the server for the rest of the
// conversation, so an old link shows the newest reply and the earlier notes.
//
// What the server holds is scrambled with the key (AES-GCM) before it leaves the
// phone, and the key only ever travels inside links, after the #. The server sees
// a conversation number and unreadable text. It cannot read a single note.
//
// A bottle never NEEDS the server: the note itself is in the link. If the server is
// slow, asleep or gone, bottles still open and replies still send. Only the shelf of
// earlier notes goes missing.

export const SERVER = {
  url: 'https://segtizidayglyouweszn.supabase.co',     // the Bottle project. It holds nothing else.
  // Its publishable key. It is meant to be public: all it can do is call the two functions below.
  key: 'sb_publishable_2XYYYTBW-AEQN6IaXllIjQ_mQkYc4PP',
};

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (str) => { let b = str.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; const bin = atob(b), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

/** A new conversation secret: 16 random bytes as 22 link-safe characters. */
export function newKey() {
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  return b64(a);
}

/** The public number of a conversation. Worked out from the key, and useless for reading anything. */
export async function threadId(key) {
  const h = await subtle().digest('SHA-256', new TextEncoder().encode('bottle-thread:' + key));
  return b64(new Uint8Array(h).subarray(0, 16));
}

async function aes(key) {
  const raw = await subtle().digest('SHA-256', new TextEncoder().encode('bottle-key:' + key));
  return subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Scramble a note for the server. */
export async function seal(key, note) {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await aes(key), new TextEncoder().encode(JSON.stringify(note))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

/** Unscramble one. null if it is not ours or has been tampered with. */
export async function unseal(key, body) {
  try {
    const raw = unb64(body);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await aes(key), raw.subarray(12));
    const v = JSON.parse(new TextDecoder().decode(pt));
    return v && typeof v.m === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function call(fn, args, ms = 6000) {
  if (!SERVER.url || !subtle()) return null;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(`${SERVER.url}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'content-type': 'application/json', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key },
      body: JSON.stringify(args),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;                 // no signal, server asleep, blocked: carry on without it
  } finally {
    clearTimeout(timer);
  }
}

/** Put a note in its conversation. note: { m, n, mood, to, id, t }. Resolves true if the server took it. */
export async function add(key, note) {
  if (!key || !SERVER.url || !subtle()) return false;
  try {
    const r = await call('add_bottle', { p_thread: await threadId(key), p_body: await seal(key, note) });
    return r != null;
  } catch { return false; }
}

/** Every note in a conversation, oldest first. Empty if there is no server to ask. */
export async function list(key) {
  if (!key || !SERVER.url || !subtle()) return [];
  try {
    const rows = await call('thread_bottles', { p_thread: await threadId(key) });
    if (!Array.isArray(rows)) return [];
    const out = [], seen = new Set();
    for (const row of rows) {
      const v = await unseal(key, row.body);
      if (!v || seen.has(v.id)) continue;
      seen.add(v.id);
      out.push({ message: v.m, name: v.n || '', mood: v.mood || 'dusk', to: v.to || '', id: v.id, at: Date.parse(row.created_at) || v.t || 0 });
    }
    return out.sort((a, b) => a.at - b.at);
  } catch { return []; }
}
