// The lantern: a light on your shore, so a bottle can find you. In plain terms, a
// notification on this phone when someone sends you one.
//
// Android and computers: one tap, the browser asks, done.
// iPhone: Apple only delivers notifications to a page that has been added to the Home
// Screen (iOS 16.4 and later). So on an iPhone the lantern is lit in two steps: add the
// page to the Home Screen, then open it from there and light the lantern in it.

import { SERVER, rpc, notify, unb64 } from './thread.js';
import { token, names } from './shore.js';

const has = typeof window !== 'undefined' && typeof navigator !== 'undefined';
const ua = has ? navigator.userAgent : '';
export const ios = has && (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
/** Opened from the Home Screen, not in a browser tab. */
export const standalone = has && (navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  || /[?&]dev\b.*[?&]standalone\b/.test(location.search));          // ?dev&standalone pretends, for building
/** An app's own little browser (Instagram, Facebook and the like). On an iPhone these cannot add to the Home Screen. */
export const inApp = has && (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|musical_ly|TikTok|Bytedance|GSA\/|; wv\)/i.test(ua) || (ios && !/Safari\//.test(ua)));
const iosVersion = (() => { const m = ua.match(/OS (\d+)[_.](\d+)/); return m ? Number(m[1]) + Number(m[2]) / 10 : (ios ? 17 : 0); })();
const can = has && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// For looking at each state by hand while building: ?dev&lantern=home (or can, lit, safari, blocked).
const pretend = has && /[?&]dev\b/.test(location.search) ? new URLSearchParams(location.search).get('lantern') : null;
const flag = (v) => { try { if (v === undefined) return localStorage.getItem('bottle-lantern') === '1'; if (v) localStorage.setItem('bottle-lantern', '1'); else localStorage.removeItem('bottle-lantern'); } catch {} return !!v; };

/**
 * Where this phone stands:
 *   'lit'      it will be told            'can'    one tap lights it
 *   'home'     iPhone: add to the Home Screen first      'safari'  iPhone, inside another app: open in Safari first
 *   'blocked'  notifications were refused in the browser's settings      'none'  this browser cannot do it
 */
export function standing() {
  if (!has) return 'none';
  if (pretend) return pretend;
  if (can) {
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && flag() ? 'lit' : 'can';
  }
  if (ios && !standalone && iosVersion >= 16.4) return inApp ? 'safari' : 'home';
  return 'none';
}

async function subscribe() {
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const want = unb64(SERVER.push);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // made for another sender's key (it should never be): start again
    const k = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (k && (k.length !== want.length || k.some((b, i) => b !== want[i]))) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
  const j = sub.toJSON();
  const ok = await rpc('push_save', { p_auth: await token(), p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_key: j.keys.auth });
  if (ok !== 'ok') throw new Error('the server did not take it');
  return sub;
}

/** Light it. Must be called straight from a tap. Resolves 'lit', 'refused', or 'failed: why'. */
export async function light() {
  try {
    if (!can) return 'failed: this browser cannot';
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') return 'refused';
    await subscribe();
    flag(true);
    await names();
    // The first notification is the proof that it works. A push service needs a moment to hear about a brand-new subscription,
    // so wait a breath first, and the sender keeps trying for a few seconds if it is told "gone".
    await new Promise((res) => setTimeout(res, 1500));
    const first = async () => { const r = await notify({ do: 'lit', auth: await token() }, 16000); return r && r.sent > 0 ? '' : (r && r.codes && r.codes.length ? r.codes.join(',') : 'no answer'); };
    const why = await first();
    // Sometimes the push service takes longer than that to know the new subscription. The subscription is kept, and
    // real bottles will ring. The proof is simply tried again, quietly, a little later.
    const later = (waits) => { if (waits.length) setTimeout(async () => { if (flag() && await first()) later(waits.slice(1)); }, waits[0]); };
    if (why) later([12000, 40000]);
    return why ? 'lit, first notification late (' + why + ')' : 'lit';
  } catch (e) {
    return 'failed: ' + String((e && e.message) || e).slice(0, 120);
  }
}

/** Put it out. */
export async function douse() {
  try {
    flag(false);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await rpc('push_drop', { p_auth: await token(), p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch {}
}

/** Each visit: if the lantern is lit, make sure the server still knows where to reach this phone. */
export async function tend() {
  try {
    if (standing() !== 'lit') return;
    await subscribe();
    await names();
  } catch {}
}
