// Written in the sand.
//
// Instead of a note in a bottle: write or draw on the wet sand with a finger. The other person
// sees it appear on their own beach, as it was written, and then a wave takes it.
//
// What is sent is the path the finger took, nothing else: a list of strokes, each a list of
// points. Like a picture it is too long for a link, so it is scrambled on the phone and kept
// by the server under a name worked out from a secret that only travels in the link (pic.js).
//
// "Once" is kept by the phone that saw it: after the wave, that phone will not show it again.
// It is a courtesy, not a lock. Someone who opens the same link on another phone sees it there.
//
// The packing and unpacking are pure and tested (test/sand.test.mjs). The painting needs a canvas.

export const SAND_TYPE = 'bottle/sand';
export const MAX_POINTS = 4000;
const VERSION = 1;

/**
 * Pack what was written into bytes. strokes: [[x0, y0, x1, y1, ...], ...] with every number from 0 to 1 across the pad.
 * aspect: the pad's width over its height, so it is shown in the same shape at the other end.
 * One byte for the version, two for the shape, then for each stroke its length and its points, two bytes a number.
 */
export function pack(strokes, aspect) {
  const good = (strokes || []).filter((s) => Array.isArray(s) && s.length >= 2).map((s) => s.slice(0, s.length - (s.length % 2)));
  let points = 0;
  const kept = [];
  for (const s of good) { if (points >= MAX_POINTS) break; const room = (MAX_POINTS - points) * 2, cut = s.slice(0, room); kept.push(cut); points += cut.length / 2; }
  const out = new Uint8Array(3 + kept.reduce((n, s) => n + 2 + s.length * 2, 0)), view = new DataView(out.buffer);
  out[0] = VERSION;
  view.setUint16(1, Math.max(10, Math.min(1000, Math.round((aspect || 0.5) * 100))));
  let o = 3;
  for (const s of kept) {
    view.setUint16(o, s.length / 2); o += 2;
    for (const v of s) { view.setUint16(o, Math.max(0, Math.min(65535, Math.round(v * 65535)))); o += 2; }
  }
  return out;
}

/** Unpack it. Returns { aspect, strokes } or null if these bytes are not something written in the sand. Never throws. */
export function unpack(bytes) {
  try {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (raw.length < 3 || raw[0] !== VERSION) return null;
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const aspect = view.getUint16(1) / 100, strokes = [];
    let o = 3, points = 0;
    while (o + 2 <= raw.length) {
      const n = view.getUint16(o); o += 2;
      if (!n || o + n * 4 > raw.length || points + n > MAX_POINTS) return null;
      const s = new Array(n * 2);
      for (let i = 0; i < n * 2; i++) { s[i] = view.getUint16(o) / 65535; o += 2; }
      strokes.push(s); points += n;
    }
    return strokes.length ? { aspect, strokes } : null;
  } catch { return null; }
}

/** How many points have been written. */
export const pointsIn = (strokes) => (strokes || []).reduce((n, s) => n + s.length / 2, 0);

// ---------------------------------------------------------------- painting

// The sand under each sky: dusk, night, dawn. Dry on top, a little darker where it is damp.
const SAND = [
  { top: '#7a5c48', low: '#5e4636', groove: '34,20,12', edge: '255,232,205', water: '150,190,196', foam: '250,236,228' },
  { top: '#343a52', low: '#232840', groove: '6,8,20', edge: '170,190,230', water: '70,150,180', foam: '160,235,245' },
  { top: '#b08e72', low: '#8f725c', groove: '60,38,24', edge: '255,246,228', water: '170,205,208', foam: '255,250,244' },
];

/** The part of a w by h screen that the writing fills: the pad's own shape, as large as fits, in the middle. */
export function frame(w, h, aspect) {
  const fw = Math.min(w, h * aspect), fh = fw / aspect;
  return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
}

/** A fine speckle, made once per canvas, so the sand is not a flat colour. */
function grain(g) {
  if (g.__grain) return g.__grain;
  const c = g.canvas.ownerDocument.createElement('canvas');
  c.width = c.height = 128;
  const p = c.getContext('2d');
  let s = 7;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 2600; i++) { p.fillStyle = r() < 0.5 ? 'rgba(255,240,220,0.09)' : 'rgba(20,10,6,0.11)'; p.fillRect(r() * 128, r() * 128, 1.3, 1.3); }
  g.__grain = g.createPattern(c, 'repeat');
  return g.__grain;
}

/**
 * Paint the sand and what is written in it.
 *   g       a 2D canvas context already scaled so one unit is one css pixel
 *   w, h    the size of the canvas in css pixels
 *   mood    0 dusk, 1 night, 2 dawn
 *   strokes, aspect   what was written
 *   shown   how much of it has been written so far, 0 to 1 (it appears stroke by stroke, as it was made)
 *   wave    null, or { front: where the water's edge is, 0 (top) to 1 (bottom), back: true once it is running back }
 */
export function paint(g, w, h, mood, strokes, aspect, shown = 1, wave = null) {
  const L = SAND[mood] || SAND[0];
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, L.low); bg.addColorStop(1, L.top);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const speck = grain(g);
  if (speck) { g.fillStyle = speck; g.fillRect(0, 0, w, h); }

  const f = frame(w, h, aspect || 0.5), wide = Math.max(5, Math.min(w, h) * 0.021);
  const edgeY = wave ? wave.front * (h + 60) - 30 : -1e9;          // above this line the water is, or has been
  const total = pointsIn(strokes), upTo = Math.max(0, Math.min(1, shown)) * total;
  if (total && !(wave && wave.back)) {
    g.save();
    if (wave) { g.beginPath(); g.rect(0, edgeY, w, h - edgeY + 2); g.clip(); }       // what the water has reached is gone
    g.lineCap = 'round'; g.lineJoin = 'round';
    // a groove: the shadowed side, the cut itself, and the lit lip the finger pushed up
    for (const [dx, dy, style, k] of [[1.6, 1.8, `rgba(${L.edge},0.20)`, 1.0], [0, 0, `rgba(${L.groove},0.62)`, 1.0], [-0.6, -0.8, `rgba(${L.groove},0.45)`, 0.45]]) {
      g.strokeStyle = style; g.lineWidth = wide * k;
      let done = 0;
      for (const s of strokes) {
        if (done >= upTo) break;
        const n = Math.min(s.length / 2, Math.ceil(upTo - done));
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const x = f.x + s[i * 2] * f.w + dx, y = f.y + s[i * 2 + 1] * f.h + dy;
          if (i) g.lineTo(x, y); else { g.moveTo(x, y); g.lineTo(x + 0.01, y); }       // a single tap leaves a dot
        }
        g.stroke();
        done += s.length / 2;
      }
    }
    g.restore();
  }
  if (wave) {
    // the sheet of water, thin and glassy, and the line of foam at its edge
    const sheet = g.createLinearGradient(0, edgeY - h * 0.5, 0, edgeY);
    sheet.addColorStop(0, `rgba(${L.water},${wave.back ? 0.10 : 0.30})`); sheet.addColorStop(1, `rgba(${L.water},${wave.back ? 0.16 : 0.42})`);
    g.fillStyle = sheet; g.fillRect(0, 0, w, Math.max(0, edgeY));
    g.fillStyle = `rgba(${L.groove},${wave.back ? 0.16 : 0.0})`; g.fillRect(0, 0, w, h);          // sand the water has left is darker for a while
    g.strokeStyle = `rgba(${L.foam},0.92)`; g.lineWidth = wave.back ? 5 : 11; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (let x = -10; x <= w + 10; x += 14) { const y = edgeY + Math.sin(x * 0.045 + wave.front * 9) * 7 + Math.sin(x * 0.11 + wave.front * 17) * 3; if (x < 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = `rgba(${L.foam},0.35)`; g.lineWidth = 24;
    g.beginPath();
    for (let x = -10; x <= w + 10; x += 14) { const y = edgeY - 12 + Math.sin(x * 0.045 + wave.front * 9) * 7; if (x < 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
}
