// Message in a bottle. One page, two faces:
//   a link with a message after the #  ->  the shore, and a bottle to open
//   no message                         ->  the writing desk
// After a note is read, sending one back is one tap: the desk opens already addressed.

import { decode, linkFor, MAX_MESSAGE } from './code.js';
import { Scene, swash, DRY_LINE } from './scene.js';
import { Story } from './story.js';
import { Shore } from './audio.js';
import { newKey, add, list } from './thread.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const bottle = decode(location.hash) || decode(qs.get('b'));
const stage = $('stage');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;

addEventListener('hashchange', () => location.reload());
if (bottle) document.documentElement.classList.add('reading');

// ---------------------------------------------------------------- the note itself

let shown = bottle;          // the note on the paper right now (the one from the link, or an earlier one from the shelf)
const myName = () => { try { return localStorage.getItem('bottle-name') || ''; } catch { return ''; } };
const same = (a, b) => a && b && a.message === b.message && (a.name || '') === (b.name || '');

function showLetter(instant, note) {
  if (note) shown = note;
  const b = shown;
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
  const mine = b.name && b.name === myName();
  const other = mine ? b.to : b.name;
  $('reply').textContent = other ? 'Send one back to ' + other : 'Send one back';
  $('reply').onclick = () => desk({ to: other || '', key: bottle.key || b.key || '' });
  $('fresh').onclick = () => desk({});
  letter.classList.add('show');
  $('hint').classList.remove('show'); $('skip').classList.remove('show'); $('finger').style.opacity = 0;
  $('after').classList.remove('show');
  clearTimeout(showLetter.t);
  showLetter.t = setTimeout(() => $('after').classList.add('show'), instant ? 300 : (2.4 + parts.length * per) * 1000);
  if (!note) shelf();
}

// The earlier notes of this conversation, if the server has them. Nothing here is needed to read or reply.
async function shelf() {
  const el = $('shelf');
  el.textContent = '';
  const old = $('newest'); if (old) old.remove();
  $('reply').classList.remove('ghost');
  if (!bottle || !bottle.key) return;
  const all = await list(bottle.key);
  if (!all.length) return;
  const here = all.find((n) => same(n, bottle));
  const newer = here ? all.filter((n) => n.at > here.at) : [];
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

// ---------------------------------------------------------------- the writing desk

let deskReady = false, deskCtx = {}, madeLink = '';

/** ctx: { to, key } when sending one back. Empty for a fresh bottle. */
function desk(ctx) {
  deskCtx = ctx || {};
  const msg = $('msg'), who = $('who'), compose = $('compose');
  $('letter').classList.remove('show');
  compose.classList.remove('done');
  compose.classList.add('show');
  compose.scrollTop = 0;
  $('toChip').textContent = deskCtx.to ? 'To ' + deskCtx.to : '';
  $('deskTitle').textContent = deskCtx.to ? 'Send one back' : 'Message in a bottle';
  $('deskLede').textContent = deskCtx.to
    ? `Write your note. You get a link to text to ${deskCtx.to}, and your bottle washes up on their shore.`
    : 'Write a note. You get one link. Text it to someone, and when they tap it a bottle washes up on a beach with your words inside.';
  msg.value = '';
  try { who.value = myName(); } catch {}
  const count = () => { $('left').textContent = String(MAX_MESSAGE - msg.value.length); };
  count();
  if (deskCtx.to) setTimeout(() => msg.focus(), 350);
  if (deskReady) return;
  deskReady = true;
  msg.addEventListener('input', count);

  const share = async () => {
    try { await navigator.share({ title: 'A message in a bottle', text: deskCtx.to ? `${deskCtx.to}, a bottle washed up for you.` : 'Something washed ashore for you.', url: madeLink }); return true; } catch { return false; }
  };
  $('desk').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!msg.value.trim()) { msg.focus(); return; }
    const name = who.value.trim();
    try { localStorage.setItem('bottle-name', name); } catch {}
    let key = deskCtx.key || '';
    try { if (!key) key = newKey(); } catch {}
    const b = { message: msg.value.trim(), name, mood: 'dusk', to: deskCtx.to || '', key };
    madeLink = linkFor(location.origin + location.pathname, b);
    $('link').value = madeLink;
    $('try').href = madeLink;
    $('share').style.display = navigator.share ? '' : 'none';
    $('madeLede').textContent = deskCtx.to
      ? `Text this link to ${deskCtx.to}. The note travels inside the link itself.`
      : 'Send this link to one person. The note travels inside the link itself.';
    compose.classList.add('done');
    compose.scrollTop = 0;
    // The share sheet opens straight away, while this is still the same tap.
    if (navigator.share) share();
    // Keep a scrambled copy with the conversation, so either of you can find it again. Not needed for the link to work.
    add(key, { m: b.message, n: b.name, mood: b.mood, to: b.to, id: Math.random().toString(36).slice(2, 12), t: Date.now() });
  });
  $('link').addEventListener('focus', () => $('link').select());
  $('copy').addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(madeLink); ok = true; } catch {
      try { $('link').select(); ok = document.execCommand('copy'); } catch {}
    }
    $('copy').textContent = ok ? 'Copied. Now paste it in a text.' : 'Press and hold the link above to copy it';
    setTimeout(() => { $('copy').textContent = 'Copy the link'; }, 3500);
  });
  $('share').addEventListener('click', share);
  $('again').addEventListener('click', () => desk({}));
  $('backToNote').addEventListener('click', () => { compose.classList.remove('show'); if (bottle) $('letter').classList.add('show'); });
}

// ---------------------------------------------------------------- the shore

let scene = null;
try { scene = qs.has('nogl') ? null : new Scene($('gl')); } catch (e) { scene = null; }   // ?nogl pretends there is no 3D, to test the fallback
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
      if (!DM) return;
      if (typeof DM.requestPermission === 'function') {
        const res = await DM.requestPermission();
        if (res !== 'granted') return;                 // fine: everything still works by touch
      }
      addEventListener('devicemotion', onMotion);
      addEventListener('deviceorientation', onOrient);
    } catch {}
  }

  // ---- touch
  const cv = $('gl');
  const at = (e) => [e.offsetX, e.offsetY];
  if (reading) {
    // The first touch has to be a real click for iPhone to allow sound and motion.
    cv.addEventListener('click', (e) => {
      if (story.state !== 'arrive') return;
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
    $('skip').addEventListener('click', () => { audio.unlock(); audio.play('reveal'); story.state = 'reading'; story.seen = true; story.lift = 1; showLetter(false); });
  }
  addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (audio.ctx && document.visibilityState === 'visible') audio.ctx.resume(); });

  // ---- one frame
  const hintEl = $('hint'), finger = $('finger');
  const look = [0, 0], rest = [0, 1];
  let camY = reading ? 0.44 : 0.1;
  let hintText = null, cueT = 0, slow = 0, last = performance.now(), started = false;

  function frame(dt) {
    if (reading) story.update(dt); else story.t += dt;
    for (const ev of story.events) {
      if (ev === 'reveal') showLetter(false);
      const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (ev === 'pop' && navigator.vibrate && touched) navigator.vibrate([18, 30, 40]);
      if ((ev === 'grab' || ev === 'clink') && navigator.vibrate && touched) navigator.vibrate(10);
      audio.play(ev);
    }
    story.events.length = 0;
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
    frame(Math.min(0.05, Math.max(0.001, raw)));
    // If the phone cannot keep up, trade a little sharpness for smoothness.
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
