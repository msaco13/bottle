// The same shore, painted flat. This is the safety net: if a phone will not give us 3D
// (Safari refused it, Lockdown Mode is on, the graphics chip died mid-story), the story
// carries on here instead of stopping. Same camera, same sea line, same bottle in the
// same place, so every drag, pull and pop works exactly as it does in 3D.
//
// Plain canvas drawing only. No images, nothing to download.

import { M, swash, Camera, SUNS, BOTTLE, CORK, NOTE } from './scene.js';

// sky from the horizon up, the sea far and near, sand far and near, foam, the sun or moon and its glow: dusk, night, dawn
const LOOK = [
  { sky: ['#ff8038', '#e05c61', '#664278', '#171f4d', '#070a22'], sea: ['#c8643f', '#16323c'], sand: ['#6b5244', '#8a6a52'], wet: '#4a3a3a', foam: '#e6cbc6', sun: '#ffe9bf', glow: '255,150,70', glint: '255,200,130', glass: ['#bdf5e6', '#5fae9c', '#12403a'], paper: '#f6ecd6', dim: 1 },
  { sky: ['#1c2b4f', '#121d40', '#0a122b', '#05091a', '#02030b'], sea: ['#1a2a4c', '#030912'], sand: ['#2a2d3f', '#3a3f55'], wet: '#151a2a', foam: '#7fd9ea', sun: '#eef4ff', glow: '120,150,220', glint: '190,215,255', glass: ['#9fd9d2', '#3f7f80', '#0a2a2c'], paper: '#c9cde0', dim: 0.8 },
  { sky: ['#ffcc94', '#fcad9e', '#bda3cc', '#7094d6', '#4a6cb5'], sea: ['#f0b890', '#2f5f6c'], sand: ['#8a6f5a', '#b08a6a'], wet: '#6a5850', foam: '#fdf0ea', sun: '#fff8e0', glow: '255,210,140', glint: '255,236,190', glass: ['#d6fff4', '#7fc9b6', '#1f5a52'], paper: '#fbf3df', dim: 1.1 },
];

const seeded = (n) => { let s = n * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

export class Flat extends Camera {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('no drawing surface at all');
    this.flat = true;
    this.lost = false;
    const r = seeded(7);
    this.stars = Array.from({ length: 70 }, () => [r(), r(), 0.4 + r() * 0.6, r() * 6.3]);
    this.clouds = Array.from({ length: 5 }, () => [r(), 0.10 + r() * 0.55, 0.16 + r() * 0.22, 0.5 + r() * 0.5]);
    this.grain = null;
  }

  info() { return `2D beach | ${this.canvas.width}x${this.canvas.height}`; }
  dispose() { try { this.canvas.width = 1; this.canvas.height = 1; } catch (e) { /* nothing to do */ } }

  resize(w, h, scale) {
    this.W = w; this.H = h;
    this.scale = Math.min(scale, 1.5);                  // painting is done on the phone's main chip: keep the picture light
    const pw = Math.max(2, Math.round(w * this.scale)), ph = Math.max(2, Math.round(h * this.scale));
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
  }

  /** A fine speckle for the sand, made once. */
  _grain() {
    if (this.grain || typeof document === 'undefined') return this.grain;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    if (!g) return null;
    const r = seeded(3);
    for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,220,0.10)' : 'rgba(30,15,10,0.12)'; g.fillRect(r() * 96, r() * 96, 1.2, 1.2); }
    this.grain = this.ctx.createPattern(c, 'repeat');
    return this.grain;
  }

  /** s: the same thing the 3D scene is given. */
  draw(s) {
    const g = this.ctx, W = this.W, H = this.H, L = LOOK[this.mood] || LOOK[0], t = s.time || 0;
    const vp = this.viewProj(), b = this.basis();
    const P = (w) => {
      const x = vp[0] * w[0] + vp[4] * w[1] + vp[8] * w[2] + vp[12], y = vp[1] * w[0] + vp[5] * w[1] + vp[9] * w[2] + vp[13], q = vp[3] * w[0] + vp[7] * w[1] + vp[11] * w[2] + vp[15];
      return [(x / q * 0.5 + 0.5) * W, (1 - (y / q * 0.5 + 0.5)) * H, q];
    };
    const far = (d) => P([b.pos[0] + d[0] * 900, b.pos[1] + d[1] * 900, b.pos[2] + d[2] * 900]);
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // ---- sky
    const hy = far([0, 0, -1])[1];                       // the horizon, on screen
    const up = (h) => far([0, h, -Math.sqrt(1 - h * h)])[1];
    const top = Math.min(up(0.6), hy - 40);
    const sky = g.createLinearGradient(0, hy, 0, top);
    const at = (h) => Math.max(0, Math.min(1, (hy - up(h)) / (hy - top)));
    sky.addColorStop(0, L.sky[0]); sky.addColorStop(at(0.10), L.sky[1]); sky.addColorStop(at(0.26), L.sky[2]); sky.addColorStop(1, L.sky[3]);
    g.fillStyle = sky;
    g.fillRect(0, -1, W, hy + 2);

    if (this.mood === 1) {
      for (const [u, v, k, ph] of this.stars) {
        g.globalAlpha = k * (0.55 + 0.45 * Math.sin(t * 2 + ph));
        g.fillStyle = '#eef2ff';
        g.fillRect(u * W, v * hy * 0.92, 1.4, 1.4);
      }
      g.globalAlpha = 1;
    }
    const sun = far(SUNS[this.mood] || SUNS[0]);
    const sunR = Math.max(9, 0.028 * (H / 2) / b.ty);
    g.globalCompositeOperation = 'lighter';
    let halo = g.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], sunR * 11);
    halo.addColorStop(0, `rgba(${L.glow},0.55)`); halo.addColorStop(0.35, `rgba(${L.glow},0.18)`); halo.addColorStop(1, `rgba(${L.glow},0)`);
    g.fillStyle = halo;
    g.fillRect(0, 0, W, hy);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = L.sun;
    g.beginPath(); g.arc(sun[0], sun[1], sunR, 0, 6.283); g.fill();
    if (this.mood === 1) {                               // the grey seas on the moon
      g.fillStyle = 'rgba(120,135,170,0.28)';
      g.beginPath(); g.arc(sun[0] - sunR * 0.3, sun[1] - sunR * 0.2, sunR * 0.34, 0, 6.283); g.arc(sun[0] + sunR * 0.28, sun[1] + sunR * 0.3, sunR * 0.26, 0, 6.283); g.fill();
    }
    for (const [u, v, w, k] of this.clouds) {
      const cx = ((u + t * 0.0016 * k) % 1.3 - 0.15) * W, cy = hy - v * (hy - Math.max(0, top)) * 0.9 - 14, rw = w * W, rh = rw * 0.22;
      const c = g.createRadialGradient(cx, cy, 0, cx, cy, rw);
      const tone = this.mood === 1 ? '10,14,30' : this.mood === 2 ? '250,205,190' : '90,50,80';
      c.addColorStop(0, `rgba(${tone},0.42)`); c.addColorStop(1, `rgba(${tone},0)`);
      g.save(); g.translate(cx, cy); g.scale(1, rh / rw); g.translate(-cx, -cy);
      g.fillStyle = c; g.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);
      g.restore();
    }

    // ---- sand, everywhere below the horizon first
    const sand = g.createLinearGradient(0, hy, 0, H);
    sand.addColorStop(0, L.sand[0]); sand.addColorStop(1, L.sand[1]);
    g.fillStyle = sand;
    g.fillRect(0, hy, W, H - hy + 1);
    const grain = this._grain();
    if (grain) { g.fillStyle = grain; g.fillRect(0, hy, W, H - hy + 1); }

    // ---- the water's edge right now, and the line the last wave reached
    const edge = [], wetline = [];
    const reach = 1.3 + 2.4 * W / H;                   // far enough either side to run off the picture, upright or on its side
    for (let i = 0; i <= 90; i++) {
      const x = -reach + i * reach / 45;
      edge.push(P([x, 0, swash(x, t)]));
      wetline.push(P([x, 0, 0.90 + 0.11 * Math.sin(x * 2.1) + 0.05 * Math.sin(x * 5.3 + 1.0)]));
    }
    const line = (pts, back) => { if (back) for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1]); else for (const p of pts) g.lineTo(p[0], p[1]); };
    g.beginPath(); g.moveTo(edge[0][0], edge[0][1]); line(edge); line(wetline, true); g.closePath();
    g.fillStyle = L.wet; g.globalAlpha = 0.62; g.fill(); g.globalAlpha = 1;

    // ---- the sea
    g.beginPath(); g.moveTo(-2, hy); g.lineTo(W + 2, hy); line(edge, true); g.closePath();
    const zs0 = swash(0, t), shore = P([0, 0, zs0])[1];
    const sea = g.createLinearGradient(0, hy, 0, Math.max(hy + 2, shore));
    sea.addColorStop(0, L.sea[0]); sea.addColorStop(0.5, L.sea[1]); sea.addColorStop(1, L.sea[1]);
    g.fillStyle = sea; g.fill();
    g.save(); g.clip();
    // rollers coming in, and the long glitter under the sun
    for (let k = 0; k < 22; k++) {
      const z = zs0 - 0.35 - Math.pow(k + ((t * 0.12) % 1), 1.7) * 0.62;
      const y = P([0, 0, z])[1];
      if (y < hy + 1) continue;
      const near = Math.min(1, (y - hy) / Math.max(1, shore - hy));
      g.strokeStyle = `rgba(${L.glint},${0.06 + 0.10 * near})`;
      g.lineWidth = 1 + near * 3;
      g.beginPath();
      for (let x = -10; x <= W + 10; x += 24) { const yy = y + Math.sin(x * 0.02 + t * 0.9 + k) * (1 + near * 3); if (x < 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
      const wide = (12 + near * 70) * (0.6 + 0.4 * Math.sin(t * 3 + k * 1.7));
      g.strokeStyle = `rgba(${L.glint},${0.30 + 0.38 * near})`;
      g.lineWidth = 1.5 + near * 3.5;
      g.beginPath(); g.moveTo(sun[0] - wide, y); g.lineTo(sun[0] + wide, y); g.stroke();
      g.lineWidth = 1 + near * 2;
      g.beginPath(); g.moveTo(sun[0] - wide * 1.9, y + 3 + near * 5); g.lineTo(sun[0] - wide * 1.2, y + 3 + near * 5); g.moveTo(sun[0] + wide * 1.3, y - 2 - near * 4); g.lineTo(sun[0] + wide * 2.1, y - 2 - near * 4); g.stroke();
    }
    g.restore();
    // foam along the edge. At night it glows.
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (this.mood === 1) { g.strokeStyle = 'rgba(60,220,240,0.22)'; g.lineWidth = 26; g.beginPath(); g.moveTo(edge[0][0], edge[0][1]); line(edge); g.stroke(); }
    g.strokeStyle = L.foam;
    g.globalAlpha = 0.22; g.lineWidth = 26;
    g.beginPath(); g.moveTo(edge[0][0], edge[0][1] - 9); for (const p of edge) g.lineTo(p[0], p[1] - 9); g.stroke();
    g.globalAlpha = 0.9; g.lineWidth = 8;
    g.beginPath(); g.moveTo(edge[0][0], edge[0][1] - 3); for (const p of edge) g.lineTo(p[0], p[1] - 3); g.stroke();
    // lace: thinner lines of foam riding in behind the edge
    for (let k = 1; k <= 2; k++) {
      g.globalAlpha = 0.34 / k; g.lineWidth = 3.5 - k;
      g.beginPath();
      edge.forEach((p, i) => { const y = p[1] - 12 * k - 4 * Math.sin(p[0] * 0.045 * k + t * (0.8 + 0.3 * k)); if (i) g.lineTo(p[0], y); else g.moveTo(p[0], y); });
      g.stroke();
    }
    g.globalAlpha = 1;

    // ---- rings where a finger touched the water
    for (const r of s.ripples || []) {
      if (!(r.age >= 0)) continue;
      const c = P([r.x, 0, r.z]), ex = P([r.x + r.age * 0.85, 0, r.z]), ez = P([r.x, 0, r.z + r.age * 0.85]);
      g.strokeStyle = this.mood === 1 ? '#6fe6f2' : L.foam; g.globalAlpha = Math.max(0, 1 - r.age / 2.4) * 0.8; g.lineWidth = 2;
      g.beginPath(); g.ellipse(c[0], c[1], Math.abs(ex[0] - c[0]) + 1, Math.abs(ez[1] - c[1]) + 1, 0, 0, 6.283); g.stroke();
    }
    g.globalAlpha = 1;

    // ---- the lantern, when this phone is listening for bottles
    if (this.lamp) {
      const f = 0.86 + 0.14 * Math.sin(t * 9) * Math.sin(t * 5.3), lp = P([0.27, 0.10, 1.16]), pool = P([0.27, 0, 1.16]);
      g.globalCompositeOperation = 'lighter';
      let c = g.createRadialGradient(pool[0], pool[1], 0, pool[0], pool[1], W * 0.34);
      c.addColorStop(0, `rgba(255,150,60,${0.34 * f})`); c.addColorStop(1, 'rgba(255,150,60,0)');
      g.save(); g.translate(pool[0], pool[1]); g.scale(1, 0.36); g.translate(-pool[0], -pool[1]); g.fillStyle = c; g.fillRect(pool[0] - W, pool[1] - W, W * 2, W * 2); g.restore();
      c = g.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], 26);
      c.addColorStop(0, `rgba(255,236,180,${f})`); c.addColorStop(0.25, `rgba(255,170,80,${0.55 * f})`); c.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = c; g.fillRect(lp[0] - 30, lp[1] - 30, 60, 60);
      g.globalCompositeOperation = 'source-over';
    }

    // ---- the bottle's shadow on the sand
    const sh = s.shadow;
    if (sh && sh[3] > 0) {
      const c = P([sh[0], 0, sh[1]]), ex = P([sh[0] + sh[2] * 1.2, 0, sh[1]]), ez = P([sh[0], 0, sh[1] + sh[2] * 0.8]);
      const rx = Math.abs(ex[0] - c[0]) + 2, ry = Math.abs(ez[1] - c[1]) + 2;
      const sd = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], rx);
      sd.addColorStop(0, 'rgba(8,6,14,0.42)'); sd.addColorStop(0.6, 'rgba(8,6,14,0.22)'); sd.addColorStop(1, 'rgba(8,6,14,0)');
      g.save(); g.translate(c[0], c[1]); g.scale(1, ry / rx); g.translate(-c[0], -c[1]); g.fillStyle = sd; g.fillRect(c[0] - rx, c[1] - rx, rx * 2, rx * 2); g.restore();
    }

    // ---- the edges of the picture fall away, and the beach dims when the bottle is in your hands
    const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
    if (s.dim > 0) { g.fillStyle = `rgba(6,5,14,${Math.min(0.75, s.dim * 0.55)})`; g.fillRect(0, 0, W, H); }

    if (!s.bottle) return;

    // ---- the bottle, the note inside it, the cork. Each is a shape turned about its own axis, seen from the side.
    const shape = (m, profile) => {
      const size = Math.hypot(m[0], m[1], m[2]);
      const pts = profile.map(([r, y]) => {
        const c = M.point(m, [0, y, 0]), p = P(c), q = P([c[0] + b.r[0] * r * size, c[1] + b.r[1] * r * size, c[2] + b.r[2] * r * size]);
        return [p[0], p[1], Math.hypot(q[0] - p[0], q[1] - p[1])];
      });
      const a = pts[0], z = pts[pts.length - 1];
      let nx = -(z[1] - a[1]), ny = z[0] - a[0];
      const l = Math.hypot(nx, ny);
      if (l < 2) { nx = 1; ny = 0; } else { nx /= l; ny /= l; }
      return { pts, nx, ny, len: l };
    };
    const trace = (sp) => {
      g.beginPath();
      sp.pts.forEach((p, i) => { const x = p[0] + sp.nx * p[2], y = p[1] + sp.ny * p[2]; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      for (let i = sp.pts.length - 1; i >= 0; i--) { const p = sp.pts[i]; g.lineTo(p[0] - sp.nx * p[2], p[1] - sp.ny * p[2]); }
      g.closePath();
    };
    const across = (sp, i, stops) => {                    // a gradient from one side of the shape to the other, at point i
      const p = sp.pts[Math.min(sp.pts.length - 1, i)], w = Math.max(2, p[2]);
      const gr = g.createLinearGradient(p[0] + sp.nx * w, p[1] + sp.ny * w, p[0] - sp.nx * w, p[1] - sp.ny * w);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      return gr;
    };
    const glass = shape(s.bottle, BOTTLE);
    // the glass, seen through
    trace(glass);
    g.globalAlpha = 0.5;
    g.fillStyle = across(glass, 5, [[0, L.glass[2]], [0.22, L.glass[1]], [0.5, L.glass[0]], [0.78, L.glass[1]], [1, L.glass[2]]]);
    g.fill();
    g.globalAlpha = 1;
    // the note: rolled paper with a red thread
    if (s.note) {
      const note = shape(s.note, NOTE);
      trace(note);
      g.fillStyle = across(note, 3, [[0, '#b9a98a'], [0.3, L.paper], [0.62, L.paper], [1, '#a8987c']]);
      g.fill();
      const mid = P(M.point(s.note, [0, -0.10, 0])), w = note.pts[3][2];
      g.strokeStyle = '#a32a22'; g.lineWidth = Math.max(1.5, w * 0.22);
      g.beginPath(); g.moveTo(mid[0] + note.nx * w, mid[1] + note.ny * w); g.lineTo(mid[0] - note.nx * w, mid[1] - note.ny * w); g.stroke();
    }
    // the cork
    if (s.cork) {
      const cork = shape(s.cork, CORK);
      trace(cork);
      g.fillStyle = across(cork, 3, [[0, '#6e4a26'], [0.4, '#c09058'], [1, '#70491f']]);
      g.fill();
    }
    // the glass, its surface: a darker rim, a bright edge, and the long streak of light every bottle carries
    trace(glass);
    g.fillStyle = across(glass, 5, [[0, 'rgba(8,40,36,0.55)'], [0.16, 'rgba(8,40,36,0)'], [0.84, 'rgba(8,40,36,0)'], [1, 'rgba(8,40,36,0.6)']]);
    g.fill();
    g.strokeStyle = this.mood === 1 ? 'rgba(170,215,225,0.55)' : 'rgba(235,255,248,0.6)';
    g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = this.mood === 1 ? 'rgba(200,225,255,0.5)' : 'rgba(255,255,255,0.72)';
    g.lineWidth = Math.max(1.5, glass.pts[5][2] * 0.13); g.lineCap = 'round';
    g.beginPath();
    for (let i = 3; i <= 8; i++) { const p = glass.pts[i], k = 0.58; if (i === 3) g.moveTo(p[0] + glass.nx * p[2] * k, p[1] + glass.ny * p[2] * k); else g.lineTo(p[0] + glass.nx * p[2] * k, p[1] + glass.ny * p[2] * k); }
    g.stroke();
  }
}
