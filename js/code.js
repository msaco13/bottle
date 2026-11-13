// The message lives in the link itself, after the #. Nothing is stored anywhere,
// and the part after # is never sent to the web host.
//
// Format: "1." followed by base64url of the UTF-8 bytes of JSON [message, name].
// Plain base64 on purpose (no compression): it opens on every phone, old or new.

export const MAX_MESSAGE = 600;
export const MAX_NAME = 40;

export function encode(message, name = '') {
  const m = String(message).slice(0, MAX_MESSAGE), n = String(name).trim().slice(0, MAX_NAME);
  const bytes = new TextEncoder().encode(JSON.stringify(n ? [m, n] : [m]));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return '1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns { message, name } or null if this is not a bottle. Never throws. */
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
    return { message: v[0].slice(0, MAX_MESSAGE), name: typeof v[1] === 'string' ? v[1].slice(0, MAX_NAME) : '' };
  } catch {
    return null;
  }
}

export function linkFor(base, message, name) {
  return String(base).replace(/[#?].*$/, '') + '#' + encode(message, name);
}
