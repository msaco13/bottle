// Message in a bottle. One page, two faces:
//   a link with a message after the #  ->  the shore, and a bottle to open
//   no message                         ->  the writing desk
// After a note is read, sending one back is one tap: the desk opens already addressed.

import { decode, linkFor, MAX_MESSAGE } from './code.js';
import { keepsakes, grow, keepLine, MAX_SHELLS } from './keeps.js';
import { Scene, swash, DRY_LINE, MOOD } from './scene.js';
import { Flat } from './flat.js';
import { Story } from './story.js';
import { Shore } from './audio.js';
import { newKey, newClaim, add, list, open, reach } from './thread.js';
import { myName, setName, threads, isMine, wrote, remember, kept, keep, token, pull, carry, arrive, threadByNumber, mobile, reachOf, setReach, rename, forget } from './shore.js';
import { standing, light, douse, tend, ios, standalone } from './lantern.js';
import { count } from './count.js';
import { newPic, prepare, put, get } from './pic.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const bottle = decode(location.hash) || decode(qs.get('b'));
const hop = /^#n\.([A-Za-z0-9_-]{22})$/.exec(location.hash);          // a notification was tapped: it names a conversation
const seeing = qs.has('see');           // the writer looking at their own bottle from "See what they will see"
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
  addEventListener(ev, (e) => { if (human || !e.isTrusted) return; human = true; for (const f of waiting.splice(0)) f(); }, { capture: true, passive: true });
}

// ---------------------------------------------------------------- the note itself

let shown = bottle;          // the note on the paper right now (the one from the link, or an earlier one from the shelf)
let seat = '';               // where this phone stands in the link's conversation, once the server has said (see thread.js)
let asked = false;
const same = (a, b) => a && b && a.message === b.message && (a.name || '') === (b.name || '') && (a.pic || '') === (b.pic || '');

/** The notes of a conversation: what the server says now, joined with what this phone has already seen. */
async function notesFor(key) {
  const fresh = await list(await token(), key);
  return fresh ? keep(key, fresh) : kept(key);        // if the server is asleep, the history is still here
}

// ---------------------------------------------------------------- what the conversation has left on the shore (see keeps.js)

let keeps = null;
/** Is this note already among those ones? */
const among = (all, b) => all.some((n) => same(n, b));
/**
 * Lay out the shells and stars for however many bottles this phone knows have gone between the two of you.
 * It only ever grows while the page is open, and what is already lying there stays as it is.
 */
function shoreKeeps(n) {
  if (!bottle) return;
  if (qs.has('dev') && qs.get('keeps')) n = Number(qs.get('keeps')) || n;       // for looking at a fuller shore while building
  if (keeps && n <= keeps.count) return;
  const next = keepsakes(bottle.key || bottle.message, n);
  if (keeps) { next.join = keeps.join; next.shells.forEach((s, i) => { if (keeps.shells[i]) s.a = keeps.shells[i].a; }); next.stars.forEach((s, i) => { if (keeps.stars[i]) s.a = keeps.stars[i].a; }); }
  else { for (const s of next.shells) s.a = 1; for (const s of next.stars) s.a = 1; next.join = next.whole ? 1 : 0; }      // what was already here is simply here
  keeps = next;
  if (scene) scene.keeps = keeps;
  keepSay();
}
/** The line under the note that says what the shore is keeping. Only for a conversation this phone belongs to. */
function keepSay() {
  const el = $('keepNote');
  if (el) el.textContent = keeps && bottle && bottle.key && seat !== 'taken' ? keepLine(keeps) : '';
}

/** Put a sky over the shore: 'dusk', 'night' or 'dawn'. */
function sky(mood) { if (scene) scene.mood = MOOD[mood] || 0; document.documentElement.dataset.mood = MOOD[mood] ? mood : 'dusk'; }

/** Who the link's conversation is with, as this phone remembers it. '' if it does not know. */
const withWho = () => { const th = bottle && bottle.key ? threads().find((t) => t.k === bottle.key) : null; return (th && th.w) || ''; };
/** An unsigned note in a conversation this phone knows: is it the other person's? (One addressed to them is this phone's own.) */
const theirsUnsigned = (n) => !n.name && !!withWho() && n.to !== withWho() && !isMine(n);

/** Put the picture that came with a note on the paper. The words never wait for it. */
let picUrl = '', picTurn = 0;
function showPic(b) {
  const wrap = $('picWrap'), img = $('pic'), turn = ++picTurn;
  if (picUrl) { try { URL.revokeObjectURL(picUrl); } catch {} picUrl = ''; }
  wrap.className = b.pic ? 'on' : '';
  img.removeAttribute('src');
  if (!b.pic) return;
  const say = $('picNote');
  say.textContent = 'A picture came with this. Bringing it in.';
  say.onclick = null;
  const bring = async () => {
    const got = await get(b.pic);
    if (turn !== picTurn) return;                      // another note is on the paper by now
    if (!got) {
      count('pic', 'could not be brought in', true);
      say.textContent = 'A picture came with this, but it could not be brought in. Tap here to try again.';
      say.onclick = () => { say.textContent = 'Trying again.'; say.onclick = null; bring(); };
      return;
    }
    picUrl = URL.createObjectURL(got.blob);
    img.onload = () => { if (turn === picTurn) wrap.classList.add('got'); };
    img.src = picUrl;
    count('pic', 'shown: ' + (got.type === 'image/gif' ? 'a GIF' : 'a photo') + ', ' + Math.round(got.blob.size / 1024) + ' KB');
  };
  bring();
}

// A tap on the picture shows it as large as the screen allows. A tap there puts it away.
$('pic').addEventListener('click', () => { if (!picUrl) return; $('picBigImg').src = picUrl; $('picBig').classList.add('show'); });
$('picBig').addEventListener('click', () => { $('picBig').classList.remove('show'); $('picBigImg').removeAttribute('src'); });

function showLetter(instant, note) {
  if (note) shown = note;
  const b = shown;
  sky(b.mood);
  showPic(b);
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
  sign.textContent = b.name ? '~ ' + b.name : theirsUnsigned(b) ? `Not signed. From your bottles with ${withWho()}.` : '';
  sign.classList.toggle('unsigned', !b.name);
  const seal = $('seal');
  seal.textContent = b.name ? Array.from(b.name.trim())[0].toUpperCase() : '';
  seal.style.display = b.name ? '' : 'none';
  seal.style.animationDelay = instant ? '0s' : (2.0 + parts.length * per).toFixed(2) + 's';
  sign.style.animationDelay = instant ? '0s' : (1.6 + parts.length * per).toFixed(2) + 's';
  // Sending one back is the obvious next thing, and it is already addressed.
  address(b);
  $('fresh').onclick = () => desk({});
  $('fresh').textContent = threads().length ? 'Back to your shore' : 'Write a bottle for someone else';      // a phone with people has a shore to go back to
  letter.classList.add('show');
  $('hint').classList.remove('show'); $('skip').classList.remove('show'); $('finger').style.opacity = 0;
  $('after').classList.remove('show');
  clearTimeout(showLetter.t);
  showLetter.t = setTimeout(() => $('after').classList.add('show'), instant ? 300 : (2.4 + parts.length * per) * 1000);
  if (!note) touched(shelf);
}

/** Point the reply button at the other person in this note, and keep the conversation on this phone. */
function address(b) {
  const known = withWho();
  const mine = isMine(b) || (!b.name && !!known && b.to === known);       // an unsigned note addressed to them is this phone's own
  const other = (mine ? b.to : b.name) || (theirsUnsigned(b) ? known : '');
  const key = seat === 'taken' ? '' : (bottle.key || b.key || '');       // a taken seat: the reply starts a conversation of its own
  $('reply').textContent = (mine ? 'Send another' : 'Send one back') + (other ? ' to ' + other : '');
  $('reply').onclick = () => desk({ to: other || '', key, fresh: true });
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
    keepSay();
    return;
  }
  if (shown === bottle) address(bottle);
  const all = await notesFor(bottle.key);
  shoreKeeps(all.length + (among(all, bottle) ? 0 : 1));
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
    const from = newer[newer.length - 1].name || (theirsUnsigned(newer[newer.length - 1]) ? withWho() : '');
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
    chip.textContent = `${isMine(n) ? 'You' : n.name || (theirsUnsigned(n) ? withWho() : 'A note')} · ${when(n.at)}`;
    chip.onclick = () => { showLetter(false, n); for (const c of row.children) c.classList.toggle('on', c === chip); };
    row.appendChild(chip);
  }
  el.appendChild(row);
}

// ---------------------------------------------------------------- the lantern (see lantern.js)

let lanternSaid = '', carriedLost = false, homeBack = '', litHere = false;      // litHere: notifications were turned on during this visit

/** Draw the lantern's line wherever it belongs: under a note, under a new bottle, and on the desk. */
function lantern() {
  const st = standing();
  if (scene) scene.lamp = st === 'lit' ? 1 : 0;
  for (const id of ['lanternA', 'lanternB', 'lanternC', 'lanternD']) {
    const onDesk = id === 'lanternC' || id === 'lanternD';
    const el = $(id);
    if (!el) continue;
    el.textContent = '';
    if (st === 'none') continue;
    if (onDesk && !(st === 'lit' || standalone || threads().length)) continue;      // the desk only mentions it to people it could help
    // In the Home Screen app, lighting it is the first thing to do, so it goes at the very top.
    if (id === 'lanternC') { if (standalone && st !== 'lit') $('desk').insertBefore(el, $('desk').firstChild); else $('make').after(el); }
    if (id === 'lanternD') { if (standalone && st !== 'lit') $('home').insertBefore(el, $('people')); else $('newOne').after(el); }
    const say = (t) => { const p = document.createElement('p'); p.className = 'lanternSay'; p.textContent = t; el.appendChild(p); };
    const btn = (t, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = t; b.onclick = fn; el.appendChild(b); return b; };
    if (id === 'lanternC' && carriedLost && !threads().length) say('If you already have bottles in Safari, they did not come across. To bring them: in Safari, open any bottle, tap "Turn on notifications", and add it to the Home Screen again.');
    // Said in plain words everywhere: it is notifications. The lantern is the picture of it, glowing on the sand.
    if (st === 'lit') {
      // Under a note there is nothing to say once they are on: the lantern on the sand says it. The switch lives on the shore and the desk.
      if (onDesk) {
        say('Notifications are on. Your lantern is lit, and this phone tells you when a bottle arrives.');
        btn('Turn notifications off', async () => { await douse(); litHere = false; count('lantern', 'put out', true); lantern(); }, 'link');
      } else if (litHere) say('Notifications are on. Your lantern is lit, and this phone tells you when a bottle arrives.');
    } else if (st === 'blocked') {
      // They said no to notifications. Do not bring it up again, except on the desk where it explains why nothing arrives.
      if (onDesk) say('Notifications are blocked for this page in your browser\u2019s settings, so this phone cannot tell you when a bottle arrives.');
    } else if (st === 'safari') {
      say('To get notified when a bottle arrives, open this page in Safari and turn on notifications there.');
    } else if (st === 'home') {
      btn('Turn on notifications', homeCard, 'btn ghost');
      say('Then this phone tells you when a bottle arrives, and friends can send you one with no link to text. A lantern lights on your shore to show it is on.');
    } else {
      btn('Turn on notifications', async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'Turning them on';
        const how = await light();                    // the browser asks its one question here
        count('lantern', how, true);
        litHere = how.startsWith('lit');
        lanternSaid = litHere ? '' : how === 'refused' ? 'Notifications stay off. You can turn them on any time.'
          : 'Notifications could not be turned on (' + how.replace('failed: ', '') + '). Try again in a minute.';
        lantern();
      }, standalone ? 'btn' : 'btn ghost');
      say(lanternSaid || 'Then this phone tells you when a bottle arrives, and friends can send you one with no link to text. A lantern lights on your shore to show it is on.');
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

// ---------------------------------------------------------------- your shore (the people) and the writing desk

let deskReady = false, deskCtx = {}, madeLink = '', madeTo = '', deskMood = 'dusk';
// The picture being tucked into the bottle on the desk, if any: { secret, state: 'working' | 'ready' | 'failed', done: a promise of true or false, url }
let deskPic = null;
function dropPic() {
  if (deskPic && deskPic.url) { try { URL.revokeObjectURL(deskPic.url); } catch {} }
  deskPic = null;
  $('picRow').classList.remove('has');
  $('picThumb').removeAttribute('src');
  $('picFile').value = '';
}
/** A picture was chosen. Show it at once, then make it ready and leave it with the server while the note is being written. */
function tuckPic(file) {
  dropPic();
  if (!file) return;
  const mine = deskPic = { secret: '', state: 'working', url: URL.createObjectURL(file), done: null };
  $('picThumb').src = mine.url;
  $('picRow').classList.add('has');
  $('picSay').textContent = 'Tucking it in.';
  mine.done = (async () => {
    let why = '';
    try {
      const made = await prepare(file);
      const secret = newPic();
      if (await put(secret, made.bytes, made.type)) { mine.secret = secret; mine.state = 'ready'; mine.kb = Math.round(made.bytes.length / 1024); mine.gif = made.type === 'image/gif'; }
      else why = 'send';
    } catch (e) { why = (e && e.message) || 'open'; }
    if (mine.state !== 'ready') mine.state = 'failed';
    if (deskPic === mine) {
      $('picSay').textContent = mine.state === 'ready' ? (mine.gif ? 'Your GIF is tucked in.' : 'Your picture is tucked in.')
        : why === 'big' ? 'That GIF is too big to send (the most is about 3 MB). Try a shorter one.'
        : why === 'kind' ? 'That is not a picture. Choose a photo or a GIF.'
        : why === 'open' ? 'This phone could not read that picture. Try another.'
        : 'It could not be sent just now. Remove it and try again.';
    }
    count('pic', mine.state === 'ready' ? `tucked in: ${mine.gif ? 'a GIF' : 'a photo'}, ${mine.kb} KB` : 'not tucked in: ' + why, true);
    return mine.state === 'ready';
  })();
}
let reachAsked = true;       // false once the server has shown it cannot say who is reachable: then stop asking
const when = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
const whose = (to) => (to ? to + '’s' : 'their');
const Whose = (to) => (to ? to + '’s' : 'Their');
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** The address of a bottle on this site. A visit that was opened as a test stays a test. */
const addressOf = (b) => { const l = linkFor(location.origin + location.pathname, b); return qs.has('dev') ? l.replace('#', '?dev#') : l; };
/** The words that travel with a link when it is texted or shared. */
const sayWith = (to) => (to ? `${to}, a bottle washed up for you.` : 'Something washed ashore for you.');
/** An address that opens this phone's own Messages, already addressed and already written. The phone sends the text, nothing else does. */
const textTo = (number, words) => `sms:${number}${ios ? '&' : '?'}body=${encodeURIComponent(words)}`;
const numberOf = (key) => { const th = threads().find((t) => t.k === key); return (th && th.p) || ''; };

/** Ask the server who is on the other side of a conversation and whether their lantern is lit, and keep what it says. */
async function learnReach(key) {
  if (!key || !reachAsked) return false;
  const old = reachOf(key);
  if (old.a && Date.now() - old.a < 30000) return false;                  // asked a moment ago
  const r = await reach(await token(), key);
  if (!r) { reachAsked = false; return false; }      // the server cannot say (asleep, or it has not been taught): stop asking for this visit
  const next = { j: r.others > 0 ? 1 : 0, l: r.lit > 0 ? 1 : 0, a: Date.now() };
  setReach(key, next);
  return next.j !== old.j || next.l !== old.l;
}

/** What is known of one conversation, for its row on the shore. */
function person(th, all) {
  const theirs = all.filter((n) => !isMine(n));
  const fresh = theirs.filter((n) => n.at > (th.s || 0));
  const last = all[all.length - 1];
  return { th, isNew: fresh.length > 0, open: fresh.length ? fresh[fresh.length - 1] : last, at: last ? last.at : (th.t || 0), count: all.length,
    who: th.w || (theirs.length ? theirs[theirs.length - 1].name : '') || (all[0] && all[0].to) || '' };
}
let picking = null;          // while several people are being chosen for one bottle: the keys ticked so far
let editing = false;         // while people are being renamed or removed
const listed = (names) => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
/** The shore's buttons, for sending to one or for choosing several. */
function pickWords(count) {
  const on = !!picking, n = on ? picking.size : 0;
  $('editPeople').style.display = count && !on ? 'block' : 'none';
  $('editPeople').textContent = editing ? 'Done' : 'Rename or remove someone';
  $('newOne').style.display = editing ? 'none' : '';
  if (editing) { $('several').style.display = 'none'; $('homeLede').textContent = 'Change a name, or take someone off this phone.'; return; }
  $('several').style.display = count > 1 ? 'block' : 'none';
  $('several').textContent = on ? 'Never mind' : 'One bottle for several people';
  $('newOne').textContent = on ? (n < 2 ? 'Choose two or more' : `Write to these ${n}`) : 'A bottle for someone new';
  $('newOne').disabled = on && n < 2;
  if (on) $('homeLede').textContent = 'Tap everyone this bottle is for. Each of them gets their own.';
}
const openNote = (f) => { location.href = addressOf({ message: f.open.message, name: f.open.name, mood: f.open.mood, to: f.open.to, key: f.th.k, pic: f.open.pic }); };

// Your shore: everyone this phone sends bottles to, news first. A name sends them a bottle; a waiting bottle opens.
// Drawn at once from what the phone remembers, then again when the server has answered.
async function people() {
  const el = $('people');
  const mine = threads().slice(0, 12);
  const turn = people.turn = (people.turn || 0) + 1;
  const draw = (found) => {
    el.textContent = '';
    found.sort((a, b) => (b.isNew - a.isNew) || (b.at - a.at));
    for (const f of found) {
      const line = document.createElement('div');
      line.className = 'person';
      if (editing) {
        // The name as a field, saved when it is left. Removing takes two taps, so it cannot happen by a slip of the thumb.
        const field = document.createElement('input');
        field.type = 'text'; field.className = 'rowEdit'; field.maxLength = 40; field.value = f.who; field.placeholder = 'Their name';
        field.setAttribute('aria-label', 'Their name');
        field.onchange = () => { if (rename(f.th.k, field.value)) { f.who = field.value.trim(); f.th.w = f.who; count('people', 'renamed', true); } };
        const out = document.createElement('button');
        out.type = 'button'; out.className = 'peek'; out.textContent = 'Remove';
        out.onclick = () => {
          if (!out.classList.contains('sure')) { out.classList.add('sure'); out.textContent = 'Tap again to remove'; setTimeout(() => { out.classList.remove('sure'); out.textContent = 'Remove'; }, 4000); return; }
          forget(f.th.k); count('people', 'removed', true);
          const rest = found.filter((x) => x !== f);
          if (!rest.length) { editing = false; desk({}); } else draw(rest);
        };
        line.append(field, out);
        el.appendChild(line);
        continue;
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'row' + (f.isNew ? ' new' : '');
      const who = document.createElement('span'); who.className = 'rowWho'; who.textContent = f.who || 'Someone';
      const sub = document.createElement('span'); sub.className = 'rowSub';
      sub.textContent = f.isNew ? 'A new bottle washed up. Tap to open it'
        : [f.count ? (f.count === 1 ? '1 bottle' : f.count + ' bottles') : 'No bottles yet', f.count ? when(f.at) : '', reachOf(f.th.k).l ? 'notifications on' : ''].filter(Boolean).join(' · ');
      row.append(who, sub);
      if (picking) {
        row.classList.toggle('picked', picking.has(f.th.k));
        row.setAttribute('aria-pressed', picking.has(f.th.k) ? 'true' : 'false');
        row.onclick = () => { if (picking.has(f.th.k)) picking.delete(f.th.k); else if (picking.size < 8) picking.add(f.th.k); draw(found); };
      } else row.onclick = () => (f.isNew ? openNote(f) : desk({ to: f.who, key: f.th.k }));
      line.appendChild(row);
      if (!picking && !f.isNew && f.open) {
        const peek = document.createElement('button');
        peek.type = 'button'; peek.className = 'peek'; peek.textContent = 'Read last';
        peek.setAttribute('aria-label', `Read the last bottle with ${f.who || 'them'}`);
        peek.onclick = () => openNote(f);
        line.appendChild(peek);
      }
      el.appendChild(line);
    }
    $('homeLede').textContent = found.some((f) => f.isNew) ? 'A bottle is waiting for you.' : 'Tap a name to send a bottle.';
    people.found = found;
    pickWords(found.length);
  };
  draw(mine.map((th) => person(th, kept(th.k))));
  const fresh = await Promise.all(mine.map(async (th) => person(th, await notesFor(th.k))));
  if (turn !== people.turn) return;
  draw(fresh);
  // Whose lantern is lit. The first is asked alone: if the server cannot say, the rest are not asked at all.
  const changed = mine.length ? [await learnReach(mine[0].k), ...(await Promise.all(mine.slice(1, 8).map((th) => learnReach(th.k))))] : [];
  if (turn === people.turn && changed.some(Boolean)) draw(fresh);
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
  location.replace(addressOf({ message: pick.message, name: pick.name, mood: pick.mood, to: pick.to, key: th.k, pic: pick.pic }));
}

/** The words on the desk: who it is for, and whether it will go straight there or by a link. */
function deskWords() {
  if (deskCtx.many) {
    const all = deskCtx.many, lit = all.filter((p) => reachOf(p.key).l).length;
    $('deskTitle').textContent = 'A bottle for ' + listed(all.map((p) => p.to || 'someone'));
    $('deskLede').textContent = 'Write one note. Each of them gets their own bottle. '
      + (lit === all.length ? 'All of them have notifications on, so there are no links to text.' : lit ? `${lit} of them ${lit === 1 ? 'has' : 'have'} notifications on and will be told. You get a link to text to the ${all.length - lit === 1 ? 'other' : 'others'}.` : 'You get a link to text to each.');
    $('make').textContent = `Send to ${all.length} people`;
    $('mobileRow').style.display = 'none';
    return;
  }
  const to = deskCtx.to || '', direct = !!(deskCtx.key && reachOf(deskCtx.key).l);
  $('deskTitle').textContent = to ? `A bottle for ${to}` : (deskCtx.key ? 'Another bottle' : 'Message in a bottle');
  $('deskLede').textContent = direct ? `Write your note. ${to || 'They'} ${to ? 'has' : 'have'} notifications on, so your bottle goes straight to ${whose(to)} phone. No link to text.`
    : to ? `Write your note. You get a link to text to ${to}, and your bottle washes up on their shore.`
    : 'Write a note. You get one link. Text it to someone, and when they tap it a bottle washes up on a beach with your words inside.';
  $('make').textContent = direct ? (to ? `Send to ${to}` : 'Send it') : 'Create bottle';
  // A number is only asked for when it would help: someone with no lantern lit and no number yet.
  $('mobileRow').style.display = direct || (deskCtx.key && numberOf(deskCtx.key)) ? 'none' : '';
}

/**
 * Open the desk. ctx: { to, key } to write to someone this phone already knows, { fresh: true } for someone new.
 * With neither, a phone that has people is shown its shore, and a phone that has none is shown the empty desk.
 */
function desk(ctx) {
  deskCtx = ctx || {};
  const msg = $('msg'), who = $('who'), compose = $('compose');
  $('letter').classList.remove('show');
  compose.classList.remove('done');
  compose.classList.add('show');
  compose.scrollTop = 0;
  wire();
  const known = threads().length > 0;
  const home = known && !deskCtx.key && !deskCtx.to && !deskCtx.fresh && !deskCtx.many;
  if (!home) { picking = null; editing = false; }
  compose.classList.toggle('home', home);
  $('toHome').style.display = known && !home ? 'block' : 'none';
  if (home) { people(); lantern(); count('home', Math.min(threads().length, 12) + ' people'); return; }
  $('toChip').textContent = '';                       // the title already says who it is for
  $('forRow').style.display = deskCtx.to || deskCtx.many ? 'none' : '';
  $('forWho').value = '';
  $('mobile').value = '';
  $('pick').style.display = navigator.contacts && navigator.contacts.select ? '' : 'none';
  deskWords();
  if (deskCtx.many) { const who = deskCtx.many; Promise.all(who.map((p) => learnReach(p.key))).then((c) => { if (c.some(Boolean) && deskCtx.many === who && !compose.classList.contains('done')) deskWords(); }); }
  const key = deskCtx.key;
  if (key) learnReach(key).then((changed) => { if (changed && deskCtx.key === key && !compose.classList.contains('done')) deskWords(); });
  msg.value = '';
  dropPic();
  try { who.value = myName(); } catch {}
  for (const c of $('moods').children) c.classList.toggle('on', c.dataset.mood === ((shown && shown.mood) || 'dusk'));
  deskMood = (shown && shown.mood) || 'dusk';
  sky(deskMood);
  $('left').textContent = String(MAX_MESSAGE - msg.value.length);
  lantern();
  if (deskCtx.to || deskCtx.many) setTimeout(() => msg.focus(), 350);
}

/** The "bottle is ready" screen. how: 'link' it goes by a link, 'sending' it is on its way to a lit lantern. */
function made(how, to, number, extra) {
  const el = $('made');
  el.classList.remove('many');
  el.classList.toggle('direct', how === 'sending');
  el.classList.toggle('busy', how === 'sending');
  $('madeTitle').textContent = how === 'sending' ? (to ? `Sending to ${to}` : 'Sending it') : 'Your bottle is ready';
  $('madeLede').textContent = how === 'sending' ? 'Carrying it down to the water.'
    : (to ? `Text this link to ${to}. The note travels inside the link itself.` : 'Send this link to one person. The note travels inside the link itself.') + extra;
  $('link').value = madeLink;
  $('try').href = madeLink.replace('#', (qs.has('dev') ? '?dev&see' : '?see') + '#');
  // With their number, the phone's own Messages opens already addressed and written. Otherwise, the share sheet.
  $('text').style.display = number ? 'block' : 'none';
  $('text').textContent = to ? `Text it to ${to}` : 'Text it';
  $('text').href = number ? textTo(number, sayWith(to) + ' ' + madeLink) : '#';
  $('share').style.display = navigator.share ? '' : 'none';
  $('share').className = number ? 'btn ghost' : 'btn';
  $('share').textContent = number ? 'Share another way' : 'Share the link';
  $('again').textContent = threads().length ? 'Back to your shore' : 'Write another';
  $('compose').classList.add('done');
  $('compose').scrollTop = 0;
  lantern();
}

/**
 * One note, a bottle each. Every person gets their own bottle in their own conversation, with its own seat.
 * It goes straight to anyone whose lantern is lit. Each of the others gets a button that texts or shares their link.
 */
function sendMany(message, name, pic) {
  const who = deskCtx.many, el = $('made'), list = $('sentList');
  const run = sendMany.run = (sendMany.run || 0) + 1;
  madeLink = ''; madeTo = '';
  el.classList.remove('direct', 'busy');
  el.classList.add('many');
  $('madeTitle').textContent = `Sending to ${who.length} people`;
  $('madeLede').textContent = 'Carrying them down to the water.';
  $('again').textContent = 'Back to your shore';
  list.textContent = '';
  $('compose').classList.add('done');
  $('compose').scrollTop = 0;
  lantern();
  count('made', `${deskMood} to ${who.length} people ${message.length} letters`, true);
  let told = 0, left = who.length;
  const finish = () => {
    if (--left || run !== sendMany.run) return;
    $('madeTitle').textContent = told === who.length ? `Sent to all ${told}` : told ? `${told} sent, ${who.length - told} to text` : 'Your bottles are ready';
    $('madeLede').textContent = told === who.length ? 'Everyone has notifications on, so every phone has been told.' : 'Anyone with notifications on has been told. Each of the others needs their own link: one tap each.';
  };
  who.forEach((p, i) => {
    let claim = '';
    try { claim = newClaim(); } catch {}
    const b = { message, name, mood: deskMood, to: p.to, key: p.key, claim, pic };
    const link = linkFor(location.origin + location.pathname, b), number = numberOf(p.key);
    const row = document.createElement('div'); row.className = 'sentRow';
    const head = document.createElement('span'); head.className = 'rowWho'; head.textContent = p.to || 'Someone';
    const state = document.createElement('span'); state.className = 'rowSub'; state.textContent = 'On its way';
    row.append(head, state);
    list.appendChild(row);
    const id = Math.random().toString(36).slice(2, 12);
    wrote(id);
    remember(p.key, p.to, 0);
    keep(p.key, [{ message, name, mood: deskMood, to: p.to, id, at: Date.now() + i, ...(pic ? { pic } : {}) }]);
    // one after another, a moment apart, so the server is never asked for too much at once
    wait(i * 350).then(() => token()).then((auth) => add(auth, p.key, { m: message, n: name, mood: deskMood, to: p.to, id, t: Date.now(), ...(pic ? { p: pic } : {}) }, claim)).then(async (r) => {
      if (!r.ok) count('f_save', 'the server did not take the note', true);
      const reached = r.ok ? await Promise.race([r.told, wait(9000).then(() => 0)]) : 0;
      if (reached) setReach(p.key, { j: 1, l: 1 }); else if (r.ok && reachOf(p.key).l) setReach(p.key, { l: 0 });
      if (run !== sendMany.run) return;
      if (reached) {
        told++;
        row.classList.add('done');
        state.textContent = `Sent. ${Whose(p.to)} phone has been told.`;
      } else {
        state.textContent = r.ok ? 'Notifications are off there, so this one needs its link.' : 'The server could not be reached. The link carries the note.';
        const go = document.createElement(number ? 'a' : 'button');
        go.className = 'btn';
        if (number) { go.href = textTo(number, sayWith(p.to) + ' ' + link); go.textContent = `Text it to ${p.to || 'them'}`; go.onclick = () => count('share', 'opened Messages, already addressed', true); }
        else {
          go.type = 'button';
          go.textContent = navigator.share ? `Share ${whose(p.to)} link` : `Copy ${whose(p.to)} link`;
          go.onclick = async () => {
            if (navigator.share) { try { await navigator.share({ title: 'A message in a bottle', text: sayWith(p.to), url: link }); count('share', 'sent', true); } catch (e) { count('share', (e && e.name) === 'AbortError' ? 'closed without sending' : 'failed: ' + ((e && e.name) || ''), true); } return; }
            let ok = false;
            try { await navigator.clipboard.writeText(link); ok = true; } catch {}
            count('copy', ok ? 'copied' : 'could not copy', true);
            go.textContent = ok ? 'Copied. Now paste it in a text.' : 'Could not copy it';
          };
        }
        row.appendChild(go);
      }
      finish();
    });
  });
}

/** Everything on the desk that is tapped or typed. Wired once. */
function wire() {
  if (deskReady) return;
  deskReady = true;
  const msg = $('msg'), who = $('who'), compose = $('compose');
  msg.addEventListener('input', () => { $('left').textContent = String(MAX_MESSAGE - msg.value.length); });

  const share = async () => {
    try { await navigator.share({ title: 'A message in a bottle', text: sayWith(madeTo), url: madeLink }); count('share', 'sent', true); return true; }
    catch (e) { count('share', (e && e.name) === 'AbortError' ? 'closed without sending' : 'failed: ' + ((e && e.name) || ''), true); return false; }
  };
  $('desk').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!msg.value.trim() && !deskPic) { msg.focus(); return; }
    // A picture still on its way is waited for. One that would not go is never left out without a word.
    if (deskPic && deskPic.state === 'working') {
      const label = $('make').textContent;
      $('make').disabled = true; $('make').textContent = 'Tucking the picture in';
      await deskPic.done;
      $('make').disabled = false; $('make').textContent = label;
    }
    if (deskPic && deskPic.state !== 'ready') { $('picShow').scrollIntoView({ block: 'center' }); return; }
    const pic = deskPic ? deskPic.secret : '';
    const name = who.value.trim();
    setName(name);
    if (deskCtx.many) { sendMany(msg.value.trim(), name, pic); return; }
    let key = deskCtx.key || '', claim = '';
    try { if (!key) key = newKey(); claim = newClaim(); } catch {}
    const to = deskCtx.to || $('forWho').value.trim();
    const number = mobile($('mobile').value) || numberOf(key);
    // The link carries the note, the conversation's key, and one seat: whoever opens it first is the one it was for.
    const b = { message: msg.value.trim(), name, mood: deskMood, to, key, claim, pic };
    madeTo = to;
    const link = madeLink = linkFor(location.origin + location.pathname, b);
    // A reply adds to a shore the two of you already share. Say what it will leave there.
    const before = deskCtx.key ? kept(key).length : 0;
    const leaves = before ? ` It is bottle ${before + 1} between you` + (before < MAX_SHELLS ? `, and it leaves ${(before + 1) % 5 ? 'a new shell' : 'a starfish'} on the shore you share.` : '.') : '';
    // If their lantern is lit the bottle goes straight to their shore and their phone is told. No link to text.
    const direct = !!(deskCtx.key && reachOf(key).l);
    made(direct ? 'sending' : 'link', to, number, leaves);
    count('made', `${deskMood} ${deskCtx.key ? 'reply' : 'new'} ${b.message.length} letters${pic ? ', with a picture' : ''}`, true);
    // Going by link: Messages or the share sheet opens straight away, while this is still the same tap.
    if (!direct) {
      if (number) { count('share', 'opened Messages, already addressed', true); try { location.href = $('text').href; } catch {} }
      else if (navigator.share) share();
      else count('share', 'no share sheet on this browser', true);
    }
    // Keep a scrambled copy with the conversation, so either of you can find it again. Not needed for the link to work.
    const id = Math.random().toString(36).slice(2, 12);
    wrote(id);
    remember(key, to, 0, number);
    keep(key, [{ message: b.message, name: b.name, mood: b.mood, to: b.to, id, at: Date.now(), ...(pic ? { pic } : {}) }]);
    token().then((auth) => add(auth, key, { m: b.message, n: b.name, mood: b.mood, to: b.to, id, t: Date.now(), ...(pic ? { p: pic } : {}) }, claim)).then(async (r) => {
      if (!r.ok) count('f_save', 'the server did not take the note', true);
      // Was the other phone told? The sender is given a few seconds to answer.
      const told = r.ok ? await Promise.race([r.told, wait(9000).then(() => 0)]) : 0;
      if (told) setReach(key, { j: 1, l: 1 }); else if (r.ok && direct) setReach(key, { l: 0 });
      if (told || direct) count('lantern', 'sending: ' + (told ? (direct ? 'went straight to their lit lantern' : 'by link, and their lantern was told as well') : r.ok ? 'their lantern did not answer' : 'the server could not be reached'), true);
      if (madeLink !== link || !compose.classList.contains('done')) return;        // they have moved on to something else
      const el = $('made'), lede = $('madeLede');
      el.classList.remove('busy');
      if (told) {
        // Only said once the other phone's push service has really taken it.
        el.classList.add('direct');
        $('madeTitle').textContent = to ? `Sent to ${to}` : 'Sent';
        lede.textContent = (direct ? `${Whose(to)} phone has been told. No link needed.` : `${to || 'They'} ${to ? 'has' : 'have'} notifications on, so ${whose(to)} phone has already been told. No need to text this one.`) + leaves;
      } else if (direct) {
        el.classList.remove('direct');
        $('madeTitle').textContent = 'Your bottle is ready';
        lede.textContent = r.ok
          ? `It is saved for ${to || 'them'}, but ${whose(to)} phone could not be told this time. It will be waiting when ${to || 'they'} next ${to ? 'opens' : 'open'} Bottle. To be sure, text the link.`
          : `The server could not be reached, so text ${to || 'them'} the link. The note travels inside it.`;
      } else if (r.ok) {
        lede.textContent += ` When ${to ? to + ' sends' : 'they send'} one back, it will also be waiting for you on this page.`;
      }
    });
  });
  for (const c of $('moods').children) c.addEventListener('click', () => { deskMood = c.dataset.mood; sky(deskMood); for (const o of $('moods').children) o.classList.toggle('on', o === c); });
  $('picAdd').addEventListener('click', () => $('picFile').click());
  $('picFile').addEventListener('change', () => tuckPic($('picFile').files && $('picFile').files[0]));
  $('picDrop').addEventListener('click', () => { dropPic(); count('pic', 'removed', true); });
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
  $('text').addEventListener('click', () => count('share', 'opened Messages, already addressed', true));
  $('showLink').addEventListener('click', () => $('made').classList.remove('direct'));
  $('again').addEventListener('click', () => desk({}));
  $('newOne').addEventListener('click', () => {
    if (!picking) { desk({ fresh: true }); return; }
    const chosen = (people.found || []).filter((f) => picking.has(f.th.k)).map((f) => ({ key: f.th.k, to: f.who }));
    if (chosen.length > 1) desk({ many: chosen });
  });
  $('several').addEventListener('click', () => { picking = picking ? null : new Set(); people(); });
  $('editPeople').addEventListener('click', () => { editing = !editing; picking = null; people(); });
  $('toHome').addEventListener('click', () => desk({}));
  const back = () => { compose.classList.remove('show'); if (bottle) { sky(shown.mood); $('letter').classList.add('show'); } };
  $('backToNote').addEventListener('click', back);
  $('homeBack').addEventListener('click', back);
  // Android: choose them from the phone's own contacts. The phone shows its list; only the one name and number chosen come back.
  $('pick').addEventListener('click', async () => {
    try {
      const got = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      const c = got && got[0];
      if (!c) { count('pick', 'closed without choosing', true); return; }
      const tel = mobile((c.tel || [])[0]);
      if (tel) $('mobile').value = tel;
      if (!deskCtx.to && !$('forWho').value && c.name && c.name[0]) $('forWho').value = String(c.name[0]).split(/\s+/)[0].slice(0, 40);
      count('pick', tel ? 'chose a contact' : 'that contact had no number', true);
    } catch (e) { count('pick', 'failed: ' + ((e && e.name) || ''), true); }
  });
  // Android: the browser offers to put the page on the home screen as an app. Keep the offer for a button on the shore.
  let offer = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; $('install').style.display = 'block'; });
  addEventListener('appinstalled', () => { $('install').style.display = 'none'; count('install', 'installed', true); });
  $('install').addEventListener('click', async () => {
    if (!offer) return;
    try { offer.prompt(); const c = await offer.userChoice; count('install', (c && c.outcome) || '', true); } catch {}
    offer = null; $('install').style.display = 'none';
  });
}

/** The page has learned something new about this phone's people (the server answered, or the page came back to the front). */
function homecoming() {
  const compose = $('compose');
  if (bottle && !compose.classList.contains('show')) return;
  if (compose.classList.contains('done') || deskCtx.to || deskCtx.key || deskCtx.fresh || deskCtx.many) { lantern(); return; }
  if (compose.classList.contains('home')) { people(); lantern(); }
  else if (!$('msg').value && threads().length && compose.classList.contains('show')) desk({});      // an empty desk becomes the shore once there are people
  else lantern();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('compose').classList.contains('home') && !$('compose').classList.contains('done')) people(); });

// What happens once, as the page opens: bring the shore over (Home Screen app), follow a notification, catch up with the server.
async function arriveAndCatchUp() {
  const code = qs.get('i');
  if (code && standalone) {
    const how = await arrive(code);
    if (how !== 'here') count('carried', how);
    carriedLost = how === 'lost';
    if (!$('who').value) $('who').value = myName();
    homecoming();
  }
  // The Home Screen copy opened without its parcel code (the phone did not keep it in the address) and has nothing of its own: say how to bring the bottles over.
  if (ios && standalone && !code && !threads().length) { carriedLost = true; count('carried', 'no code in the address'); if (!bottle && !deskCtx.to) lantern(); }
  if (hop) return follow(hop[1]);
  if (await pull()) homecoming();
  tend();
}

// ---------------------------------------------------------------- the shore

let scene = null;            // whatever is drawing the shore right now: the 3D scene, or the flat one
let story = null;
let why3D = '';              // why the last try for 3D failed
let tries = 0;
let refit = () => {};        // set by run(): lay the picture out again

/** A fresh surface under the touch layer. Each try for 3D gets its own: a canvas that was refused once can stay refused. */
function surface(cls) {
  const c = document.createElement('canvas');
  c.className = 'draw ' + cls;
  stage.insertBefore(c, $('gl'));
  return c;
}

/** Try to start the 3D shore. null if the phone will not give it to us right now. */
function start3D() {
  if (qs.has('nogl') || qs.has('flat')) { why3D = 'switched off for a test'; return null; }
  tries++;
  const c = surface('deep');
  try {
    const s = new Scene(c);
    s.onlost = () => lost3D(s);
    return s;
  } catch (e) {
    c.remove();
    why3D = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 110);
    return null;
  }
}

/** The safety net: the same shore, painted flat. null only if the phone cannot draw at all. */
function startFlat() {
  if (qs.has('nocanvas')) return null;
  const c = surface('flat');
  try { return new Flat(c); } catch (e) { c.remove(); return null; }
}

/** Hand the story over to another way of drawing, in the middle of a step if need be. */
function use(next, note) {
  const old = scene;
  scene = next;
  if (old) scene.mood = old.mood;
  scene.keeps = keeps;
  if (story) story.view = scene;
  document.documentElement.classList.toggle('flat', !!scene.flat);
  refit(true);
  lantern();
  if (old && old !== next) { const c = old.canvas; old.dispose(); setTimeout(() => c.remove(), 80); }
  count('view', scene.info() + (note ? ' | ' + note : ''), true);
}

/** The phone took the 3D away (it does when memory is short, or the page was put aside). Carry on flat, and ask for 3D again shortly. */
function lost3D(s) {
  if (scene !== s) return;
  const f = startFlat();
  if (f) use(f, 'the phone took the 3D away at: ' + (story ? story.state : 'the start'));
  again([1200, 4000, 12000]);
}

/** While the shore is flat, keep asking for 3D for a while. A refusal is often only for a moment. */
let asking = 0;
function again(waits) {
  clearTimeout(asking);
  if (!waits.length || !scene || !scene.flat || tries > 8) return;
  asking = setTimeout(() => {
    if (!scene || !scene.flat) return;
    if (document.visibilityState === 'hidden') { again(waits); return; }      // ask once the page is in front
    const s = start3D();
    if (s) use(s, 'given on try ' + tries + ', after: ' + why3D); else again(waits.slice(1));
  }, waits[0]);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && scene && scene.flat && tries <= 8) again([300, 2500]); });

scene = start3D();
if (!scene) {
  scene = startFlat();
  if (scene) { document.documentElement.classList.add('flat'); again([400, 1500, 4000, 10000]); }
}
// How the shore is being drawn. If 3D was refused, enough to tell why: was the page on screen, how big, does the browser know 3D at all.
if (scene) setTimeout(() => count('view', scene.info() + (scene.flat ? ` | 3D refused: ${why3D} | ${document.visibilityState} ${innerWidth}x${innerHeight} | browser knows 3D: ${typeof WebGLRenderingContext !== 'undefined'}` : ''), true), 0);
else count('f_nogl', `nothing to draw on: ${why3D} | ${document.visibilityState} ${innerWidth}x${innerHeight}`);
count(bottle ? (seeing ? 'see' : 's_open') : 'desk', bottle ? bottle.mood + (bottle.key ? '' : ' old link') : '');
if (bottle) sky(bottle.mood);
if (bottle) { const known = bottle.key ? kept(bottle.key) : []; shoreKeeps(known.length + (among(known, bottle) ? 0 : 1)); }
lantern();
arriveAndCatchUp();
const ready = () => { window.__bottleReady = true; const p = $('plain'); if (p) p.className = ''; };

if (!scene) {
  // Nothing to draw on at all. The words still get through.
  ready();
  $('veil').classList.add('up');
  if (bottle) showLetter(true); else desk({});
} else {
  run();
}

function run() {
  story = new Story(scene);
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
  refit = layout;
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
      if (!seeing) count('s_touch');
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
  let was = '', fpsN = 0, fpsT = 0, tilted = false, pace = 1 / 60, probe = null, steady = false;
  const speed = () => `${fpsT > 0 ? Math.round(fpsN / fpsT) : 0} fps, ${Math.round(W * scene.scale)}x${Math.round(H * scene.scale)}, quality ${quality.toFixed(2)}`;

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
    grow(keeps, dt);
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
      if (was === 'held' && !seeing) count('s_held', speed());
      if (was === 'open' && !seeing) count('s_cork', story.motion ? 'tilt on' : 'touch only');
      if (was === 'reading' && !seeing) count('s_read', speed());
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
      if ((seeing || story.idle > 16) && story.state !== 'reading') $('skip').classList.add('show');
      // shells fade away while a note is being read: the page lays its words and buttons over that sand
      scene.keepHide = (scene.keepHide || 0) + ((story.state === 'reading' ? 1 : 0) - (scene.keepHide || 0)) * Math.min(1, dt * 2.5);
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
    if (raw < 0.2) { fpsN++; fpsT += raw; pace += (raw - pace) * 0.08; }
    if (!steady) {
      if (raw > 0.024 && raw < 0.2) slow++; else slow = Math.max(0, slow - 0.25);
      if (probe) {
        // Was it any faster for being less sharp? If not, the phone is holding a steady lower rate on purpose
        // (an iPhone in Low Power Mode draws 30 times a second whatever it is given). Give the sharpness back and leave it be.
        if (--probe.left <= 0) {
          if (pace > probe.before * 0.88) { quality = probe.was; steady = true; layout(true); count('pace', `held at ${Math.round(1 / pace)} a second, sharpness kept`); }
          probe = null; slow = 0;
        }
      } else if (slow > 40 && quality > 0.5) { probe = { before: pace, was: quality, left: 50 }; quality *= 0.82; slow = 0; layout(true); }
    }
  }
  ready();                      // everything loaded and the shaders built: the safety net can stand down
  requestAnimationFrame(loop);

  // For looking at it by hand while building (add ?dev to the address).
  if (qs.has('dev')) {
    window.dev = {
      story, get scene() { return scene; }, audio, frame, DRY_LINE, quality: () => quality, tries: () => tries,
      lose() { const x = scene.gl && scene.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return !!x; },   // pretend the phone took the 3D away
      run(secs) { for (let k = 0; k < secs * 60; k++) frame(1 / 60); return story.state; },
      async shot(name) {          // save what is on the canvas right now (needs dev-server.mjs)
        frame(1 / 60);
        const r = await fetch('/dev/shot?name=' + name, { method: 'POST', body: scene.canvas.toDataURL('image/jpeg', 0.92) });
        return r.status;
      },
    };
  }
}
