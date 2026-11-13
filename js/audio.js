// The sound of the shore, made live from noise and a few tones. No audio files to download.

export class Shore {
  constructor() { this.ctx = null; this.on = true; }

  /** Must be called from a tap. */
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const out = this.out = ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.5);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    out.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 3, buf = this.buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6;
    }
    const noise = this.noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true; noise.start();
    const layer = (type, freq, q, gain) => {
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      noise.connect(f).connect(g).connect(out);
      return { f, g };
    };
    this.deep = layer('lowpass', 170, 0.4, 0.30);        // the open sea, always there
    this.rush = layer('bandpass', 900, 0.35, 0.0);       // a wave running up the sand
    this.hiss = layer('highpass', 3200, 0.3, 0.0);       // the same wave draining back through it

    // iOS mutes this kind of sound when the ring switch is off unless a media element is playing.
    try {
      const a = new Audio(silentWav());
      a.loop = true; a.volume = 0.01; a.setAttribute('playsinline', '');
      a.play().catch(() => {});
    } catch {}
    ctx.resume();
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** up: how fast the water's edge is moving up the beach (m/s, negative when draining). reach: 0 low .. 1 high. */
  surf(up, reach) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rise = Math.max(0, Math.min(1, up / 1.6)), fall = Math.max(0, Math.min(1, -up / 0.5));
    this.rush.g.gain.setTargetAtTime(0.06 + rise * 0.62, t, 0.12);
    this.rush.f.frequency.setTargetAtTime(520 + rise * 1300, t, 0.2);
    this.hiss.g.gain.setTargetAtTime(fall * 0.10 * (0.4 + reach * 0.6) + rise * 0.05, t, 0.25);
  }

  _burst(freq, q, peak, dur, when = 0, sweepTo = 0, type = 'bandpass') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = this.buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.006, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 2, dur + 0.05);
  }

  _tone(freq, peak, dur, when = 0, to = 0, attack = 0.005) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Something happened in the story. */
  play(what) {
    switch (what) {
      case 'ripple': this._tone(880, 0.10, 0.18, 0, 520); this._burst(1800, 2, 0.10, 0.12); break;
      case 'sighted': this._tone(1568, 0.05, 1.2); this._tone(2093, 0.035, 1.4, 0.12); break;
      case 'grab': this._burst(700, 1.5, 0.30, 0.16, 0, 300); this._tone(1900, 0.05, 0.12); break;          // wet glass, a splash
      case 'drop': this._burst(500, 1, 0.22, 0.2, 0, 200); break;
      case 'lift': for (let i = 0; i < 6; i++) this._tone(900 + Math.random() * 1400, 0.05, 0.07, 0.15 + i * 0.11 + Math.random() * 0.05, 1800 + Math.random() * 900); break; // drips
      case 'clink': this._tone(2140, 0.12, 0.5); this._tone(3210, 0.06, 0.35); this._tone(4480, 0.03, 0.2); break;
      case 'squeak': if (Math.random() < 0.5) this._tone(520 + Math.random() * 380, 0.045, 0.07, 0, 900 + Math.random() * 500); break;
      case 'pop': this._tone(210, 0.6, 0.16, 0, 70); this._burst(2200, 0.8, 0.5, 0.07); this._tone(1320, 0.07, 0.4, 0.03); break;
      case 'slide': if (Math.random() < 0.35) this._burst(4200 + Math.random() * 2500, 0.7, 0.07, 0.06 + Math.random() * 0.05, 0, 0, 'highpass'); break;
      case 'reveal':
        for (let i = 0; i < 5; i++) this._burst(3800 + Math.random() * 3000, 0.6, 0.10, 0.12, i * 0.13, 0, 'highpass');    // paper opening
        [392, 493.9, 587.3, 784].forEach((f, i) => this._tone(f, 0.055, 3.2, 0.5 + i * 0.16, 0, 0.6));                     // and a held breath of a chord
        break;
    }
  }
}

function silentWav() {
  const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
