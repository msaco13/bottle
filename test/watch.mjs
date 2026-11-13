// The watch. Run by hand (npm run watch) or twice a day by GitHub (ops/watch.yml).
// It fails, loudly, when something a real person would notice is wrong:
//   - the live page or its app file does not load
//   - a link from the first version no longer reads the same in the live app
//   - the Bottle database does not answer (paused, or gone)
//   - people's phones reported three or more problems in the last 24 hours
// When GitHub runs it and it fails, GitHub emails the owner of the repo.
// Each run also touches the database, which keeps a free project from being paused for being idle.

import { SERVER } from '../js/thread.js';

const SITE = process.env.SITE || 'https://msaco13.github.io/bottle/';
const LIMIT = Number(process.env.LIMIT || 3);
const bad = [];
const note = (ok, what) => { console.log((ok ? 'ok    ' : 'WRONG ') + what); if (!ok) bad.push(what); };
const get = async (url) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000); try { return await fetch(url, { signal: c.signal, cache: 'no-store' }); } finally { clearTimeout(t); } };
const rpc = async (fn, args) => {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(`${SERVER.url}/rest/v1/rpc/${fn}`, { method: 'POST', signal: c.signal, headers: { 'content-type': 'application/json', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`${fn} answered ${r.status}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } finally { clearTimeout(t); }
};

// 1. the page and its app file
let app = '';
try {
  const page = await get(SITE + '?watch=' + Date.now());
  const html = await page.text();
  const m = html.match(/app\.js\?v=(\w+)/);
  note(page.ok && !!m, `the live page loads (${page.status})` + (m ? `, version ${m[1]}` : ', but names no app file'));
  if (m) {
    const r = await get(SITE + 'app.js?v=' + m[1]);
    app = await r.text();
    note(r.ok && app.length > 40000, `the app file loads (${r.status}, ${Math.round(app.length / 1024)} KB)`);
  }
} catch (e) { note(false, 'the live page could not be reached: ' + e.message); }

// 2. a link from the very first version still reads the same, in the code that is live right now
if (app) {
  try {
    const start = app.indexOf('__m.code = (function () {'), end = app.indexOf('\n// ----', start);
    if (start < 0 || end < 0) throw new Error('the app file is not laid out as expected');
    const code = new Function('return ' + app.slice(start + '__m.code = '.length, end).trim().replace(/;$/, ''))();
    const b = code.decode('#1.WyJIYXBweSBiaXJ0aGRheSwgRGFkLlxuU2FtZSBiZW5jaCwgU3VuZGF5IGF0IDk_IiwiTWlrZSJd');
    note(!!b && b.message === 'Happy birthday, Dad.\nSame bench, Sunday at 9?' && b.name === 'Mike', 'a link from the first version still opens in the live app');
  } catch (e) { note(false, 'the live app could not read an old link: ' + e.message); }
}

// 3. the database answers
try {
  const rows = await rpc('thread_bottles', { p_thread: 'watchwatchwatchwatch00' });
  note(Array.isArray(rows), 'the Bottle database answers');
  await rpc('log_event', { p_kind: 'watch', p_detail: '', p_ua: 'watch', p_ver: '' });
} catch (e) { note(false, 'the Bottle database did not answer (it may be paused: open the project named bottle in Supabase and press Restore): ' + e.message); }

// 4. what phones reported in the last 24 hours
try {
  const s = await rpc('event_stats', { p_days: 1, p_test: false });
  const d = s.last24 || {};
  const fails = Object.entries(d).filter(([k]) => k.startsWith('f_'));
  const n = fails.reduce((a, [, v]) => a + v, 0);
  console.log(`      last 24 hours: ${d.s_open || 0} opened, ${d.s_read || 0} read, ${d.made || 0} made, ${n} problems`);
  note(n < LIMIT, n < LIMIT ? `fewer than ${LIMIT} problems reported by phones` : `${n} problems reported by phones in the last 24 hours: ${fails.map(([k, v]) => `${k} x${v}`).join(', ')}. See ${SITE}stats.html`);
  for (const r of (s.recent || []).slice(0, 5)) console.log(`      ${r.at.slice(0, 16)}  ${r.kind}  ${r.ua}  ${r.detail}`);
} catch (e) { note(false, 'the counter could not be read: ' + e.message); }

if (process.env.DRILL) { note(false, 'this is a drill: nothing is wrong, the watch was asked to fail to prove the warning reaches you'); }

if (bad.length) { console.error('\nThe bottle needs a look:\n- ' + bad.join('\n- ')); process.exit(1); }
console.log('\nAll well.');
