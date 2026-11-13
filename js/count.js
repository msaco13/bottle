// The counter. It tells Michael how the page is doing on real phones: how far people
// get through the story, and what goes wrong. It is the only way a failure on
// someone else's phone is ever seen.
//
// What is sent: a short word for what happened, a short detail (an error message,
// a frame rate), a device family ("iPhone iOS 18.1 · Safari 18") and the app version.
// What is never sent: the note, a name, a key, a link.
//
// Nothing waits on it and nothing breaks without it.

import { SERVER } from './thread.js';

const has = typeof window !== 'undefined' && typeof document !== 'undefined';
const local = has && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const search = has ? location.search : '';
// Building on this computer counts nothing, unless asked to with ?count. Anything opened with ?dev is marked as a test.
const on = has && (!local || /[?&]count\b/.test(search));
const testing = /[?&]dev\b/.test(search);

/** "iPhone iOS 18.1 · Safari 18": enough to tell phones apart, not enough to tell people apart. */
export function device(u = (has && navigator.userAgent) || '', touch = (has && navigator.maxTouchPoints) || 0) {
  let os = 'Other', br = 'Browser', m;
  if ((m = u.match(/iPhone OS (\d+)[_.](\d+)/))) os = `iPhone iOS ${m[1]}.${m[2]}`;
  else if ((m = u.match(/iPad; CPU OS (\d+)[_.](\d+)/))) os = `iPad iOS ${m[1]}.${m[2]}`;
  else if (/Macintosh/.test(u) && touch > 1) os = 'iPad';
  else if ((m = u.match(/Android (\d+)/))) os = `Android ${m[1]}`;
  else if (/CrOS/.test(u)) os = 'Chromebook';
  else if (/Windows/.test(u)) os = 'Windows';
  else if (/Macintosh/.test(u)) os = 'Mac';
  else if (/Linux/.test(u)) os = 'Linux';
  // apps that open links in their own browser come first: they are the ones that behave differently
  if (/Instagram/.test(u)) br = 'Instagram';
  else if (/FBAN|FBAV|FB_IAB/.test(u)) br = 'Facebook';
  else if (/musical_ly|TikTok|Bytedance/i.test(u)) br = 'TikTok';
  else if (/Snapchat/.test(u)) br = 'Snapchat';
  else if (/WhatsApp/.test(u)) br = 'WhatsApp';
  else if (/\bLine\//.test(u)) br = 'Line';
  else if (/GSA\//.test(u)) br = 'Google app';
  else if ((m = u.match(/CriOS\/(\d+)/))) br = `Chrome ${m[1]}`;
  else if ((m = u.match(/FxiOS\/(\d+)/))) br = `Firefox ${m[1]}`;
  else if ((m = u.match(/(?:EdgiOS|EdgA|Edg)\/(\d+)/))) br = `Edge ${m[1]}`;
  else if ((m = u.match(/SamsungBrowser\/(\d+)/))) br = `Samsung ${m[1]}`;
  else if ((m = u.match(/Firefox\/(\d+)/))) br = `Firefox ${m[1]}`;
  else if (/; wv\)/.test(u)) br = 'in-app browser';
  else if ((m = u.match(/Chrome\/(\d+)/))) br = `Chrome ${m[1]}`;
  else if ((m = u.match(/Version\/(\d+).*Safari/))) br = `Safari ${m[1]}`;
  else if (/AppleWebKit/.test(u) && /Mobile\//.test(u)) br = 'in-app browser';
  return `${os} · ${br}`;
}

const version = () => { try { const s = document.querySelector('script[src*="app.js?v="]'); return s ? s.src.split('v=')[1].slice(0, 12) : 'source'; } catch { return ''; } };
const said = new Set();
let sent = 0;

/** Count something. Each kind is counted once per visit unless again is true. Never throws, never waits. */
export function count(kind, detail = '', again = false) {
  try {
    if (!on || !SERVER.url || typeof fetch !== 'function') return;
    if (!again) { if (said.has(kind)) return; said.add(kind); }
    if (++sent > 40) return;
    fetch(`${SERVER.url}/rest/v1/rpc/log_event`, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key },
      body: JSON.stringify({ p_kind: kind, p_detail: String(detail == null ? '' : detail).slice(0, 300), p_ua: testing ? 'test' : device(), p_ver: version() }),
    }).catch(() => {});
  } catch {}
}

// Anything that breaks while the page is running. At most three a visit: one broken thing can throw every frame.
if (has) {
  let n = 0;
  const where = (f) => String(f || '').split('/').pop().split('?')[0];
  addEventListener('error', (e) => { if (e && e.message && n++ < 3) count('f_error', `${e.message} @ ${where(e.filename)}:${e.lineno || 0}:${e.colno || 0}`, true); });
  addEventListener('unhandledrejection', (e) => { if (n++ < 3) count('f_error', 'promise: ' + String((e && e.reason && (e.reason.message || e.reason)) || ''), true); });
}
