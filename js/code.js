// The message lives in the link itself, after the #. Nothing has to be stored anywhere
// for a bottle to open, and the part after # is never sent to the web host.
//
// Format: "1." followed by base64url of the UTF-8 bytes of a JSON list:
//   [message]                              the first bottles
//   [message, name]
//   [message, name, mood, to, key]         added later, all optional:
//        mood  "n" night, "a" dawn. Missing means dusk.
//        to    who it is addressed to (set when someone sends one back)
//        key   the secret of the conversation this bottle belongs to (see thread.js)
//   [message, name, mood, to, key, claim]  added later still, optional:
//        claim the one seat this bottle carries: the first phone to open it joins the conversation
// Plain base64 on purpose (no compression): it opens on every phone, old or new.
//
// PROMISE: every link ever made must keep opening. New things may only be added
// to the END of the list, and must be optional. test/code.test.mjs holds real
// old links and fails if one of them ever reads differently.

export const MAX_MESSAGE = 600;
export const MAX_NAME = 40;
export const MOODS = { dusk: '', night: 'n', dawn: 'a' };
const MOOD_OF = { n: 'night', a: 'dawn' };

/** bottle: { message, name, mood, to, key, claim } */
export function encode(message, name = '', mood = 'dusk', to = '', key = '', claim = '') {
  const list = [
    String(message).slice(0, MAX_MESSAGE),
    String(name || '').trim().slice(0, MAX_NAME),
    MOODS[mood] || '',
    String(to || '').trim().slice(0, MAX_NAME),
    /^[A-Za-z0-9_-]{16,32}$/.test(key || '') ? key : '',
    /^[A-Za-z0-9_-]{8,32}$/.test(claim || '') ? claim : '',
  ];
  while (list.length > 1 && list[list.length - 1] === '') list.pop();   // old-style links stay exactly as they were
  const bytes = new TextEncoder().encode(JSON.stringify(list));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return '1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns { message, name, mood, to, key, claim } or null if this is not a bottle. Never throws. */
export function decode(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '');
    // Some apps wrap or escape links. Be forgiving about what comes back.
    try { s = decodeURIComponent(s); } catch {}
    s = s.replace(/\s+/g, '');
    if (!s.startsWith('1.')) return null;
    let b = s.slice(2).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    while (b.length % 4) b += '=';
    const bin = atob(b), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !v[0].trim()) return null;
    const str = (x) => (typeof x === 'string' ? x : '');
    return {
      message: v[0].slice(0, MAX_MESSAGE),
      name: str(v[1]).slice(0, MAX_NAME),
      mood: MOOD_OF[v[2]] || 'dusk',
      to: str(v[3]).slice(0, MAX_NAME),
      key: /^[A-Za-z0-9_-]{16,32}$/.test(str(v[4])) ? v[4] : '',
      claim: /^[A-Za-z0-9_-]{8,32}$/.test(str(v[5])) ? v[5] : '',
    };
  } catch {
    return null;
  }
}

export function linkFor(base, b) {
  return String(base).replace(/[#?].*$/, '') + '#' + encode(b.message, b.name, b.mood, b.to, b.key, b.claim);
}
