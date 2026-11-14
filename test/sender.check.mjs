// By hand, before and after changing or redeploying the notification sender (ops/notify/): node test/sender.check.mjs
// It leaves nothing behind: the test address it saves is dropped again. A healthy sender answers: true, ok, codes [410] or [404], sent 0.
// From a machine behind a proxy: NODE_USE_ENV_PROXY=1 node test/sender.check.mjs
// Is the notification sender whole? Asks for its public key, and has it send to an address Google's push service has never heard of:
// a clear answer from Google (not 0, which is what a broken sender gives) means the message was built, signed and scrambled properly.
import { rpc, notify, b64, SERVER } from '../js/thread.js';
const person = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return b64(a); };
const me = person(), lamp = 'https://fcm.googleapis.com/fcm/send/sender-check-' + person();
const key = await notify({ do: 'key' });
console.log('public key matches the page:', key && key.key === SERVER.push);
// a real-looking browser key, so the scrambling has something to work with
const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = b64(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
console.log('saved a test address:', await rpc('push_save', { p_auth: me, p_endpoint: lamp, p_p256dh: p256dh, p_key: person() }));
const r = await notify({ do: 'lit', auth: me }, 30000);
console.log('sender answered:', JSON.stringify(r));
await rpc('push_drop', { p_auth: me, p_endpoint: lamp });
console.log('stranger cannot ring a conversation:', JSON.stringify(await notify({ do: 'bottle', auth: me, thread: person(), k: 'l' })));
