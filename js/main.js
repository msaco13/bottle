// Message in a bottle. One page, two faces:
//   a link with a message after the #  ->  the shore, and a bottle to open
//   no message                         ->  the writing desk
// After a note is read, writing back is one tap: the desk opens already addressed, and the page says in plain
// words how the reply gets there (straight to their phone, or one tap that texts it). Nothing is ever copied by hand.

import { decode, linkFor, MAX_MESSAGE } from './code.js';
import { keepsakes, grow, keepLine, MAX_SHELLS } from './keeps.js';
import { Scene, swash, DRY_LINE, MOOD } from './scene.js';
import { Flat } from './flat.js';
import { Story, floating } from './story.js';
import { Shore } from './audio.js';
import { newKey, newClaim, add, addOpen, list, open, reach } from './thread.js';
import { myName, setName, threads, isMine, wrote, remember, kept, keep, token, pull, carry, arrive, threadByNumber, mobile, reachOf, setReach, rename, forget, gathers, gatherAdd } from './shore.js';
import { standing, light, douse, tend, ios, standalone } from './lantern.js';
import { count } from './count.js';
import { newPic, prepare, put, get } from './pic.js';
import { SAND_TYPE, MAX_POINTS, pack, unpack, paint, pointsIn } from './sand.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const linked = decode(location.hash) || decode(qs.get('b'));
const invite = linked && linked.g === 'i' ? linked : null;       // an invitation to add a bottle to a beach someone is filling
const beach = linked && linked.g === 'o' ? linked : null;        // that beach, opened by the person it is for
const sandMsg = linked && linked.g === 's' ? linked : null;      // not a bottle: something written in the sand for this phone
const bottle = invite || sandMsg ? null : linked;                // what is read here: one bottle, or a beach of them
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
/** A lantern lit for someone: kept with the conversation like a note, but not a bottle. It leaves no shell and is never counted as one. */
const isLamp = (n) => !!n && n.kind === 'l';
const isSand = (n) => !!n && n.kind === 's';
async function notesFor(key, lamps = false) {
  const fresh = await list(await token(), key);
  const all = fresh ? keep(key, fresh) : kept(key);        // if the server is asleep, the history is still here
  return lamps ? all : all.filter((n) => !isLamp(n) && !isSand(n));
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
  if (beach) { if (el) el.textContent = beachNotes && beachNotes.length ? `${opened()} of ${beachNotes.length} opened. Each one leaves a shell on your shore, and lights a star.` : ''; return; }
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
  if (beach) {
    // The server answered late, or not at all: bring the first bottle in now, or say plainly that they could not be had.
    if (!shown.id && beachNotes && beachNotes.length) shown = unread()[0] || beachNotes[0];
    if (!shown.id) shown = { ...beach, message: beachNotes ? 'No bottles have been added to this beach yet.' : 'The bottles could not be brought in just now. Check your connection, then try again.', name: '', to: beach.to };
    else { markRead(shown.id); shoreKeeps(opened()); }
  }
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
  if (beach) { beachButtons(); return; }
  const known = withWho();
  const mine = isMine(b) || (!b.name && !!known && b.to === known);       // an unsigned note addressed to them is this phone's own
  const other = (mine ? b.to : b.name) || (theirsUnsigned(b) ? known : '');
  const key = seat === 'taken' ? '' : (bottle.key || b.key || '');       // a taken seat: the reply starts a conversation of its own
  $('reply').textContent = (mine ? 'Send another' : 'Write back') + (other ? ' to ' + other : '');
  $('reply').classList.toggle('call', !mine);
  // back: this is an answer to their note. me: the name their note was addressed to, to sign with if this phone has none yet.
  $('reply').onclick = () => desk({ to: other || '', key, fresh: true, back: !mine, me: mine ? '' : (b.to || '') });
  // The question everyone has at this point is "how do I answer, do I copy something?". Answer it before it is asked.
  $('replyHow').textContent = mine ? (other && key ? `When ${other} writes back, it shows up here.` : '')
    : key && reachOf(key).l ? `It goes straight to ${whose(other)} phone. Nothing to copy, nothing to text.`
    : 'Write your note, then one tap sends it back. Nothing to copy or paste.';
  if (asked && key) remember(key, other, b.at || 0);
}
/** The line over the earlier notes: it is a conversation, so say so. */
const between = (n) => { const w = withWho(), c = n === 1 ? '1 bottle' : n + ' bottles'; return w ? `You and ${w}: ${c} so far` : `Your conversation: ${c} so far`; };

// The earlier notes of this conversation. Nothing here is needed to read the note or to reply.
async function shelf() {
  const el = $('shelf');
  el.textContent = '';
  const old = $('newest'); if (old) old.remove();
  $('reply').classList.remove('ghost');
  $('sealNote').textContent = '';
  if (beach) { beachShelf(); beachButtons(); return; }
  if (!bottle || !bottle.key) return;
  // Break the seal: take this bottle's seat in its conversation, or find that another phone already has.
  seat = await open(await token(), bottle.key, bottle.claim);
  asked = true;
  count('seal', seat || 'the server did not answer');
  if (seat === 'taken') {
    $('sealNote').textContent = 'This bottle was opened on another phone first, so the notes before it stay there. You can still write back.';
    if (shown === bottle) address(bottle);
    keepSay();
    return;
  }
  if (shown === bottle) address(bottle);
  // Does their phone have notifications on? Then the line under the button can say the reply goes straight there.
  learnReach(bottle.key).then((changed) => { if (changed && shown && !beach) address(shown); });
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
    go.onclick = () => { showLetter(false, newer[newer.length - 1]); go.remove(); $('reply').classList.remove('ghost'); head.textContent = between(all.length); for (const c of row.children) c.classList.toggle('on', c === row.firstChild); };
    // A new bottle is the first thing to do, so it goes above everything else.
    $('after').insertBefore(go, $('reply'));
    $('reply').classList.add('ghost');
  }
  const head = document.createElement('div');
  head.className = 'shelfHead';
  head.textContent = newer.length ? (newer.length === 1 ? 'A newer bottle has washed up since this one' : `${newer.length} newer bottles have washed up since this one`) : between(all.length);
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
  if (scene) scene.lamp = st === 'lit' || lampHere ? 1 : 0;       // the lantern on the sand: notifications are on, or someone lit one for this phone
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
        say('Notifications are on. This phone tells you when a bottle arrives, or when someone lights a lantern for you.');
        btn('Turn notifications off', async () => { await douse(); litHere = false; count('lantern', 'put out', true); lantern(); }, 'link');
      } else if (litHere) say('Notifications are on. This phone tells you when a bottle arrives, or when someone lights a lantern for you.');
    } else if (st === 'blocked') {
      // They said no to notifications. Do not bring it up again, except on the desk where it explains why nothing arrives.
      if (onDesk) say('Notifications are blocked for this page in your browser\u2019s settings, so this phone cannot tell you when a bottle arrives.');
    } else if (st === 'safari') {
      say('To get notified when a bottle arrives, open this page in Safari and turn on notifications there.');
    } else if (st === 'home') {
      btn('Turn on notifications', homeCard, 'btn ghost');
      say('Then this phone tells you when a bottle arrives, and friends can send you one with no link to text.');
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
      say(lanternSaid || 'Then this phone tells you when a bottle arrives, and friends can send you one with no link to text.');
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

// ---------------------------------------------------------------- a beach many people fill for one person (the "g" links in code.js)
//
// One person starts it and gets two links. The invitation goes to everyone who should add a bottle. The beach goes to
// the person it is for, who finds every bottle washed up together and brings them in one at a time.
// The bottles are kept by the server, scrambled with the beach's key, which both links carry: anyone with either link
// can read every bottle, like a card that everyone signs. Unlike a single bottle, a beach does need the server.

let beachNotes = null;       // every bottle on the beach being opened, oldest first, once the server has answered
let gatherSaid = '';         // on an invitation: how many bottles so far, and from whom
const readBook = () => { try { const v = JSON.parse(localStorage.getItem('bottle-read') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const readOnes = () => { const v = readBook()[beach.key]; return Array.isArray(v) ? v : []; };
function markRead(id) {
  try {
    const v = readBook();
    v[beach.key] = [...new Set([...readOnes(), id])].slice(-400);
    const keys = Object.keys(v);
    for (const k of keys.slice(0, Math.max(0, keys.length - 12))) if (k !== beach.key) delete v[k];
    localStorage.setItem('bottle-read', JSON.stringify(v));
  } catch {}
}
const unread = () => (beachNotes || []).filter((n) => !readOnes().includes(n.id));
const opened = () => (beachNotes || []).filter((n) => readOnes().includes(n.id)).length;
/** "5 bottles so far, from Mike, Dad and Ana." */
function sofar(all) {
  if (!all || !all.length) return '';
  const names = [...new Set(all.map((n) => n.name).filter(Boolean))];
  return `${all.length === 1 ? '1 bottle' : all.length + ' bottles'} so far` + (names.length ? ', from ' + listed(names.slice(0, 4)) + (names.length > 4 ? ' and others' : '') : '') + '.';
}

/** Bring a beach's bottles in from the server. The one riding in is the first not yet opened. */
async function beachLoad() {
  const all = await list(null, beach.key);
  if (!all) return false;
  beachNotes = all;
  if (!story || story.state === 'arrive' || story.state === 'adrift') { const first = unread()[0] || all[0]; if (first) { shown = first; sky(first.mood); } }
  shoreKeeps(opened());
  count('gather', `opened a beach of ${Math.min(all.length, 200)}`);
  return true;
}
/** The bottles still waiting out in the water, for the picture. */
function stillOut(t) {
  if (!beach || !beachNotes) return null;
  const out = [];
  beachNotes.forEach((n, i) => { if (n !== shown && !readOnes().includes(n.id) && out.length < 14) out.push(floating(i, t)); });
  return out;
}
/** The button under a note from a beach: the next bottle, or, after the last, a bottle of their own. */
function beachButtons() {
  const btn = $('reply'), left = unread().length;
  btn.classList.remove('ghost', 'call');
  $('replyHow').textContent = '';
  if (!beachNotes) { btn.textContent = 'Try again'; btn.onclick = () => location.reload(); return; }
  if (left) { btn.textContent = left === 1 ? 'Bring in the last bottle' : `Bring in the next bottle (${left} left)`; btn.onclick = nextBottle; }
  else { btn.textContent = 'Write a bottle of your own'; btn.onclick = () => desk({ fresh: true }); }
  const hands = new Set((beachNotes || []).map((n) => n.name).filter(Boolean)).size;
  $('sealNote').textContent = left || !beachNotes.length ? '' : `That was the last one. ${beachNotes.length === 1 ? '1 bottle' : beachNotes.length + ' bottles'}${hands > 1 ? `, from ${hands} people` : ''}.`;
}
/** The bottles already opened, to read again. The ones still in the water stay a surprise. */
function beachShelf() {
  const el = $('shelf');
  el.textContent = '';
  const done = (beachNotes || []).filter((n) => readOnes().includes(n.id));
  if (done.length < 2) return;
  const head = document.createElement('div');
  head.className = 'shelfHead';
  head.textContent = `Opened so far (${done.length} of ${beachNotes.length})`;
  const row = document.createElement('div');
  row.className = 'shelfRow';
  for (const n of [...done].reverse()) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (n === shown ? ' on' : '');
    chip.textContent = n.name || 'A note';
    chip.onclick = () => { showLetter(false, n); for (const c of row.children) c.classList.toggle('on', c === chip); };
    row.appendChild(chip);
  }
  el.append(head, row);
}
/** Put the note away and let the next bottle ride in. */
function nextBottle() {
  const next = unread()[0];
  if (!next || !story) return;
  shown = next;
  sky(next.mood);
  $('letter').classList.remove('show');
  $('after').classList.remove('show');
  const t = story.t;
  story = new Story(scene);
  story.t = t;
  story.down(scene.W / 2, scene.H * 0.62); story.up();       // the water has been touched already: straight to the bottle riding in
  count('gather', 'brought in another bottle', true);
}

/** The two links of a beach. */
function beachLinks(g) {
  const base = location.origin + location.pathname, b = { message: g.o || '', name: g.name || '', to: g.to || '', key: g.k };
  return { invite: linkFor(base, { ...b, g: 'i' }), beach: linkFor(base, { ...b, g: 'o' }) };
}
/** A pair of buttons that pass a link on: the share sheet where there is one, and always a way to copy it. */
function passOn(shareId, copyId, link, words, copyLabel) {
  const share = $(shareId), copy = $(copyId);
  share.style.display = navigator.share ? '' : 'none';
  share.onclick = async () => {
    try { await navigator.share({ title: 'A message in a bottle', text: words, url: link }); count('share', 'sent', true); }
    catch (e) { count('share', (e && e.name) === 'AbortError' ? 'closed without sending' : 'failed: ' + ((e && e.name) || ''), true); }
  };
  copy.textContent = copyLabel;
  copy.onclick = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch {}
    count('copy', ok ? 'copied' : 'could not copy', true);
    copy.textContent = ok ? 'Copied. Now paste it in a text.' : 'Could not copy it';
    setTimeout(() => { copy.textContent = copyLabel; }, 3500);
  };
}
/** The screen with a beach's links. how: 'started' just now, 'joined' a bottle was just added from an invitation, 'mine' looked up from the shore. */
function showGather(g, how) {
  const el = $('made'), links = beachLinks(g), who = g.to || 'them', compose = $('compose');
  el.className = how === 'joined' ? 'gather joined' : 'gather';
  madeLink = ''; madeSt = null; $('madeNext').textContent = '';
  $('madeTitle').textContent = how === 'joined' ? 'Your bottle is in the water' : how === 'started' ? 'The beach is started' : `The beach for ${who}`;
  $('madeLede').textContent = how === 'joined' ? `${g.to || 'They'} will find it washed up with all the others. Know someone else who should add one? Pass the invitation on.`
    : `Send the invitation to everyone who should add a bottle. When it is time, send ${who} the beach, and every bottle will be waiting there.`;
  $('gatherCount').textContent = '';
  list(null, g.k).then((all) => { if (all && el.classList.contains('gather')) $('gatherCount').textContent = sofar(all); });
  $('inviteLabel').textContent = how === 'joined' ? 'The invitation' : '1. Invite people to add a bottle';
  passOn('inviteShare', 'inviteCopy', links.invite, `We are filling a beach with bottles for ${who}${g.o ? ' (' + g.o + ')' : ''}. Add yours here:`, 'Copy the invitation link');
  $('beachPart').style.display = how === 'joined' ? 'none' : '';
  $('beachLabel').textContent = `2. When it is time, send ${who} the beach`;
  $('beachShare').textContent = `Share ${whose(g.to)} beach`;
  passOn('beachShare', 'beachCopy', links.beach, `${g.to ? g.to + ', a' : 'A'} whole beach of bottles washed up for you.`, `Copy the link to ${whose(g.to)} beach`);
  $('again').textContent = threads().length || gathers().length ? 'Back to your shore' : 'Write a bottle of your own';
  compose.classList.remove('home');
  compose.classList.add('show', 'done');
  compose.scrollTop = 0;
  lantern();
}
/** On the shore: the beaches this phone started, each a tap from its links. */
function drawGathers() {
  const el = $('gathers');
  el.textContent = '';
  for (const g of gathers().slice(0, 6)) {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'row';
    const who = document.createElement('span'); who.className = 'rowWho'; who.textContent = `A beach for ${g.to || 'someone'}`;
    const sub = document.createElement('span'); sub.className = 'rowSub'; sub.textContent = (g.o ? g.o + ' · ' : '') + 'tap for its links';
    row.append(who, sub);
    row.onclick = () => showGather({ ...g, name: myName() }, 'mine');
    el.appendChild(row);
  }
}
/** The desk was used to start a beach, or to add a bottle to one from an invitation. The bottle is only good once the server has it. */
async function joinOrStart(message, name, pic) {
  const starting = !!deskCtx.gather;
  const to = starting ? $('forWho').value.trim() : invite.to;
  if (starting && !to) { $('gatherSay').textContent = 'Say who the beach is for.'; $('forWho').focus(); return; }
  const why = starting ? $('occasion').value.trim().slice(0, 80) : invite.message;
  let key = starting ? '' : invite.key;
  try { if (!key) key = newKey(); } catch {}
  const label = $('make').textContent;
  $('make').disabled = true; $('make').textContent = starting ? 'Starting it' : 'Adding it';
  $('gatherSay').textContent = '';
  const ok = await addOpen(key, { m: message, n: name, mood: deskMood, to, id: Math.random().toString(36).slice(2, 12), t: Date.now(), ...(pic ? { p: pic } : {}) });
  $('make').disabled = false; $('make').textContent = label;
  if (!ok) { $('gatherSay').textContent = 'It could not be added just now. Check your connection and try again.'; count('f_save', 'a bottle for a beach was not taken', true); return; }
  count('gather', starting ? 'started a beach' : 'added a bottle', true);
  count('made', `${deskMood} ${starting ? 'beach started' : 'beach bottle'} ${message.length} letters${pic ? ', with a picture' : ''}`, true);
  if (starting) gatherAdd(key, to, why);
  showGather({ k: key, to, o: why, name: starting ? name : invite.name }, starting ? 'started' : 'joined');
}

// ---------------------------------------------------------------- written in the sand (see sand.js)

const QUICK = qs.has('dev') && qs.has('quick') ? 0.08 : 1;       // for a test: the writing and the wave in a fraction of the time
let deskSand = null;         // what has been written for the desk's bottle: { strokes, aspect }
const pad = { strokes: [], cur: null, aspect: 0.5, on: false, g: null, last: null };
const washedOnes = () => { try { const v = JSON.parse(localStorage.getItem('bottle-washed') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const markWashed = (secret) => { try { localStorage.setItem('bottle-washed', JSON.stringify([secret, ...washedOnes().filter((x) => x !== secret)].slice(0, 300))); } catch {} };
const sandSize = () => [stage.clientWidth || innerWidth, stage.clientHeight || innerHeight];
/** Size the sand's canvas to the screen. Returns its drawing context, in css pixels. */
function sandFit() {
  const c = $('sandCanvas'), [w, h] = sandSize(), r = Math.min(devicePixelRatio || 1, 2);
  c.width = Math.round(w * r); c.height = Math.round(h * r);
  const g = c.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  return g;
}
/** The small copy on the desk that shows something has been written. */
function sandThumb() {
  const c = $('sandThumb'), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  paint(g, c.width, c.height, MOOD[deskMood] || 0, deskSand ? deskSand.strokes : [], deskSand ? deskSand.aspect : 0.5, 1, null);
}
function dropSand() {
  deskSand = null;
  $('desk').classList.remove('sand');
  $('sandRow').classList.remove('has');
  $('sandNote').textContent = 'Written in the sand. A wave takes it once they have seen it.';
}
/** Open the wet sand to write on. */
function sandPad() {
  const [w, h] = sandSize();
  pad.strokes = deskSand ? deskSand.strokes.map((s) => s.slice()) : [];
  pad.cur = null; pad.aspect = w / h; pad.on = true; pad.g = sandFit();
  $('sand').className = 'show pad';
  $('sandSay').textContent = 'Write or draw with a finger. A wave takes it once they have seen it.';
  padDraw();
}
const padDraw = () => { const [w, h] = sandSize(); paint(pad.g, w, h, MOOD[deskMood] || 0, pad.strokes, pad.aspect, 1, null); };
{
  const c = $('sandCanvas');
  const at = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  c.addEventListener('pointerdown', (e) => {
    if (!pad.on || pointsIn(pad.strokes) >= MAX_POINTS) return;
    try { c.setPointerCapture(e.pointerId); } catch {}
    const p = at(e);
    pad.cur = [p[0], p[1]]; pad.last = [e.clientX, e.clientY];
    pad.strokes.push(pad.cur);
    $('sandSay').textContent = '';
    padDraw();
  });
  c.addEventListener('pointermove', (e) => {
    if (!pad.on || !pad.cur || pointsIn(pad.strokes) >= MAX_POINTS) return;
    if (Math.hypot(e.clientX - pad.last[0], e.clientY - pad.last[1]) < 2.5) return;        // a point every few pixels is plenty
    const p = at(e);
    pad.cur.push(p[0], p[1]); pad.last = [e.clientX, e.clientY];
    padDraw();
  });
  const lift = () => { pad.cur = null; };
  c.addEventListener('pointerup', lift);
  c.addEventListener('pointercancel', lift);
  $('sandClear').addEventListener('click', () => { pad.strokes = []; pad.cur = null; $('sandSay').textContent = 'Smoothed over. Write again.'; padDraw(); });
  $('sandDone').addEventListener('click', () => {
    pad.on = false;
    $('sand').className = '';
    if (pointsIn(pad.strokes) < 1) { if (!deskSand) dropSand(); return; }
    deskSand = { strokes: pad.strokes, aspect: pad.aspect };
    $('desk').classList.add('sand');
    $('sandRow').classList.add('has');
    sandThumb();
    count('sand', `written: ${pad.strokes.length} strokes, ${pointsIn(pad.strokes)} points`, true);
  });
}

/** The card that follows the wave: it is gone, and here is what to do next. */
function sandCard(how) {
  const el = $('sand'), name = sandMsg.name || '';
  el.className = 'show card';
  const g = sandFit(), [w, h] = sandSize();
  paint(g, w, h, MOOD[sandMsg.mood] || 0, [], 0.5, 1, null);
  $('sandSay').textContent = '';
  $('sandTitle').textContent = how === 'lost' ? 'It could not be brought in' : how === 'gone' ? 'The tide already took this one' : 'The tide took it';
  $('sandLede').textContent = how === 'lost' ? 'What was written could not be fetched just now. Check your connection and try again.'
    : how === 'gone' ? `${name || 'Someone'} wrote it in the sand for you, and a wave has been since.`
    : `${name || 'Someone'} wrote that in the sand for you. Now it is gone, as sand is.`;
  const back = $('sandBack');
  back.textContent = how === 'lost' ? 'Try again' : name ? `Write back to ${name} in the sand` : 'Write back in the sand';
  const reply = () => ({ to: name, key: sandSeat === 'taken' ? '' : sandMsg.key || '', fresh: true, back: true, me: sandMsg.to || '' });
  back.onclick = how === 'lost' ? () => location.reload() : () => { el.className = ''; desk(reply()); sandPad(); };
  $('sandBottle').style.display = how === 'lost' ? 'none' : '';
  $('sandBottle').onclick = () => { el.className = ''; desk(reply()); };
  $('sandHome').textContent = threads().length || gathers().length ? 'Back to your shore' : 'Write something of your own';
  $('sandHome').onclick = () => { el.className = ''; desk({}); };
}
let sandSeat = '';
/** A link to something written in the sand was opened. Show the beach, and on a touch, the writing, and then the wave. */
async function sandShow() {
  const el = $('sand'), name = sandMsg.name || 'Someone', mood = MOOD[sandMsg.mood] || 0;
  if (!seeing && washedOnes().includes(sandMsg.pic)) { count('sand', 'opened again after the tide'); sandCard('gone'); return; }
  el.className = 'show view wait';
  $('sandSay').textContent = `${name} wrote in the sand for you. Touch the sand`;
  const fetched = get(sandMsg.pic).then(async (r) => (r && r.type === SAND_TYPE ? unpack(new Uint8Array(await r.blob.arrayBuffer())) : null));
  await new Promise((res) => el.addEventListener('click', res, { once: true }));
  $('sandSay').textContent = '';
  // like opening a bottle, a touch takes this link's seat in the conversation, so the reply can go straight back
  if (sandMsg.key && !seeing) token().then((auth) => open(auth, sandMsg.key, sandMsg.claim)).then((seat) => { sandSeat = seat || ''; if (seat && seat !== 'taken') remember(sandMsg.key, sandMsg.name, 0); });
  const data = await fetched;
  if (!data) { count('sand', 'could not be brought in', true); sandCard('lost'); return; }
  const g = sandFit(), points = pointsIn(data.strokes);
  el.classList.remove('wait');
  const writing = Math.max(1.2, Math.min(6, points * 0.012)) * QUICK, holding = (2.6 + Math.min(4, points * 0.004)) * QUICK, coming = 2.0 * QUICK, going = 1.8 * QUICK;
  count('sand', `seen: ${data.strokes.length} strokes, ${points} points`);
  const t0 = performance.now();
  await new Promise((res) => {
    const step = (now) => {
      const t = (now - t0) / 1000, [w, h] = sandSize();
      let shown = 1, wave = null;
      if (t < writing) shown = t / writing;
      else if (t < writing + holding) shown = 1;
      else if (t < writing + holding + coming) { const k = (t - writing - holding) / coming; wave = { front: k * k * (3 - 2 * k), back: false }; }
      else if (t < writing + holding + coming + going) { const k = (t - writing - holding - coming) / going; wave = { front: 1 - k * k * (3 - 2 * k), back: true }; }
      else { paint(g, w, h, mood, [], data.aspect, 1, null); res(); return; }
      paint(g, w, h, mood, data.strokes, data.aspect, shown, wave);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (!seeing) { markWashed(sandMsg.pic); if (sandMsg.key && sandSeat && sandSeat !== 'taken') remember(sandMsg.key, sandMsg.name, Date.now()); }       // seen: it is no longer news on the shore
  count('sand', 'the tide took it', true);
  sandCard('took');
}

// ---------------------------------------------------------------- your shore (the people) and the writing desk

let deskReady = false, deskCtx = {}, madeLink = '', madeTo = '', deskMood = 'dusk';
let mobileOpen = false;      // the field for their number is behind one small link, so the desk asks for a name and a note and little else
/** Show the way to give a number, or the field itself once it has been asked for. want: would a number help here at all? */
const mobileShow = (want) => { $('mobileAsk').style.display = want && !mobileOpen ? 'block' : 'none'; $('mobileRow').style.display = want && mobileOpen ? 'flex' : 'none'; };
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
const sayWith = (to) => (madeSand ? (to ? `${to}, something is written in the sand for you. See it before the tide does.` : 'Something is written in the sand for you. See it before the tide does.') : to ? `${to}, a bottle washed up for you. Open it, then write back:` : 'A bottle washed up for you. Open it, then write back:');
let madeSand = false;        // the thing just made was written in the sand, not put in a bottle
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
let lampHere = false;        // someone has lit a lantern for this phone, and it has not been answered yet
const lampAt = new Map();    // when this phone last lit one for each person, so a thumb cannot send ten
function person(th, every) {
  const all = every.filter((n) => !isLamp(n) && (n.kind !== 's' || (!isMine(n) && n.at > (th.s || 0)))), lamps = every.filter((n) => isLamp(n) && !isMine(n));      // what was written in the sand counts only while it is news
  const lamp = lamps.filter((n) => n.at > (th.s || 0)).pop() || null;      // theirs, not yet seen
  const theirs = all.filter((n) => !isMine(n));
  const fresh = theirs.filter((n) => n.at > (th.s || 0));
  const last = all[all.length - 1];
  return { th, lamp, canLamp: theirs.length > 0 || lamps.length > 0 || !!reachOf(th.k).j,      // only someone who has joined can be lit a lantern
    isNew: fresh.length > 0, open: fresh.length ? fresh[fresh.length - 1] : last, at: last ? last.at : (th.t || 0), count: all.length,
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
const openNote = (f) => { location.href = addressOf({ message: f.open.message, name: f.open.name, mood: f.open.mood, to: f.open.to, key: f.th.k, pic: f.open.pic, g: f.open.kind === 's' ? 's' : '' }); };

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
      row.className = 'row' + (f.isNew || (f.lamp && !picking) ? ' new' : '');
      const who = document.createElement('span'); who.className = 'rowWho'; who.textContent = f.who || 'Someone';
      const sub = document.createElement('span'); sub.className = 'rowSub';
      sub.textContent = f.isNew ? (f.open.kind === 's' ? 'Wrote in the sand for you. See it before the tide does' : 'A new bottle washed up. Tap to open it')
        : f.lamp && !picking ? `Lit a lantern for you \u00b7 ${when(f.lamp.at)}`
        : [f.count ? (f.count === 1 ? '1 bottle' : f.count + ' bottles') : 'No bottles yet', f.count ? when(f.at) : '', reachOf(f.th.k).l ? 'notifications on' : ''].filter(Boolean).join(' · ');
      row.append(who, sub);
      if (picking) {
        row.classList.toggle('picked', picking.has(f.th.k));
        row.setAttribute('aria-pressed', picking.has(f.th.k) ? 'true' : 'false');
        row.onclick = () => { if (picking.has(f.th.k)) picking.delete(f.th.k); else if (picking.size < 8) picking.add(f.th.k); draw(found); };
      } else row.onclick = () => (f.isNew ? openNote(f) : desk({ to: f.who, key: f.th.k }));
      line.appendChild(row);
      if (!picking && f.canLamp) {
        // One tap, no words: "thinking of you". It is kept with the conversation and their phone is told, if it can be.
        const lamp = document.createElement('button');
        lamp.type = 'button'; lamp.className = 'peek lamp'; lamp.textContent = f.lamp ? 'Light one back' : 'Lantern';
        lamp.setAttribute('aria-label', `Light a lantern for ${f.who || 'them'}`);
        lamp.onclick = async () => {
          if ((lampAt.get(f.th.k) || 0) > Date.now() - 30000) return;
          lampAt.set(f.th.k, Date.now());
          lamp.disabled = true; lamp.textContent = 'Lighting';
          const id = Math.random().toString(36).slice(2, 12), mine = myName();
          wrote(id);
          if (f.lamp) { remember(f.th.k, '', f.lamp.at); f.lamp = null; }       // theirs has been seen, and answered
          const r = await add(await token(), f.th.k, { m: '', n: mine, mood: 'night', to: f.who, id, t: Date.now(), k: 'l' }, null);
          const told = r.ok ? await Promise.race([r.told, wait(9000).then(() => 0)]) : 0;
          if (r.ok) keep(f.th.k, [{ message: '', name: mine, mood: 'night', to: f.who, id, at: Date.now(), kind: 'l' }]);
          if (told) setReach(f.th.k, { j: 1, l: 1 });
          count('lamp', !r.ok ? 'could not be lit' : told ? 'lit, and their phone was told' : 'lit, waiting on their shore', true);
          row.classList.remove('new');
          sub.textContent = !r.ok ? 'It could not be lit just now. Try again in a minute.'
            : told ? `Lantern lit. ${Whose(f.who)} phone has been told.` : `Lantern lit. ${f.who || 'They'} will see it on opening Bottle.`;
          lamp.textContent = r.ok ? 'Lit' : 'Lantern';
          if (!r.ok) { lamp.disabled = false; lampAt.delete(f.th.k); }
          lampHere = found.some((x) => x.lamp);
          lantern();
        };
        line.appendChild(lamp);
      }
      if (!picking && !f.isNew && !f.lamp && f.open) {
        const peek = document.createElement('button');
        peek.type = 'button'; peek.className = 'peek'; peek.textContent = 'Read last';
        peek.setAttribute('aria-label', `Read the last bottle with ${f.who || 'them'}`);
        peek.onclick = () => openNote(f);
        line.appendChild(peek);
      }
      el.appendChild(line);
    }
    const lit = found.filter((f) => f.lamp);
    lampHere = lit.length > 0;
    if (scene) scene.lamp = standing() === 'lit' || lampHere ? 1 : 0;
    $('homeLede').textContent = found.some((f) => f.isNew) ? 'A bottle is waiting for you.' : lit.length ? `${lit[0].who || 'Someone'} lit a lantern for you.` : 'Tap a name to send a bottle.';
    people.found = found;
    pickWords(found.length);
    drawGathers();
  };
  draw(mine.map((th) => person(th, kept(th.k))));
  const fresh = await Promise.all(mine.map(async (th) => person(th, await notesFor(th.k, true))));
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
  const all = await notesFor(th.k, true);
  const theirs = all.filter((n) => !isMine(n));
  const pick = theirs.filter((n) => n.at > (th.s || 0)).pop() || theirs.pop() || all.pop();
  if (!pick) return home();
  count('followed', isLamp(pick) ? 'a lantern was tapped' : 'a notification was tapped');
  if (isLamp(pick)) { home(); homecoming(); return; }         // not a bottle to open: it is on the shore, by their name
  location.replace(addressOf({ message: pick.message, name: pick.name, mood: pick.mood, to: pick.to, key: th.k, pic: pick.pic, g: pick.kind === 's' ? 's' : '' }));
}

/** The words on the desk: who it is for, and whether it will go straight there or by a link. */
function deskWords() {
  $('desk').classList.toggle('gather', !!deskCtx.gather);
  // the three steps are for someone starting from nothing; anyone else is told how this one bottle gets there
  $('desk').classList.toggle('first', !deskCtx.to && !deskCtx.key && !deskCtx.many && !deskCtx.join && !deskCtx.gather);
  $('gatherSay').textContent = deskCtx.join ? gatherSaid : '';
  if (deskCtx.join || deskCtx.gather) {
    const who = (invite && deskCtx.join && invite.to) || 'someone';
    $('deskTitle').textContent = deskCtx.join ? `A bottle for ${who}` : 'A beach full of bottles';
    $('deskLede').textContent = deskCtx.join
      ? `${invite.name || 'Someone'} is filling a beach with bottles for ${who}${invite.message ? ': ' + invite.message : ''}. Add yours. ${invite.to || 'They'} will find them all washed up together.`
      : 'For a birthday, a farewell, a big day. You get one link for everyone to add a bottle, and one link for the person, who finds them all washed up together.';
    $('make').textContent = deskCtx.join ? 'Add my bottle' : 'Start the beach';
    mobileShow(false);
    return;
  }
  if (deskCtx.many) {
    const all = deskCtx.many, lit = all.filter((p) => reachOf(p.key).l).length;
    $('deskTitle').textContent = 'A bottle for ' + listed(all.map((p) => p.to || 'someone'));
    $('deskLede').textContent = 'Write one note. Each of them gets their own bottle. '
      + (lit === all.length ? 'All of them have notifications on, so there are no links to text.' : lit ? `${lit} of them ${lit === 1 ? 'has' : 'have'} notifications on and will be told. You get a link to text to the ${all.length - lit === 1 ? 'other' : 'others'}.` : 'You get a link to text to each.');
    $('make').textContent = `Send to ${all.length} people`;
    mobileShow(false);
    return;
  }
  const to = deskCtx.to || '', direct = !!(deskCtx.key && reachOf(deskCtx.key).l), back = !!deskCtx.back;
  $('deskTitle').textContent = to ? (back ? `Write back to ${to}` : `A bottle for ${to}`) : (deskCtx.key ? (back ? 'Write back' : 'Another bottle') : 'Message in a bottle');
  $('deskLede').textContent = direct ? `Write your note and tap send. ${to || 'They'} ${to ? 'has' : 'have'} notifications on, so it goes straight to ${whose(to)} phone. Nothing to copy or text.`
    : to || deskCtx.key ? `Write your note. Then one tap sends it to ${to || 'them'}, already written out. Nothing to copy or paste.`
    : 'Back and forth, as often as you both like. No app to download, no account.';
  $('make').textContent = direct ? (to ? `Send to ${to}` : 'Send it') : 'Seal it and send';
  // A number is only asked for when it would help: someone with no lantern lit and no number yet.
  mobileShow(!(direct || (deskCtx.key && numberOf(deskCtx.key))));
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
  const known = threads().length > 0 || gathers().length > 0;
  const home = known && !deskCtx.key && !deskCtx.to && !deskCtx.fresh && !deskCtx.many && !deskCtx.join && !deskCtx.gather;
  if (!home) { picking = null; editing = false; }
  compose.classList.toggle('home', home);
  $('toHome').style.display = known && !home ? 'block' : 'none';
  if (home) { people(); lantern(); count('home', Math.min(threads().length, 12) + ' people'); return; }
  $('toChip').textContent = '';                       // the title already says who it is for
  $('forRow').style.display = deskCtx.to || deskCtx.many || deskCtx.join ? 'none' : '';
  $('occasion').value = '';
  $('gatherB').style.display = deskCtx.to || deskCtx.key || deskCtx.many || deskCtx.join || deskCtx.gather ? 'none' : 'block';
  if (deskCtx.join) { gatherSaid = ''; list(null, invite.key).then((all) => { gatherSaid = sofar(all); if (deskCtx.join && !compose.classList.contains('done')) $('gatherSay').textContent = gatherSaid; }); }
  $('forWho').value = '';
  $('mobile').value = '';
  mobileOpen = false;
  $('pick').style.display = navigator.contacts && navigator.contacts.select ? '' : 'none';
  deskWords();
  if (deskCtx.many) { const who = deskCtx.many; Promise.all(who.map((p) => learnReach(p.key))).then((c) => { if (c.some(Boolean) && deskCtx.many === who && !compose.classList.contains('done')) deskWords(); }); }
  const key = deskCtx.key;
  if (key) learnReach(key).then((changed) => { if (changed && deskCtx.key === key && !compose.classList.contains('done')) deskWords(); });
  msg.value = '';
  dropPic();
  dropSand();
  $('sandRow').style.display = deskCtx.many || deskCtx.join || deskCtx.gather ? 'none' : '';
  try { who.value = myName() || deskCtx.me || ''; } catch {}      // answering a note addressed "For Ana" on a phone with no name yet: sign it Ana
  for (const c of $('moods').children) c.classList.toggle('on', c.dataset.mood === ((shown && shown.mood) || 'dusk'));
  deskMood = (shown && shown.mood) || 'dusk';
  sky(deskMood);
  $('left').textContent = String(MAX_MESSAGE - msg.value.length);
  lantern();
  if (deskCtx.to || deskCtx.many) setTimeout(() => msg.focus(), 350);
}

/**
 * The screen after "Seal it and send". how: 'link' it goes by a link, 'sending' it is on its way to a lit lantern.
 * By link there is exactly one thing left to do, and the screen says so: one button that sends it. The raw link is
 * kept out of sight wherever the phone has a share sheet, because a bare link is what makes people think they must
 * copy and paste. Once it has been handed over, the screen turns to what happens next.
 */
let madeSt = null;           // what the screen is showing: { mode: 'link' | 'direct' | 'told' | 'fallback', to, number, extra, sand, passed, saved, showLink, texting }
const copyLabel = () => (madeSt && !madeSt.passed && (navigator.share || madeSt.number) ? 'Copy the link instead' : 'Copy the link');
function made(how, to, number, extra) {
  const el = $('made');
  el.classList.remove('many', 'gather', 'joined', 'passed');
  el.classList.toggle('direct', how === 'sending');
  el.classList.toggle('busy', how === 'sending');
  madeSt = { mode: how === 'sending' ? 'direct' : 'link', to, number, extra, sand: madeSand, passed: false, saved: false, showLink: false, texting: false };
  $('madeNext').textContent = '';
  if (how === 'sending') { $('madeTitle').textContent = to ? `Sending to ${to}` : 'Sending it'; $('madeLede').textContent = 'Carrying it down to the water.'; }
  $('link').value = madeLink;
  $('try').href = madeLink.replace('#', (qs.has('dev') ? '?dev&see' : '?see') + '#');
  // With their number, the phone's own Messages opens already addressed and written. Otherwise, the share sheet.
  $('text').style.display = number ? 'block' : 'none';
  $('text').href = number ? textTo(number, sayWith(to) + ' ' + madeLink) : '#';
  $('share').style.display = navigator.share ? '' : 'none';
  $('again').textContent = threads().length ? 'Back to your shore' : 'Write another';
  madeWords();
  $('compose').classList.add('done');
  $('compose').scrollTop = 0;
  lantern();
}
/** The buttons of that screen, and, while it is going by link, its words. Drawn again whenever something is learned. */
function madeWords() {
  const st = madeSt, el = $('made');
  if (!st) return;
  const to = st.to, sheet = !!navigator.share, easy = sheet || !!st.number;
  el.classList.toggle('sheet', easy && !st.showLink);      // one tap can send it: the bare link stays out of sight
  $('text').textContent = to ? `Text it to ${to}` : 'Text it';
  $('text').className = st.passed ? 'btn ghost' : 'btn';
  $('share').className = st.number || st.passed ? 'btn ghost' : 'btn';
  $('share').textContent = st.passed ? 'Send it again' : st.number ? 'Send it another way' : to ? `Send it to ${to}` : 'Send it';
  $('copy').textContent = copyLabel();
  if (st.mode !== 'link') return;
  el.classList.toggle('passed', st.passed);
  const they = to || 'they', s3 = (one, many) => (to ? one : many);
  $('madeTitle').textContent = st.passed ? 'Off it goes' : st.sand ? 'It is written in the sand' : easy ? `Last step: send it${to ? ' to ' + to : ''}` : 'Your bottle is ready';
  const paste = `Copy the link and paste it into a message${to ? ' to ' + to : ''}.`;
  $('madeLede').textContent = st.passed
      ? (st.sand ? `When ${they} ${s3('taps', 'tap')} it, what you wrote is waiting on the sand, and a wave takes it once it has been seen.`
        : `When ${they} ${s3('taps', 'tap')} it, your bottle washes up on their beach.` + st.extra)
    : st.sand ? 'What you wrote is waiting on the sand, and a wave takes it once it has been seen. ' + (easy ? 'One tap sends it. Nothing to copy or paste.' : paste)
    : easy ? 'Your note is inside the link, so one tap sends the whole bottle. Nothing to copy or paste.' + st.extra
    : paste + ' Your note travels inside the link itself.' + st.extra;
  // Only said once the server really has the note: that is what lets the answer find its way back here.
  $('madeNext').textContent = st.saved ? `When ${they} ${s3('writes', 'write')} back, it shows up here.` : '';
}
/** The link has been handed to Messages or the share sheet: turn the screen to what happens next. */
function handedOver() {
  if (!madeSt || madeSt.mode === 'direct' || madeSt.mode === 'told' || !$('compose').classList.contains('done')) return;
  madeSt.mode = 'link'; madeSt.passed = true; madeSt.texting = false;
  madeWords();
}
// Messages was opened with the text already written. When the page comes back to the front, take it that it went.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && madeSt && madeSt.texting) handedOver(); });

/**
 * One note, a bottle each. Every person gets their own bottle in their own conversation, with its own seat.
 * It goes straight to anyone whose lantern is lit. Each of the others gets a button that texts or shares their link.
 */
function sendMany(message, name, pic) {
  const who = deskCtx.many, el = $('made'), list = $('sentList');
  const run = sendMany.run = (sendMany.run || 0) + 1;
  madeLink = ''; madeTo = '';
  el.classList.remove('direct', 'busy', 'gather', 'joined', 'passed', 'sheet');
  el.classList.add('many');
  madeSt = null; $('madeNext').textContent = '';
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
    try { await navigator.share({ title: 'A message in a bottle', text: sayWith(madeTo), url: madeLink }); count('share', 'sent', true); handedOver(); return true; }
    catch (e) { count('share', (e && e.name) === 'AbortError' ? 'closed without sending' : 'failed: ' + ((e && e.name) || ''), true); return false; }
  };
  $('desk').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!msg.value.trim() && !deskPic && !deskSand) { msg.focus(); return; }
    // What was written in the sand is left with the server first. If it will not go, nothing is sent in its place.
    let sandSecret = '';
    if (deskSand) {
      const label = $('make').textContent;
      $('make').disabled = true; $('make').textContent = 'Taking it down to the sand';
      const secret = newPic(), ok = await put(secret, pack(deskSand.strokes, deskSand.aspect), SAND_TYPE);
      $('make').disabled = false; $('make').textContent = label;
      if (!ok) { $('sandNote').textContent = 'It could not be sent just now. Check your connection and try again.'; count('sand', 'could not be sent', true); return; }
      sandSecret = secret;
    }
    madeSand = !!sandSecret;
    // A picture still on its way is waited for. One that would not go is never left out without a word.
    if (deskPic && deskPic.state === 'working') {
      const label = $('make').textContent;
      $('make').disabled = true; $('make').textContent = 'Tucking the picture in';
      await deskPic.done;
      $('make').disabled = false; $('make').textContent = label;
    }
    if (deskPic && deskPic.state !== 'ready') { $('picShow').scrollIntoView({ block: 'center' }); return; }
    const pic = sandSecret || (deskPic ? deskPic.secret : ''), kind = sandSecret ? 's' : '', words = sandSecret ? '' : msg.value.trim();
    const name = who.value.trim();
    setName(name);
    if (deskCtx.join || deskCtx.gather) { joinOrStart(msg.value.trim(), name, pic); return; }
    if (deskCtx.many) { sendMany(msg.value.trim(), name, pic); return; }
    let key = deskCtx.key || '', claim = '';
    try { if (!key) key = newKey(); claim = newClaim(); } catch {}
    const to = deskCtx.to || $('forWho').value.trim();
    const number = mobile($('mobile').value) || numberOf(key);
    // The link carries the note, the conversation's key, and one seat: whoever opens it first is the one it was for.
    const b = { message: words, name, mood: deskMood, to, key, claim, pic, g: kind };
    madeTo = to;
    const link = madeLink = linkFor(location.origin + location.pathname, b);
    // A reply adds to a shore the two of you already share. Say what it will leave there.
    const before = deskCtx.key && !deskSand ? kept(key).filter((n) => !isLamp(n) && !isSand(n)).length : 0;
    const leaves = before ? ` It is bottle ${before + 1} between you` + (before < MAX_SHELLS ? `, and it leaves ${(before + 1) % 5 ? 'a new shell' : 'a starfish'} on the shore you share.` : '.') : '';
    // If their lantern is lit the bottle goes straight to their shore and their phone is told. No link to text.
    const direct = !!(deskCtx.key && reachOf(key).l);
    made(direct ? 'sending' : 'link', to, number, leaves);
    count('made', `${deskMood} ${deskCtx.key ? 'reply' : 'new'} ${b.message.length} letters${pic ? ', with a picture' : ''}`, true);
    // Going by link: Messages or the share sheet opens straight away, while this is still the same tap.
    if (!direct) {
      if (number) { count('share', 'opened Messages, already addressed', true); madeSt.texting = true; try { location.href = $('text').href; } catch {} }
      else if (navigator.share) share();
      else count('share', 'no share sheet on this browser', true);
    }
    // Keep a scrambled copy with the conversation, so either of you can find it again. Not needed for the link to work.
    const id = Math.random().toString(36).slice(2, 12);
    wrote(id);
    remember(key, to, 0, number);
    keep(key, [{ message: b.message, name: b.name, mood: b.mood, to: b.to, id, at: Date.now(), ...(pic ? { pic } : {}), ...(kind ? { kind } : {}) }]);
    token().then((auth) => add(auth, key, { m: b.message, n: b.name, mood: b.mood, to: b.to, id, t: Date.now(), ...(pic ? { p: pic } : {}), ...(kind ? { k: kind } : {}) }, claim)).then(async (r) => {
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
        if (madeSt) madeSt.mode = 'told';
        el.classList.remove('passed'); $('madeNext').textContent = '';
        el.classList.add('direct');
        $('madeTitle').textContent = to ? `Sent to ${to}` : 'Sent';
        lede.textContent = (direct ? `${Whose(to)} phone has been told. No link needed.` : `${to || 'They'} ${to ? 'has' : 'have'} notifications on, so ${whose(to)} phone has already been told. No need to text this one.`) + leaves;
      } else if (direct) {
        if (madeSt) madeSt.mode = 'fallback';
        el.classList.remove('direct');
        $('madeTitle').textContent = 'Your bottle is ready';
        lede.textContent = r.ok
          ? `It is saved for ${to || 'them'}, but ${whose(to)} phone could not be told this time. It will be waiting when ${to || 'they'} next ${to ? 'opens' : 'open'} Bottle. To be sure, text the link.`
          : `The server could not be reached, so text ${to || 'them'} the link. The note travels inside it.`;
      } else if (madeSt) { madeSt.saved = !!r.ok; madeWords(); }
    });
  });
  for (const c of $('moods').children) c.addEventListener('click', () => { deskMood = c.dataset.mood; sky(deskMood); for (const o of $('moods').children) o.classList.toggle('on', o === c); });
  $('mobileAsk').addEventListener('click', () => { mobileOpen = true; mobileShow(true); $('mobile').focus(); });
  $('sandAdd').addEventListener('click', () => sandPad());
  $('sandShow').addEventListener('click', (e) => { if (e.target.id !== 'sandDrop') sandPad(); });       // a tap on what was written opens it to change
  $('sandDrop').addEventListener('click', () => { dropSand(); count('sand', 'removed', true); });
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
    if (!ok && madeSt) { madeSt.showLink = true; madeWords(); }      // it could not be copied for them: show the link to press and hold
    $('copy').textContent = ok ? 'Copied. Now paste it in a text.' : 'Press and hold the link above to copy it';
    setTimeout(() => { $('copy').textContent = copyLabel(); }, 3500);
  });
  $('share').addEventListener('click', share);
  $('text').addEventListener('click', () => { count('share', 'opened Messages, already addressed', true); if (madeSt) madeSt.texting = true; });
  $('showLink').addEventListener('click', () => $('made').classList.remove('direct'));
  $('again').addEventListener('click', () => desk({}));
  $('gatherA').addEventListener('click', () => desk({ gather: true }));
  $('gatherB').addEventListener('click', () => desk({ gather: true }));
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
}

// ---------------------------------------------------------------- keeping it, and how it works
//
// Android: the browser offers to put the page on the home screen as an app. The offer is kept for a plain button
// under a note, on the "last step" screen and on the shore, so the first bottle someone reads can become a place
// they come back to. (An iPhone has no such offer: its way is the Home Screen card, opened from "Turn on notifications".)
let installOffer = null;
const keepShow = () => { for (const b of document.querySelectorAll('.keep')) b.style.display = installOffer ? 'block' : 'none'; };
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installOffer = e; keepShow(); count('install', 'offered by the browser'); });
addEventListener('appinstalled', () => { installOffer = null; keepShow(); count('install', 'installed', true); });
for (const b of document.querySelectorAll('.keep')) b.addEventListener('click', async () => {
  if (!installOffer) return;
  const offer = installOffer;
  installOffer = null;
  try { offer.prompt(); const c = await offer.userChoice; count('install', ((c && c.outcome) || '') + ' (' + b.id + ')', true); } catch {}
  keepShow();
});
// "How Bottle works": five lines, a tap away wherever someone might be wondering.
for (const b of document.querySelectorAll('.how')) b.addEventListener('click', () => { $('howcard').classList.add('show'); count('how', 'opened', true); });
$('howClose').addEventListener('click', () => $('howcard').classList.remove('show'));
$('howcard').addEventListener('click', (e) => { if (e.target.id === 'howcard') $('howcard').classList.remove('show'); });

/** The page has learned something new about this phone's people (the server answered, or the page came back to the front). */
function homecoming() {
  const compose = $('compose');
  if ((bottle || sandMsg) && !compose.classList.contains('show')) return;
  if (compose.classList.contains('done') || deskCtx.to || deskCtx.key || deskCtx.fresh || deskCtx.many || deskCtx.join || deskCtx.gather) { lantern(); return; }
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
if (beach) { shoreKeeps(readOnes().length); beachLoad(); }
else if (bottle) { const known = bottle.key ? kept(bottle.key).filter((n) => !isLamp(n) && !isSand(n)) : []; shoreKeeps(known.length + (among(known, bottle) ? 0 : 1)); }
if (invite) count('gather', 'opened an invitation');
if (sandMsg) count('sand', 'opened');
lantern();
arriveAndCatchUp();
const ready = () => { window.__bottleReady = true; const p = $('plain'); if (p) p.className = ''; };

if (!scene) {
  // Nothing to draw on at all. The words still get through.
  ready();
  $('veil').classList.add('up');
  if (bottle) showLetter(true); else if (sandMsg) sandShow(); else desk(invite ? { join: true } : {});
} else {
  run();
}

function run() {
  story = new Story(scene);
  const audio = new Shore();
  const reading = !!bottle;
  if (sandMsg) sandShow(); else if (!reading) desk(invite ? { join: true } : {});
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
      const many = beach && beachNotes && story.state === 'arrive' ? beachNotes.length : 0;
      const h = many > 1 ? `${many} bottles washed up for you. Touch the water` : story.hint();
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
      dim: reading ? (held ? 0.55 * Math.min(1, story.lift) + (story.state === 'reading' ? 0.25 : 0) : 0) : (sandMsg && $('sand').classList.contains('wait') ? 0 : 0.35),
      ripples: story.ripples,
      shadow: reading && story.visible && !held ? [story.bx, story.bz + 0.03, 0.27, 1] : [0, 0, 1, 0],
      bottle: reading && story.visible ? story.bottleMatrix() : null,
      cork: reading ? story.corkMatrix() : null,
      note: reading ? story.noteMatrix() : null,
      others: stillOut(t),
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
      get story() { return story; }, get scene() { return scene; }, audio, frame, DRY_LINE, quality: () => quality, tries: () => tries,
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
