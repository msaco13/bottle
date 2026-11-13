// Message in a bottle. One page, two faces:
//   a link with a message after the #  ->  the shore, and a bottle to open
//   no message                         ->  the writing desk
// After a note is read, sending one back is one tap: the desk opens already addressed.

import { decode, linkFor, MAX_MESSAGE } from './code.js';
import { Scene, swash, DRY_LINE, MOOD } from './scene.js';
import { Story } from './story.js';
import { Shore } from './audio.js';
import { newKey, newClaim, add, list, open } from './thread.js';
import { myName, setName, threads, isMine, wrote, remember, kept, keep, token, pull, carry, arrive, threadByNumber } from './shore.js';
import { standing, light, douse, tend, ios, standalone } from './lantern.js';
import { count } from './count.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const bottle = decode(location.hash) || decode(qs.get('b'));
const hop = /^#n\.([A-Za-z0-9_-]{22})$/.exec(location.hash);          // a notification was tapped: it names a conversation
const stage = $('stage');
const isIOS = ios;
const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;

addEventListener('hashchange', () => location.reload());
if (bottle) document.documentElement.classList.add('reading');
// Off an iPhone, an installed copy should start at the writing desk, not at whatever bottle was open when it was installed.
if (!ios) { const m = document.querySelector('link[rel="manifest"]'); if (m) m.href = 'manifest-app.webmanifest'; }

// Seats are only taken once a person has touched the page. A link preview or a robot loads the page and never does.
let human = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
const waiting = [];
const touched = (fn) => { if (human) fn(); else waiting.push(fn); };
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, () => { if (human) return; human = true; for (const f of waiting.splice(0)) f(); }, { capture: true, passive: true });
}

// ---------------------------------------------------------------- the note itself

let shown = bottle;          // the note on the paper right now (the one from the link, or an earlier one from the shelf)
let seat = '';               // where this phone stands in the link's conversation, once the server has said (see thread.js)
let asked = false;
const same = (a, b) => a && b && a.message === b.message && (a.name || '') === (b.name || '');

/** The notes of a conversation: what the server says now, joined with what this phone has already seen. */
async function notesFor(key) {
  const fresh = await list(await token(), key);
  return fresh ? keep(key, fresh) : kept(key);        // if the server is asleep, the history is still here
}

/** Put a sky over the shore: 'dusk', 'night' or 'dawn'. */
function sky(mood) { if (scene) scene.mood = MOOD[mood] || 0; document.documentElement.dataset.mood = MOOD[mood] ? mood : 'dusk'; }

function showLetter(instant, note) {
  if (note) shown = note;
  const b = shown;
  sky(b.mood);
  const letter = $('letter'), paper = $('paper');
  // replay the unrolling when a different note is put on the paper
  letter.classList.remove('show'); void paper.offsetWidth;
  $('dear').textContent = b.to ? 'For ' + b.to : '';
  const words = $('words');
  words.textContent = '';
  // Each word arrives a moment after the last, as if it were being written.
  const parts = b.message.split(/(\s+)/);
  const per = Math.min(0.09, 3.6 / Math.max(1, parts.length));
  parts.forEach((p, i) => {
    if (/^\s+$/.test(p)) { words.appendChild(document.createTextNode(p)); return; }
    const s = document.createElement('span');
    s.textContent = p;
    s.style.transform = `rotate(${((Math.random() - 0.5) * 2.6).toFixed(2)}deg) translateY(${((Math.random() - 0.5) * 1.8).toFixed(1)}px)`;
    s.style.animationDelay = instant ? '0s' : (1.3 + i * per).toFixed(2) + 's';
    words.appendChild(s);
  });
  const sign = $('sign');
  sign.textContent = b.name ? '~ ' + b.name : '';
  const seal = $('seal');
  seal.textContent = b.name ? Array.from(b.name.trim())[0].toUpperCase() : '';
  seal.style.display = b.name ? '' : 'none';
  seal.style.animationDelay = instant ? '0s' : (2.0 + parts.length * per).toFixed(2) + 's';
  sign.style.animationDelay = instant ? '0s' : (1.6 + parts.length * per).toFixed(2) + 's';
  // Sending one back is the obvious next thing, and it is already addressed.
  address(b);
  $('fresh').onclick = () => desk({});
  letter.classList.add('show');
  $('hint').classList.remove('show'); $('skip').classList.remove('show'); $('finger').style.opacity = 0;
  $('after').classList.remove('show');
  clearTimeout(showLetter.t);
  showLetter.t = setTimeout(() => $('after').classList.add('show'), instant ? 300 : (2.4 + parts.length * per) * 1000);
  if (!note) touched(shelf);
}

/** Point the reply button at the other person in this note, and keep the conversation on this phone. */
function address(b) {
  const mine = isMine(b);
  const other = mine ? b.to : b.name;
  const key = seat === 'taken' ? '' : (bottle.key || b.key || '');       // a taken seat: the reply starts a conversation of its own
  $('reply').textContent = (mine ? 'Send another' : 'Send one back') + (other ? ' to ' + other : '');
  $('reply').onclick = () => desk({ to: other || '', key });
  if (asked && key) remember(key, other, b.at || 0);
}

// The earlier notes of this conversation. Nothing here is needed to read the note or to reply.
async function shelf() {
  const el = $('shelf');
  el.textContent = '';
  const old = $('newest'); if (old) old.remove();
  $('reply').classList.remove('ghost');
  $('sealNote').textContent = '';
  if (!bottle || !bottle.key) return;
  // Break the seal: take this bottle's seat in its conversation, or find that another phone already has.
  seat = await open(await token(), bottle.key, bottle.claim);
  asked = true;
  count('seal', seat || 'the server did not answer');
  if (seat === 'taken') {
    $('sealNote').textContent = 'This bottle was opened on another phone first, so the notes before it stay there. You can still send one back.';
    if (shown === bottle) address(bottle);
    return;
  }
  if (shown === bottle) address(bottle);
  const all = await notesFor(bottle.key);
  if (!all.length) return;
  const here = all.find((n) => same(n, bottle));
  if (here) { bottle.id = here.id; bottle.at = here.at; if (shown === bottle) address(bottle); }      // now it is known for certain whose note this is
  const newer = here ? all.filter((n) => n.at > here.at && !isMine(n)) : [];      // your own notes are not news
  const others = all.filter((n) => !same(n, bottle));
  if (!others.length) return;
  if (newer.length) {
    const go = document.createElement('button');
    go.className = 'btn';
    go.id = 'newest';
    const from = newer[newer.length - 1].name;
    go.textContent = from ? `Read the new bottle from ${from}` : 'Read the newest bottle';
    go.onclick = () => { showLetter(false, newer[newer.length - 1]); go.remove(); $('reply').classList.remove('ghost'); head.textContent = 'Bottles between you (' + all.length + ')'; for (const c of row.children) c.classList.toggle('on', c === row.firstChild); };
    // A new bottle is the first thing to do, so it goes above everything else.
    $('after').insertBefore(go, $('reply'));
    $('reply').classList.add('ghost');
  }
  const head = document.createElement('div');
  head.className = 'shelfHead';
  head.textContent = newer.length ? (newer.length === 1 ? 'A newer bottle has washed up since this one' : `${newer.length} newer bottles have washed up since this one`) : `Bottles between you (${all.length})`;
  el.appendChild(head);
  const row = document.createElement('div');
  row.className = 'shelfRow';
  const when = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
  for (const n of [...all].reverse()) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (same(n, shown) ? ' on' : '') + (newer.includes(n) ? ' new' : '');
    chip.textContent = `${n.name || 'A note'} · ${when(n.at)}`;
    chip.onclick = () => { showLetter(false, n); for (const c of row.children) c.classList.toggle('on', c === chip); };
    row.appendChild(chip);
  }
  el.appendChild(row);
}

// ---------------------------------------------------------------- the lantern (see lantern.js)

let lanternSaid = '', carriedLost = false, homeBack = '';

/** Draw the lantern's line wherever it belongs: under a note, under a new bottle, and on the desk. */
function lantern() {
  const st = standing();
  if (scene) scene.lamp = st === 'lit' ? 1 : 0;
  for (const id of ['lanternA', 'lanternB', 'lanternC']) {
    const el = $(id);
    if (!el) continue;
    el.textContent = '';
    if (st === 'none') continue;
    if (id === 'lanternC' && !(st === 'lit' || standalone || threads().length)) continue;      // the desk only mentions it to people it could help
    // In the Home Screen app, lighting it is the first thing to do, so it goes at the very top.
    if (id === 'lanternC') { if (standalone && st !== 'lit') $('desk').insertBefore(el, $('desk').firstChild); else $('make').after(el); }
    const say = (t) => { const p = document.createElement('p'); p.className = 'lanternSay'; p.textContent = t; el.appendChild(p); };
    const btn = (t, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = t; b.onclick = fn; el.appendChild(b); return b; };
    if (id === 'lanternC' && carriedLost && !threads().length) say('Your bottles did not come across. In Safari, open any bottle, tap "Light a lantern" and add it to the Home Screen again.');
    if (st === 'lit') {
      say('Your lantern is lit. This phone will tell you when a bottle washes up.');
      btn('Put the lantern out', async () => { await douse(); count('lantern', 'put out', true); lantern(); }, 'link');
    } else if (st === 'blocked') {
      // They said no to notifications. Do not bring it up again, except on the desk where it explains why nothing arrives.
      if (id === 'lanternC') say('Notifications are switched off for this page in your browser settings, so a bottle cannot announce itself here.');
    } else if (st === 'safari') {
      say('To be told when a bottle arrives, open this page in Safari and light a lantern there.');
    } else if (st === 'home') {
      btn('Light a lantern, so a bottle can find you', homeCard, 'btn ghost');
    } else {
      btn(standalone ? 'Light the lantern' : 'Light a lantern, so a bottle can find you', async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'Lighting it';
        const how = await light();                    // the browser asks its one question here
        count('lantern', how, true);
        lanternSaid = how === 'lit' ? '' : how === 'refused' ? 'No lantern, then. You can light one any time.' : how.startsWith('lit') ? '' : 'The lantern would not light (' + how.replace('failed: ', '') + '). Try again in a minute.';
        lantern();
      }, standalone ? 'btn' : 'btn ghost');
      if (lanternSaid) say(lanternSaid);
    }
  }
}

/** iPhone: the three taps that put the page on the Home Screen, with the shore packed to come along. */
async function homeCard() {
  count('lantern', 'iphone: shown the home screen steps', true);
  $('homecard').classList.add('show');
  $('homeState').textContent = 'Packing your bottles to come with you.';
  const code = await carry();
  if (!$('homecard').classList.contains('show')) return;
  if (code) {
    // The Home Screen app starts at whatever address is showing when it is added. So the address becomes the parcel's code, until this card is closed.
    if (!homeBack) homeBack = location.href;
    try { history.replaceState(null, '', location.pathname + '?i=' + code); } catch {}
    $('homeState').textContent = 'Packed. Your bottles will come with you.';
  } else {
    $('homeState').textContent = 'The server could not be reached just now, so your bottles would not come along. Close this and try again in a minute.';
  }
}
$('homeClose').onclick = () => {
  $('homecard').classList.remove('show');
  if (homeBack) { try { history.replaceState(null, '', homeBack); } catch {} homeBack = ''; }
};

// ---------------------------------------------------------------- the writing desk

let deskReady = false, deskCtx = {}, madeLink = '', madeTo = '', deskMood = 'dusk';

// Your bottles: every conversation this phone has been part of, newest news first. One tap and that bottle washes up.
async function inbox() {
  const el = $('inbox');
  el.textContent = '';
  const mine = threads().slice(0, 6);
  if (!mine.length) return;
  const turn = inbox.turn = (inbox.turn || 0) + 1;
  const found = (await Promise.all(mine.map(async (th) => {
    const all = await notesFor(th.k);
    if (!all.length) return null;
    const theirs = all.filter((n) => !isMine(n));
    const fresh = theirs.filter((n) => n.at > (th.s || 0));
    const last = all[all.length - 1];
    return { th, isNew: fresh.length > 0, open: fresh.length ? fresh[fresh.length - 1] : last, at: last.at, count: all.length,
      who: th.w || (theirs.length ? theirs[theirs.length - 1].name : '') || all[0].to || 'Someone' };
  }))).filter(Boolean);
  if (turn !== inbox.turn || !found.length) return;
  el.textContent = '';
  found.sort((a, b) => (b.isNew - a.isNew) || (b.at - a.at));
  // News goes where it cannot be missed: above the desk. Otherwise the list waits quietly underneath.
  const news = found[0].isNew;
  el.classList.toggle('top', news);
  if (news) $('desk').insertBefore(el, $('deskTitle')); else $('desk').appendChild(el);
  const head = document.createElement('div');
  head.className = 'inboxHead';
  head.textContent = 'Your bottles';
  el.appendChild(head);
  const when = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
  for (const f of found) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row' + (f.isNew ? ' new' : '');
    const who = document.createElement('span'); who.className = 'rowWho'; who.textContent = f.who;
    const sub = document.createElement('span'); sub.className = 'rowSub';
    sub.textContent = f.isNew ? 'A new bottle washed up. Tap to open it' : `${f.count === 1 ? '1 bottle' : f.count + ' bottles'} · ${when(f.at)}`;
    row.append(who, sub);
    row.onclick = () => { location.href = linkFor(location.origin + location.pathname, { message: f.open.message, name: f.open.name, mood: f.open.mood, to: f.open.to, key: f.th.k }); };
    el.appendChild(row);
  }
}

/** A notification was tapped. Bring in the newest bottle of the conversation it named. */
async function follow(id) {
  const home = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch {} };
  let th = await threadByNumber(id);
  if (!th) { await pull(); th = await threadByNumber(id); }
  if (!th) return home();
  const all = await notesFor(th.k);
  const theirs = all.filter((n) => !isMine(n));
  const pick = theirs.filter((n) => n.at > (th.s || 0)).pop() || theirs.pop() || all.pop();
  if (!pick) return home();
  count('followed', 'a notification was tapped');
  location.replace(linkFor(location.origin + location.pathname, { message: pick.message, name: pick.name, mood: pick.mood, to: pick.to, key: th.k }));
}

/** ctx: { to, key } when sending one back. Empty for a fresh bottle. */
function desk(ctx) {
  deskCtx = ctx || {};
  const msg = $('msg'), who = $('who'), compose = $('compose');
  $('letter').classList.remove('show');
  compose.classList.remove('done');
  compose.classList.add('show');
  compose.scrollTop = 0;
  $('toChip').textContent = deskCtx.to ? 'To ' + deskCtx.to : '';
  $('forRow').style.display = deskCtx.to ? 'none' : '';
  $('forWho').value = '';
  if (deskCtx.to) $('inbox').textContent = ''; else inbox();
  $('deskTitle').textContent = deskCtx.to ? 'Send one back' : 'Message in a bottle';
  $('deskLede').textContent = deskCtx.to
    ? `Write your note. You get a link to text to ${deskCtx.to}, and your bottle washes up on their shore.`
    : 'Write a note. You get one link. Text it to someone, and when they tap it a bottle washes up on a beach with your words inside.';
  msg.value = '';
  try { who.value = myName(); } catch {}
  const choose = (m) => { deskMood = m; sky(m); for (const c of $('moods').children) c.classList.toggle('on', c.dataset.mood === m); };
  choose((shown && shown.mood) || 'dusk');
  const tally = () => { $('left').textContent = String(MAX_MESSAGE - msg.value.length); };
  tally();
  lantern();
  if (deskCtx.to) setTimeout(() => msg.focus(), 350);
  if (deskReady) return;
  deskReady = true;
  msg.addEventListener('input', tally);

  const share = async () => {
    try { await navigator.share({ title: 'A message in a bottle', text: madeTo ? `${madeTo}, a bottle washed up for you.` : 'Something washed ashore for you.', url: madeLink }); count('share', 'sent', true); return true; }
    catch (e) { count('share', (e && e.name) === 'AbortError' ? 'closed without sending' : 'failed: ' + ((e && e.name) || ''), true); return false; }
  };
  $('desk').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!msg.value.trim()) { msg.focus(); return; }
    const name = who.value.trim();
    setName(name);
    let key = deskCtx.key || '', claim = '';
    try { if (!key) key = newKey(); claim = newClaim(); } catch {}
    // The link carries the note, the conversation's key, and one seat: whoever opens it first is the one it was for.
    const b = { message: msg.value.trim(), name, mood: deskMood, to: deskCtx.to || $('forWho').value.trim(), key, claim };
    madeTo = b.to;
    const link = madeLink = linkFor(location.origin + location.pathname, b);
    $('link').value = madeLink;
    $('try').href = madeLink;
    $('share').style.display = navigator.share ? '' : 'none';
    $('madeLede').textContent = b.to
      ? `Text this link to ${b.to}. The note travels inside the link itself.`
      : 'Send this link to one person. The note travels inside the link itself.';
    compose.classList.add('done');
    compose.scrollTop = 0;
    lantern();
    // The share sheet opens straight away, while this is still the same tap.
    count('made', `${deskMood} ${deskCtx.key ? 'reply' : 'new'} ${b.message.length} letters`, true);
    if (navigator.share) share(); else count('share', 'no share sheet on this browser', true);
    // Keep a scrambled copy with the conversation, so either of you can find it again. Not needed for the link to work.
    const id = Math.random().toString(36).slice(2, 12);
    wrote(id);
    remember(key, b.to, 0);
    keep(key, [{ message: b.message, name: b.name, mood: b.mood, to: b.to, id, at: Date.now() }]);
    token().then((auth) => add(auth, key, { m: b.message, n: b.name, mood: b.mood, to: b.to, id, t: Date.now() }, claim)).then((ok) => {
      // Only promised once the server has really taken it.
      if (!ok) count('f_save', 'the server did not take the note', true);
      if (ok && madeLink === link) $('madeLede').textContent += ` When ${b.to ? b.to + ' sends' : 'they send'} one back, it will also be waiting for you on this page.`;
    });
  });
  for (const c of $('moods').children) c.addEventListener('click', () => choose(c.dataset.mood));
  $('link').addEventListener('focus', () => $('link').select());
  $('copy').addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(madeLink); ok = true; } catch {
      try { $('link').select(); ok = document.execCommand('copy'); } catch {}
    }
    count('copy', ok ? 'copied' : 'could not copy', true);
    $('copy').textContent = ok ? 'Copied. Now paste it in a text.' : 'Press and hold the link above to copy it';
    setTimeout(() => { $('copy').textContent = 'Copy the link'; }, 3500);
  });
  $('share').addEventListener('click', share);
  $('again').addEventListener('click', () => desk({}));
  $('backToNote').addEventListener('click', () => { compose.classList.remove('show'); if (bottle) { sky(shown.mood); $('letter').classList.add('show'); } });
}

// What happens once, as the page opens: bring the shore over (Home Screen app), follow a notification, catch up with the server.
async function arriveAndCatchUp() {
  const code = qs.get('i');
  if (code && standalone) {
    const how = await arrive(code);
    if (how !== 'here') count('carried', how);
    carriedLost = how === 'lost';
    if (!$('who').value) $('who').value = myName();
    if (!bottle && !deskCtx.to) { inbox(); lantern(); }
  }
  if (hop) return follow(hop[1]);
  if (await pull() && !bottle && !deskCtx.to) { inbox(); lantern(); }
  tend();
}

// ---------------------------------------------------------------- the shore

let scene = null;
try { scene = qs.has('nogl') ? null : new Scene($('gl')); } catch (e) { scene = null; count('f_nogl', String((e && e.message) || 'no 3D').replace(/\s+/g, ' ')); }
if (!scene) count('f_nogl', 'no 3D was asked for');      // only reached with ?nogl: a real failure was counted above, and each kind counts once
count(bottle ? 's_open' : 'desk', bottle ? bottle.mood + (bottle.key ? '' : ' old link') : '');   // ?nogl pretends there is no 3D, to test the fallback
if (bottle) sky(bottle.mood);
lantern();
arriveAndCatchUp();
const ready = () => { window.__bottleReady = true; const p = $('plain'); if (p) p.className = ''; };

if (!scene) {
  // No 3D on this device. The words still get through.
  ready();
  $('veil').classList.add('up');
  if (bottle) showLetter(true); else desk({});
} else {
  run();
}

function run() {
  const story = new Story(scene);
  const audio = new Shore();
  const reading = !!bottle;
  if (!reading) desk({});
  let W = 0, H = 0, quality = 1;

  function screenAngle() {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    return ((a % 360) + 360) % 360;
  }
  function layout(force) {
    let w = innerWidth, h = innerHeight, ang = 0;
    if (phone && reading) {
      // The shore stays put if the phone is turned on its side: tilt is part of the story.
      ang = screenAngle();
      if (ang === 90 || ang === 270) { const t = w; w = h; h = t; } else ang = 0;
    }
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.style.transform = `translate(-50%, -50%) rotate(${-ang}deg)`;
    if (!force && w === W && h === H) return;
    W = w; H = h;
    // Wide screens see more beach, not a stretched one.
    scene.cam.fov = (w > h ? 46 : 62) * Math.PI / 180;
    // a phone gets at most about 1.2 million pixels to fill each frame; that is plenty at arm's length
    scene.resize(W, H, Math.max(0.5, Math.min(devicePixelRatio || 1, 2, Math.sqrt((phone ? 1.2e6 : 2.2e6) / (W * H))) * quality));
  }
  let lt = 0;
  const relayout = () => { clearTimeout(lt); lt = setTimeout(() => layout(false), 120); };
  addEventListener('resize', relayout);
  addEventListener('orientationchange', relayout);
  layout(true);

  // ---- tilt and shake. Asked for on the first touch, as part of "Touch the water".
  let sign = isIOS ? 1 : -1, corr = 0, orient = null, soft = [0, 0, 0];
  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (orient && a.z != null) {
      // iOS and Android disagree about the sign. Check it against the compass-style sensor.
      const d = (a.x * orient[0] + a.y * orient[1] + a.z * orient[2]) / 9.81 * sign;
      corr += (d - corr) * 0.05;
      if (corr < -0.5) { sign = -sign; corr = 0.5; }
    }
    story.tilt(a.x * sign / 9.81, -a.y * sign / 9.81);
    // A shake is whatever is left once the slow pull of gravity is taken away.
    const u = e.acceleration;
    let mag;
    if (u && u.x != null) mag = Math.hypot(u.x, u.y, u.z || 0);
    else { for (let k = 0; k < 3; k++) soft[k] += ([a.x, a.y, a.z || 0][k] - soft[k]) * 0.1; mag = Math.hypot(a.x - soft[0], a.y - soft[1], (a.z || 0) - soft[2]); }
    story.shake(mag);
  }
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    orient = [Math.sin(g) * Math.cos(b), -Math.sin(b), -Math.cos(g) * Math.cos(b)];
  }
  async function askMotion() {
    try {
      const DM = window.DeviceMotionEvent;
      if (!DM) { count('motion', 'none on this device'); return; }
      if (typeof DM.requestPermission === 'function') {
        const res = await DM.requestPermission();
        count('motion', 'asked: ' + res);
        if (res !== 'granted') return;                 // fine: everything still works by touch
      } else count('motion', 'no need to ask');
      addEventListener('devicemotion', onMotion);
      addEventListener('deviceorientation', onOrient);
    } catch (e) { count('motion', 'error: ' + ((e && e.message) || '')); }
  }

  // ---- touch
  const cv = $('gl');
  const at = (e) => [e.offsetX, e.offsetY];
  if (reading) {
    // The first touch has to be a real click for iPhone to allow sound and motion.
    cv.addEventListener('click', (e) => {
      if (story.state !== 'arrive') return;
      count('s_touch');
      audio.unlock();
      askMotion();
      if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
      const [x, y] = at(e);
      story.down(x, y); story.up();
    });
    cv.addEventListener('pointerdown', (e) => {
      if (story.state === 'arrive') return;
      try { cv.setPointerCapture(e.pointerId); } catch {}
      const [x, y] = at(e); story.down(x, y);
    });
    cv.addEventListener('pointermove', (e) => { if (story.ptr) { const [x, y] = at(e); story.move(x, y); } });
    const up = () => { if (story.state !== 'arrive') story.up(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    $('skip').addEventListener('click', () => { count('skip', 'stuck at: ' + story.state); audio.unlock(); audio.play('reveal'); story.state = 'reading'; story.seen = true; story.lift = 1; showLetter(false); });
  }
  addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (audio.ctx && document.visibilityState === 'visible') audio.ctx.resume(); });

  // ---- one frame
  const hintEl = $('hint'), finger = $('finger');
  const look = [0, 0], rest = [0, 1];
  let camY = reading ? 0.44 : 0.1;
  let hintText = null, cueT = 0, slow = 0, last = performance.now(), started = false;
  let was = '', fpsN = 0, fpsT = 0, tilted = false;
  const speed = () => `${fpsT > 0 ? Math.round(fpsN / fpsT) : 0} fps, ${Math.round(W * scene.scale)}x${Math.round(H * scene.scale)}, quality ${quality.toFixed(2)}`;
  $('gl').addEventListener('webglcontextlost', () => count('f_ctx', 'the phone took the 3D away at: ' + story.state));

  // The cork comes out with a little spray of sea water.
  function spray() {
    try {
      const p = story.onScreen([0, 0.5, 0]);
      if (!p || !stage.animate) return;
      const night = scene.mood === 1;
      for (let i = 0; i < 14; i++) {
        const d = document.createElement('i');
        d.className = 'drop';
        const size = 3 + Math.random() * 5;
        d.style.cssText = `left:${p.x}px;top:${p.y}px;width:${size}px;height:${size}px;` + (night ? 'background:#9ff3ff;box-shadow:0 0 8px #4fe3f5;' : '');
        stage.appendChild(d);
        const dx = (Math.random() - 0.5) * 150, up = -(40 + Math.random() * 90);
        const a = d.animate([
          { transform: 'translate(-50%, -50%)', opacity: 0.95 },
          { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${up}px))`, opacity: 0.9, offset: 0.4 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${up * 0.2 + 70}px)) scale(0.5)`, opacity: 0 },
        ], { duration: 650 + Math.random() * 350, easing: 'cubic-bezier(0.2, 0.6, 0.5, 1)', fill: 'forwards' });
        a.onfinish = () => d.remove();
        setTimeout(() => d.remove(), 1500);          // and if the animation never reports back
      }
    } catch {}
  }

  function frame(dt) {
    if (reading) story.update(dt); else story.t += dt;
    for (const ev of story.events) {
      if (ev === 'reveal') showLetter(false);
      if (ev === 'pop') spray();
      const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (ev === 'pop' && navigator.vibrate && touched) navigator.vibrate([18, 30, 40]);
      if ((ev === 'grab' || ev === 'clink') && navigator.vibrate && touched) navigator.vibrate(10);
      audio.play(ev);
    }
    story.events.length = 0;
    if (reading && story.state !== was) {
      was = story.state;
      if (was === 'held') count('s_held', speed());
      if (was === 'open') count('s_cork', story.motion ? 'tilt on' : 'touch only');
      if (was === 'reading') count('s_read', speed());
    }
    if (story.motion && !tilted) { tilted = true; count('motion_live'); }
    const t = story.t;
    audio.surf((swash(0, t + 0.05) - swash(0, t)) / 0.05, (swash(0, t) + 0.72) / 1.6);

    if (reading) {
      const h = story.hint();
      if (h !== hintText) { hintText = h; hintEl.textContent = h; hintEl.classList.toggle('show', !!h); hintEl.classList.toggle('big', story.state === 'arrive'); }
      // the ghost finger
      const cue = story.cue();
      if (cue) {
        cueT = (cueT + dt / 1.9) % 1;
        const e = Math.min(1, cueT / 0.7), k = e * e * (3 - 2 * e);
        finger.style.transform = `translate(${cue.from[0] + (cue.to[0] - cue.from[0]) * k}px, ${cue.from[1] + (cue.to[1] - cue.from[1]) * k}px) scale(${cueT < 0.1 ? 1.25 - cueT * 2.5 : 1})`;
        finger.style.opacity = cueT < 0.08 ? cueT / 0.08 : cueT > 0.75 ? Math.max(0, 1 - (cueT - 0.75) / 0.2) : 1;
      } else { finger.style.opacity = 0; cueT = 0; }
      // a way out for anyone who is stuck
      if (story.idle > 16 && story.state !== 'reading') $('skip').classList.add('show');
    }

    const held = story.state !== 'arrive' && story.state !== 'adrift';
    const zs = swash(story.bx, t);
    // The camera. It starts on the horizon, comes down to the sand when the bottle shows, and follows the phone a little.
    const goalY = !reading ? 0.1 : story.state === 'arrive' ? 0.44 : story.state === 'adrift' ? (story.seen ? 0.0 : 0.3) : 0.16;
    camY += (goalY - camY) * Math.min(1, dt * 1.1);
    let lx = 0.035 * Math.sin(t * 0.21), ly = 0.02 * Math.sin(t * 0.17 + 1);
    if (story.motion) {
      rest[0] += (story.g[0] - rest[0]) * Math.min(1, dt / 3); rest[1] += (story.g[1] - rest[1]) * Math.min(1, dt / 3);
      lx += Math.max(-0.4, Math.min(0.4, story.g[0] - rest[0])); ly += Math.max(-0.4, Math.min(0.4, story.g[1] - rest[1]));
    }
    look[0] += (lx - look[0]) * Math.min(1, dt * 5); look[1] += (ly - look[1]) * Math.min(1, dt * 5);
    const amount = held ? 0.3 : story.grab ? 0.15 : 1;      // steady while something is in your hand
    scene.cam.target = [look[0] * 1.5 * amount, camY - look[1] * 1.1 * amount, -1.5];
    scene.draw({
      time: t,
      dim: reading ? (held ? 0.55 * Math.min(1, story.lift) + (story.state === 'reading' ? 0.25 : 0) : 0) : 0.35,
      ripples: story.ripples,
      shadow: reading && story.visible && !held ? [story.bx, story.bz + 0.03, 0.27, 1] : [0, 0, 1, 0],
      bottle: reading && story.visible ? story.bottleMatrix() : null,
      cork: reading ? story.corkMatrix() : null,
      note: reading ? story.noteMatrix() : null,
      noteOut: story.note > 0.55,
      wet: held ? Math.max(0, 1 - story.st / 9) * (story.state === 'held' ? 1 : 0.4) : (zs > story.bz - 0.3 ? 1 : 0.6),
    });
    if (!started) { started = true; ready(); $('veil').classList.add('up'); }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    last = now;
    if (window.dev && window.dev.hold) return;          // ?dev only: stand still so a test can step time by hand
    frame(Math.min(0.05, Math.max(0.001, raw)));
    // If the phone cannot keep up, trade a little sharpness for smoothness.
    if (raw < 0.2) { fpsN++; fpsT += raw; }
    if (raw > 0.024 && raw < 0.2) slow++; else slow = Math.max(0, slow - 0.25);
    if (slow > 40 && quality > 0.5) { quality *= 0.82; slow = 0; layout(true); }
  }
  ready();                      // everything loaded and the shaders built: the safety net can stand down
  requestAnimationFrame(loop);

  // For looking at it by hand while building (add ?dev to the address).
  if (qs.has('dev')) {
    window.dev = {
      story, scene, audio, frame, DRY_LINE, quality: () => quality,
      run(secs) { for (let k = 0; k < secs * 60; k++) frame(1 / 60); return story.state; },
      async shot(name) {          // save what is on the canvas right now (needs dev-server.mjs)
        frame(1 / 60);
        const r = await fetch('/dev/shot?name=' + name, { method: 'POST', body: cv.toDataURL('image/jpeg', 0.92) });
        return r.status;
      },
    };
  }
}
