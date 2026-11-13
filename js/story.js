// The story, step by step. No drawing and no DOM here, so it can be tested in Node.
//
//   arrive   an empty shore. "Touch the water."
//   adrift   a bottle rides in on the waves. Drag it up onto dry sand.
//   lift     it rises into your hands.
//   held     it turns with the phone and catches the light. Shake, or pull the cork.
//   open     the cork is out. Tip it over, or pull the note out.
//   reading  the note unrolls.
//
// Every step works by touch alone. Tilt and shake are extra ways to do the same things.

import { M, swash, DRY_LINE, CORK_SEAT, NOTE_SEAT } from './scene.js';

const LIE = 0.42;         // the bottle's length on the beach, metres
const HOLD = 0.50;        // and in your hands
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);

export class Story {
  /** view: { W, H, project(world), ground(sx, sy, y), basis() } */
  constructor(view) {
    this.view = view;
    this.state = 'arrive';
    this.t = 0;                 // scene time, seconds
    this.st = 0;                // time in this state
    this.events = [];           // things that just happened, for sound and haptics
    this.ripples = [];
    this.motion = false;        // is real tilt data arriving
    this.g = [0, 1]; this.g0 = [0, 1];
    // on the beach
    this.seen = false;
    this.bx = 0.3; this.bz = -3.4; this.yaw = 0.25; this.roll = 0; this.grab = null; this.afloat = true;
    // in the hands
    this.lift = 0;
    this.rz = 0; this.rx = 0; this.vz = 0; this.vx = 0;   // how it leans, and how fast that is changing
    this.dz = 0; this.dx = 0;                             // lean added by a finger
    this.spin = 0; this.vspin = 0.25;
    this.cork = 0; this.corkGrab = false; this.popped = false; this.fly = null;
    this.note = 0;
    this.ptr = null;
    this.idle = 0;              // seconds since the person last made progress, for the helping hand
    this.away = 0;              // the bottle sinking out of view once the note is being read
  }

  _go(state) { this.state = state; this.st = 0; this.idle = 0; this.events.push('state:' + state); }

  // ---------------------------------------------------------------- where things are

  /** The bottle lying in the surf. */
  _beach() {
    const bob = this.afloat ? 0.012 * Math.sin(this.t * 2.3) : 0;
    return { pos: [this.bx, 0.16 * LIE + 0.004 + bob, this.bz], rot: M.mul(M.rotY(this.yaw), M.mul(M.rotZ(-Math.PI / 2), M.rotY(this.roll))), size: LIE };
  }

  /** The bottle held up in front of the camera, upright, leaning with the phone. */
  _hands() {
    const b = this.view.basis(), d = 0.62;
    const pos = [b.pos[0] + b.f[0] * d + b.u[0] * (-0.035 - this.away), b.pos[1] + b.f[1] * d + b.u[1] * (-0.035 - this.away), b.pos[2] + b.f[2] * d + b.u[2] * (-0.035 - this.away)];
    const cam = [b.r[0], b.r[1], b.r[2], 0, b.u[0], b.u[1], b.u[2], 0, -b.f[0], -b.f[1], -b.f[2], 0, 0, 0, 0, 1];
    const lean = M.mul(M.rotZ(this.rz + this.dz), M.mul(M.rotX(this.rx + this.dx), M.rotY(this.spin)));
    return { pos, rot: M.mul(cam, lean), size: HOLD };
  }

  /** The bottle's place in the world, as a matrix. */
  bottleMatrix() {
    let p;
    if (this.state === 'arrive' || this.state === 'adrift') p = this._beach();
    else {
      const a = this._beach(), h = this._hands(), e = ease(clamp(this.lift, 0, 1));
      const rot = blendRot(a.rot, h.rot, e), arc = Math.sin(e * Math.PI) * 0.10;
      p = { pos: [a.pos[0] + (h.pos[0] - a.pos[0]) * e, a.pos[1] + (h.pos[1] - a.pos[1]) * e + arc, a.pos[2] + (h.pos[2] - a.pos[2]) * e], rot, size: a.size + (h.size - a.size) * e };
    }
    return M.mul(M.translate(p.pos[0], p.pos[1], p.pos[2]), M.mul(p.rot, M.scale(p.size)));
  }

  corkMatrix() {
    if (this.fly) {
      const f = this.fly;
      return M.mul(M.translate(f.p[0], f.p[1], f.p[2]), M.mul(f.rot, M.mul(M.rotX(f.a), M.mul(M.rotZ(f.a * 0.7), M.scale(f.size)))));
    }
    if (this.popped) return null;
    const wiggle = this.cork > 0 ? Math.sin(this.t * 38) * 0.004 * this.cork : 0;
    return M.mul(this.bottleMatrix(), M.mul(M.translate(wiggle, CORK_SEAT + this.cork * 0.022, 0), M.rotY(this.cork * 1.4)));
  }

  noteMatrix() {
    return M.mul(this.bottleMatrix(), M.translate(0, NOTE_SEAT + this.note * 0.80, 0));
  }

  /** A point on the bottle (its own coordinates), on screen. */
  onScreen(local) { return this.view.project(M.point(this.bottleMatrix(), local)); }

  /** Is the bottle in sight yet. */
  get visible() { return this.seen && this.away < 0.5; }

  // ---------------------------------------------------------------- what to say

  hint() {
    switch (this.state) {
      case 'arrive': return 'Touch the water';
      case 'adrift':
        if (!this.seen) return this.st > 0.8 ? 'Something is drifting in' : '';
        if (this.grab) return this.bz > DRY_LINE ? 'Let go' : 'Keep going, up onto the dry sand';
        return 'Drag the bottle up onto the dry sand';
      case 'held':
        if (this.cork > 0.08) return 'Nearly. Keep going';
        return this.motion ? 'Tilt it to the light. Then shake it, or pull the cork up' : 'Drag to turn it. Then pull the cork up';
      case 'open':
        if (this.note > 0.08) return 'Keep pulling';
        return this.motion ? 'Tip it upside down, or pull the note up and out' : 'Pull the note up and out';
      default: return '';
    }
  }

  /** After a pause, show a ghost finger doing the next move: { from:[x,y], to:[x,y] } in screen px, or null. */
  cue() {
    if (this.idle < 5 || this.ptr) return null;
    if (this.state === 'adrift' && this.seen) {
      const a = this.onScreen([0, 0, 0]), dry = this.view.project([this.bx * 0.6, 0, DRY_LINE + 0.55]);
      return { from: [a.x, a.y], to: [dry.x, dry.y] };
    }
    if (this.state === 'held') { const c = this.onScreen([0, CORK_SEAT + 0.03, 0]); return { from: [c.x, c.y], to: [c.x, c.y - this.view.H * 0.16] }; }
    if (this.state === 'open') { const c = this.onScreen([0, 0.30, 0]); return { from: [c.x, c.y], to: [c.x, c.y - this.view.H * 0.22] }; }
    return null;
  }

  // ---------------------------------------------------------------- touch

  down(x, y) {
    this.ptr = { x, y, x0: x, y0: y, moved: 0 };
    if (this.state === 'arrive') {
      this._ripple(x, y);
      this.events.push('touch');
      this._go('adrift');
      return;
    }
    if (this.state === 'adrift') {
      const c = this.onScreen([0, 0, 0]);
      if (this.seen && Math.hypot(x - c.x, y - c.y) < Math.max(64, this.view.H * 0.085)) { this.grab = { ox: 0, oz: 0 }; this.events.push('grab'); this.idle = 0; }
      else this._ripple(x, y);
      return;
    }
    if (this.state === 'held') {
      const c = this.onScreen([0, CORK_SEAT + 0.02, 0]);
      this.corkGrab = Math.hypot(x - c.x, y - c.y) < Math.max(84, this.view.H * 0.11);
    }
  }

  move(x, y) {
    const p = this.ptr;
    if (!p) return;
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y; p.moved += Math.hypot(dx, dy);
    if (this.state === 'adrift' && this.grab) {
      const w = this.view.ground(x, y, 0.07);
      if (w) { this.bx = clamp(w[0], -1.5, 1.5); this.bz = clamp(w[2], -1.6, 2.05); this.roll += dx * 0.01; }
      this.idle = 0;
    } else if (this.state === 'held') {
      if (this.corkGrab) {
        // pulling up draws the cork; working it side to side helps too
        // A short pull is enough: the cork sits near the top of the screen, so there is not far to go.
        const gain = Math.max(0, -dy) / (this.view.H * 0.11) + Math.abs(dx) / (this.view.H * 0.40);
        if (gain > 0) { this.cork = Math.min(1, this.cork + gain); this.idle = 0; this.events.push('squeak'); }
      } else {
        this.vspin += dx * 0.012; this.dx = clamp(this.dx + dy * 0.004, -0.6, 0.6); this.dz = clamp(this.dz - dx * 0.0012, -0.5, 0.5);
      }
    } else if (this.state === 'open') {
      if (dy < 0) { this.note = Math.min(1, this.note + -dy / (this.view.H * 0.20)); this.idle = 0; this.events.push('slide'); }
      this.vspin += dx * 0.006;
    }
  }

  up() {
    if (this.state === 'adrift' && this.grab) {
      this.grab = null;
      if (this.bz > DRY_LINE) { this.events.push('lift'); this.g0 = [this.g[0], this.g[1]]; this._go('lift'); }
      else this.events.push('drop');
    }
    this.corkGrab = false;
    this.ptr = null;
  }

  _ripple(x, y) {
    const w = this.view.ground(x, y, 0);
    if (!w) return;
    this.ripples.push({ x: w[0], z: w[2], t0: this.t });
    if (this.ripples.length > 3) this.ripples.shift();
    this.events.push('ripple');
  }

  // ---------------------------------------------------------------- tilt and shake

  /** gx, gy: gravity in the plane of the screen, in g (x right, y toward the bottom). */
  tilt(gx, gy) { this.g = [gx, gy]; this.motion = true; }

  /** A jolt, in m/s^2 beyond gravity. Several of them work the cork loose. */
  shake(mag) {
    if (this.state !== 'held' || mag < 9) return;
    if (this.t - (this._lastShake || -9) < 0.14) return;
    this._lastShake = this.t;
    this.cork = Math.min(1, this.cork + 0.2 + Math.min(0.15, (mag - 9) * 0.012));
    this.vz += (Math.random() - 0.5) * 3;
    this.idle = 0;
    this.events.push('squeak');
  }

  // ---------------------------------------------------------------- time

  update(dt) {
    this.t += dt; this.st += dt; this.idle += dt;
    for (const r of this.ripples) r.age = this.t - r.t0;
    this.ripples = this.ripples.filter((r) => r.age < 2.6);

    if (this.state === 'adrift') this._drift(dt);
    else if (this.state === 'lift') {
      this.lift = Math.min(1, this.lift + dt / 1.25);
      if (this.lift >= 1) { this.events.push('clink'); this._go('held'); }
    }
    if (this.state === 'held' || this.state === 'open' || this.state === 'reading' || this.state === 'lift') this._sway(dt);

    if (this.state === 'held') {
      if (this.cork >= 1) this._pop();
      else if (!this.corkGrab) this.cork = Math.max(0, this.cork - dt * 0.07);   // left alone, it eases back in
    }
    if (this.fly) {
      const f = this.fly;
      f.v[1] -= 3.2 * dt;
      for (let k = 0; k < 3; k++) f.p[k] += f.v[k] * dt;
      f.a += dt * 11; f.life -= dt;
      if (f.life <= 0) this.fly = null;
    }
    if (this.state === 'open') {
      // with the phone tipped past level, the note slides out under its own weight
      if (this.motion && this.g[1] < -0.2) { this.note = Math.min(1, this.note + (-this.g[1] - 0.1) * 1.5 * dt); this.idle = 0; if (Math.random() < 0.2) this.events.push('slide'); }
      if (this.note >= 1) { this.events.push('reveal'); this._go('reading'); }
    }
    if (this.state === 'reading') this.away = Math.min(1.2, this.away + dt * 0.55);
  }

  _drift(dt) {
    if (this.st < 1.4) return;                          // a beat of empty sea first
    if (!this.seen) { this.seen = true; this.events.push('sighted'); }
    if (this.grab) { this.afloat = swash(this.bx, this.t) > this.bz; return; }
    const zs = swash(this.bx, this.t), was = this.bz;
    const rising = swash(this.bx, this.t + 0.05) > zs;
    if (this.bz < -0.75) {
      this.bz += (0.95 + 0.5 * Math.sin(this.t * 1.3)) * dt;                // riding in from the open water
      this.afloat = true;
    } else if (zs > this.bz + 0.04) {
      this.bz += (zs - 0.10 - this.bz) * Math.min(1, 3.2 * dt);             // the wave has it: carried up the beach
      this.afloat = true;
    } else {
      this.afloat = false;                                                  // left on the wet sand
      if (!rising && this.bz - zs < 0.5) this.bz -= 0.20 * dt;              // the backwash tugs at it
    }
    this.bz = Math.min(this.bz, DRY_LINE - 0.13);                           // the sea never quite gives it up: that part is yours
    const moved = this.bz - was;
    this.roll += moved * 7;
    this.bx += Math.sin(this.t * 0.6) * 0.03 * dt * (this.afloat ? 1 : 0);
    this.yaw = 0.25 + 0.22 * Math.sin(this.t * 0.5) * (this.afloat ? 1 : 0.3);
  }

  // The bottle hangs in your hand like a weight: it follows the phone's tilt, late, and rocks a little before settling.
  _sway(dt) {
    let tz = 0, tx = 0;
    if (this.motion) { tz = clamp(-(this.g[0] - this.g0[0]) * 1.15, -0.75, 0.75); tx = clamp((this.g[1] - this.g0[1]) * 0.9, -0.65, 0.65); }
    else { tz = 0.10 * Math.sin(this.t * 0.9); tx = 0.05 * Math.sin(this.t * 0.7 + 1); }   // no sensor: a slow sway keeps it alive
    const k = 46, c = 4.6;
    this.vz += ((tz - this.rz) * k - this.vz * c) * dt; this.rz += this.vz * dt;
    this.vx += ((tx - this.rx) * k - this.vx * c) * dt; this.rx += this.vx * dt;
    if (!this.ptr) { this.dz *= Math.exp(-dt * 1.2); this.dx *= Math.exp(-dt * 1.2); }
    this.vspin += (0.22 - this.vspin) * Math.min(1, dt * 1.1);
    this.spin += this.vspin * dt;
  }

  _pop() {
    const m = this.bottleMatrix();
    const at = M.point(m, [0, CORK_SEAT + 0.05, 0]), base = M.point(m, [0, 0, 0]);
    const ax = [at[0] - base[0], at[1] - base[1], at[2] - base[2]], al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    this.fly = { p: at, v: [ax[0] / al * 2.0, ax[1] / al * 2.0 + 0.6, ax[2] / al * 2.0], rot: this._hands().rot, a: 0, life: 1.5, size: HOLD };
    this.popped = true; this.cork = 1;
    this.vz += 2.2;
    this.events.push('pop');
    this._go('open');
  }
}

/** Blend two rotations (for the lift), keeping the axes square. */
function blendRot(a, b, e) {
  const col = (m, c) => [m[c * 4] * 1, m[c * 4 + 1], m[c * 4 + 2]];
  const mix = (p, q) => [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e, p[2] + (q[2] - p[2]) * e];
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let y = nrm(mix(col(a, 1), col(b, 1)));
  let x = mix(col(a, 0), col(b, 0));
  let z = nrm(crs(x, y));
  if (!isFinite(z[0]) || Math.hypot(z[0], z[1], z[2]) < 0.5) z = nrm(mix(col(a, 2), col(b, 2)));
  x = crs(y, z);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1];
}
