/* Message in a bottle. Built from js/ by build.mjs. Do not edit: edit js/ and rebuild. */
(function () {
'use strict';
const __m = {};

// ---------------------------------------------------------------- code.js
__m.code = (function () {
// The message lives in the link itself, after the #. Nothing has to be stored anywhere
// for a bottle to open, and the part after # is never sent to the web host.
//
// Format: "1." followed by base64url of the UTF-8 bytes of a JSON list:
//   [message]                              the first bottles
//   [message, name]
//   [message, name, mood, to, key]         added later, all optional:
//        mood  "n" night, "a" dawn. Missing means dusk.
//        to    who it is addressed to (set when someone sends one back)
//        key   the secret of the conversation this bottle belongs to (see thread.js)
//   [message, name, mood, to, key, claim]  added later still, optional:
//        claim the one seat this bottle carries: the first phone to open it joins the conversation
// Plain base64 on purpose (no compression): it opens on every phone, old or new.
//
// PROMISE: every link ever made must keep opening. New things may only be added
// to the END of the list, and must be optional. test/code.test.mjs holds real
// old links and fails if one of them ever reads differently.

const MAX_MESSAGE = 600;
const MAX_NAME = 40;
const MOODS = { dusk: '', night: 'n', dawn: 'a' };
const MOOD_OF = { n: 'night', a: 'dawn' };

/** bottle: { message, name, mood, to, key, claim } */
function encode(message, name = '', mood = 'dusk', to = '', key = '', claim = '') {
  const list = [
    String(message).slice(0, MAX_MESSAGE),
    String(name || '').trim().slice(0, MAX_NAME),
    MOODS[mood] || '',
    String(to || '').trim().slice(0, MAX_NAME),
    /^[A-Za-z0-9_-]{16,32}$/.test(key || '') ? key : '',
    /^[A-Za-z0-9_-]{8,32}$/.test(claim || '') ? claim : '',
  ];
  while (list.length > 1 && list[list.length - 1] === '') list.pop();   // old-style links stay exactly as they were
  const bytes = new TextEncoder().encode(JSON.stringify(list));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return '1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns { message, name, mood, to, key, claim } or null if this is not a bottle. Never throws. */
function decode(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '');
    // Some apps wrap or escape links. Be forgiving about what comes back.
    try { s = decodeURIComponent(s); } catch {}
    s = s.replace(/\s+/g, '');
    if (!s.startsWith('1.')) return null;
    let b = s.slice(2).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    while (b.length % 4) b += '=';
    const bin = atob(b), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !v[0].trim()) return null;
    const str = (x) => (typeof x === 'string' ? x : '');
    return {
      message: v[0].slice(0, MAX_MESSAGE),
      name: str(v[1]).slice(0, MAX_NAME),
      mood: MOOD_OF[v[2]] || 'dusk',
      to: str(v[3]).slice(0, MAX_NAME),
      key: /^[A-Za-z0-9_-]{16,32}$/.test(str(v[4])) ? v[4] : '',
      claim: /^[A-Za-z0-9_-]{8,32}$/.test(str(v[5])) ? v[5] : '',
    };
  } catch {
    return null;
  }
}

function linkFor(base, b) {
  return String(base).replace(/[#?].*$/, '') + '#' + encode(b.message, b.name, b.mood, b.to, b.key, b.claim);
}

return { MAX_MESSAGE, MAX_NAME, MOODS, encode, decode, linkFor };
})();

// ---------------------------------------------------------------- scene.js
__m.scene = (function () {
// The shoreline at dusk, and the bottle. Raw WebGL, no libraries, so it loads fast on a phone.
//
// The beach is not a 3D model. Every pixel casts a ray from the camera: if it
// points above the horizon it is sky, otherwise it lands on the ground, and the
// shader works out whether that spot is dry sand, wet sand or sea right now.
// The bottle, cork and note are real 3D shapes drawn over it. The glass bends
// the beach behind it and reflects the same sky.

// ---------------------------------------------------------------- small maths

const M = {
  ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  translate: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scale: (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
  rotX: (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  },
  point(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Where the edge of the water is right now, at a place along the beach.
 * The sea is toward -z, the person stands at +z. A wave rushes up the sand fast and drains back slowly.
 * The same sum is written in the shader below. Keep the two in step.
 */
function swash(x, t) {
  const ph = (((t / 7 - x * 0.035) % 1) + 1) % 1;
  const s = ph < 0.3 ? 1 - Math.pow(1 - ph / 0.3, 3) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - 0.3) / 0.7);
  return -0.55 + 1.25 * s + 0.11 * Math.sin(x * 2.1 + t * 0.5) + 0.06 * Math.sin(x * 5.3 - t * 0.8);
}
/** The highest the water ever reaches. Past this the sand is dry. */
const DRY_LINE = 0.98;

/** The three skies a bottle can arrive under, and where the sun or moon hangs in each. */
const MOOD = { dusk: 0, night: 1, dawn: 2 };
const SUNS = [[-0.1385, 0.0940, -0.9859], [0.160, 0.190, -0.969], [0.100, 0.060, -0.993]];

// ---------------------------------------------------------------- shaders

const SKY = `
uniform float uTime;
uniform float uMood;          // 0 dusk, 1 moonlit night, 2 dawn
uniform vec3 uSun;            // where the sun (or the moon) hangs
#define SUN uSun
vec3 pick(vec3 a, vec3 b, vec3 c) { return uMood < 0.5 ? a : (uMood < 1.5 ? b : c); }
float pickf(float a, float b, float c) { return uMood < 0.5 ? a : (uMood < 1.5 ? b : c); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
uniform sampler2D uNoise;
float vnoise(vec2 p) { return texture2D(uNoise, (p + 0.5) / 256.0).r; }
float fbm(vec2 p) { return 0.52 * vnoise(p) + 0.26 * vnoise(p * 2.03 + 3.1) + 0.14 * vnoise(p * 4.1 + 7.7) + 0.08 * vnoise(p * 8.3 + 1.3); }
// Dusk: a band of orange on the horizon, rose above it, then deep blue.
// Night: blue-black with a cold glow round the moon. Dawn: peach on the horizon under pale blue.
vec3 sky(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 c = mix(pick(vec3(1.00, 0.50, 0.22), vec3(0.11, 0.17, 0.31), vec3(1.00, 0.80, 0.58)), pick(vec3(0.88, 0.36, 0.38), vec3(0.07, 0.115, 0.25), vec3(0.99, 0.68, 0.62)), smoothstep(0.0, 0.10, h));
  c = mix(c, pick(vec3(0.40, 0.26, 0.47), vec3(0.04, 0.07, 0.17), vec3(0.74, 0.64, 0.80)), smoothstep(0.06, 0.26, h));
  c = mix(c, pick(vec3(0.09, 0.12, 0.30), vec3(0.02, 0.035, 0.10), vec3(0.44, 0.58, 0.84)), smoothstep(0.20, 0.60, h));
  c = mix(c, pick(vec3(0.025, 0.04, 0.13), vec3(0.008, 0.012, 0.045), vec3(0.24, 0.38, 0.68)), smoothstep(0.55, 1.0, h));
  float sd = max(dot(d, SUN), 0.0);
  c += pick(vec3(1.0, 0.52, 0.22), vec3(0.30, 0.40, 0.65), vec3(1.0, 0.74, 0.46)) * pow(sd, 6.0) * pickf(0.26, 0.16, 0.22) + pick(vec3(1.0, 0.70, 0.40), vec3(0.55, 0.66, 0.90), vec3(1.0, 0.86, 0.62)) * pow(sd, 60.0) * pickf(0.40, 0.30, 0.42);
  float disc = smoothstep(pickf(0.99950, 0.99962, 0.99950), pickf(0.99972, 0.99979, 0.99972), sd);
  vec3 face = pick(vec3(1.0, 0.88, 0.66), vec3(0.93, 0.96, 1.0), vec3(1.0, 0.96, 0.82)) * pickf(1.6, 1.0, 1.6);
  if (disc > 0.0 && uMood > 0.5 && uMood < 1.5) face *= 0.62 + 0.42 * vnoise(d.xy * 110.0 + 7.0);      // the grey seas on the moon
  c += face * disc;
  return c;
}`;

const QUAD_VS = `
attribute vec2 aQ;
varying vec2 vUv;
void main() { vUv = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }`;

const SHORE_FS = `
precision highp float;
varying vec2 vUv;
uniform vec3 uCam, uRight, uUp, uFwd;
uniform vec2 uTan;
uniform vec4 uBottle;         // x, z, size, how much shadow
uniform vec3 uRip[3];         // x, z, age in seconds (negative: none)
uniform float uDim;
uniform float uLamp;          // 1 when this phone is listening for bottles: a lantern glows on the dry sand
${SKY}
float swash(float x, float t) {
  float ph = fract(t / 7.0 - x * 0.035);
  float s = ph < 0.3 ? 1.0 - pow(1.0 - ph / 0.3, 3.0) : 0.5 + 0.5 * cos(3.14159265 * (ph - 0.3) / 0.7);
  return -0.55 + 1.25 * s + 0.11 * sin(x * 2.1 + t * 0.5) + 0.06 * sin(x * 5.3 - t * 0.8);
}
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);
  vec3 col;
  if (rd.y > -0.0015) {
    // ---- sky, clouds, first stars
    col = sky(rd);
    vec2 cp = rd.xz / (rd.y + 0.13) * 1.1 + vec2(uTime * 0.006, 0.0);
    float cl = fbm(cp * 1.3 + fbm(cp * 2.9) * 0.5);
    float mask = smoothstep(0.50, 0.80, cl) * smoothstep(-0.01, 0.16, rd.y);
    float nearSun = pow(max(dot(normalize(vec3(rd.x, 0.0, rd.z)), normalize(vec3(SUN.x, 0.0, SUN.z))), 0.0), 3.0);
    vec3 cloud = mix(pick(vec3(0.20, 0.15, 0.30), vec3(0.05, 0.07, 0.14), vec3(0.64, 0.54, 0.68)), pick(vec3(1.0, 0.48, 0.28), vec3(0.34, 0.40, 0.56), vec3(1.0, 0.82, 0.64)), nearSun * (1.0 - smoothstep(0.0, 0.5, rd.y)) * 0.9);
    cloud = mix(cloud, pick(vec3(0.34, 0.20, 0.34), vec3(0.08, 0.10, 0.18), vec3(0.82, 0.68, 0.74)), smoothstep(0.6, 0.9, cl) * 0.6);
    col = mix(col, cloud, mask * 0.78);
    vec2 sg = rd.xz / max(rd.y, 0.05) * 42.0;
    float star = step(pickf(0.992, 0.965, 2.0), hash(floor(sg))) * smoothstep(pickf(0.30, 0.04, 0.30), pickf(0.65, 0.28, 0.65), rd.y) * (1.0 - mask) * pickf(1.0, 1.25, 0.0);   // a few at dusk, a sky full at night, none at dawn
    col += vec3(0.9, 0.92, 1.0) * star * (1.0 - smoothstep(0.0, 0.35, length(fract(sg) - 0.5))) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sg)) * 40.0));
    // at night, a shooting star every so often
    if (uMood > 0.5 && uMood < 1.5) {
      float k = floor(uTime / 11.0), ph = uTime - k * 11.0;
      if (ph < 0.9) {
        vec2 o = vec2(hash(vec2(k, 1.0)) * 0.42 - 0.34, 0.17 + 0.15 * hash(vec2(k, 2.0)));
        vec2 dir = normalize(vec2(0.86, -0.42));
        vec2 q = rd.xy - o - dir * ph * 0.30;
        float along = dot(q, dir), across = length(q - dir * along);
        float tail = smoothstep(-0.11, 0.0, along) * step(along, 0.0);
        col += vec3(0.85, 0.92, 1.0) * tail * (1.0 - smoothstep(0.0, 0.0035, across)) * sin(ph / 0.9 * 3.14159) * 1.5 * (1.0 - mask);
      }
    }
  } else {
    float tt = -uCam.y / rd.y;
    vec3 p = uCam + rd * tt;
    float x = p.x, z = p.z;
    float zs = swash(x, uTime);
    vec3 FOAM = pick(vec3(0.88, 0.76, 0.74), vec3(0.38, 0.54, 0.72), vec3(0.99, 0.93, 0.90));
    float glow = pickf(0.0, 1.0, 0.0);                  // at night the surf lights up where it breaks
    float rising = swash(x, uTime + 0.05) - zs;         // > 0 while the water is running up the beach

    // ---- sand
    float grain = hash(floor(p.xz * 380.0 + 0.5));
    float soft = fbm(p.xz * 2.6);
    vec3 sand = mix(vec3(0.335, 0.250, 0.195), vec3(0.435, 0.335, 0.250), soft) * (0.90 + 0.20 * grain);
    sand += pick(vec3(0.10, 0.045, 0.015), vec3(0.09, 0.10, 0.12), vec3(0.11, 0.08, 0.05)) * (0.5 + 0.5 * sin(z * 34.0 + soft * 9.0 + x * 3.0)) * 0.35;   // low light on the ripples
    sand *= pick(vec3(1.0), vec3(0.40, 0.47, 0.66), vec3(1.22, 1.13, 1.06));
    float wetLine = 0.90 + 0.11 * sin(x * 2.1) + 0.05 * sin(x * 5.3 + 1.0);
    float wet = 1.0 - smoothstep(wetLine - 0.30, wetLine + 0.06, z);
    float film = 1.0 - smoothstep(zs, zs + 0.60, z);                         // the thin sheet of water just behind the edge
    vec3 rn = normalize(vec3((fbm(p.xz * 7.0) - 0.5) * 0.10, 1.0, (fbm(p.xz * 7.0 + 9.0) - 0.5) * 0.10));
    vec3 R = reflect(rd, rn);
    float fr = pow(1.0 - max(dot(-rd, rn), 0.0), 4.0);
    vec3 wetCol = sand * 0.50 + sky(R) * (0.07 + 0.62 * fr) * (0.45 + 0.55 * film);
    col = mix(sand, wetCol, wet);
    float lampFlicker = 0.86 + 0.14 * vnoise(vec2(uTime * 7.0, 3.3));
    float lampAway = length(p.xz - vec2(0.27, 1.16));
    col += vec3(1.0, 0.60, 0.24) * uLamp * lampFlicker * 0.60 * exp(-lampAway * lampAway * 7.0);      // its pool of light on the sand
    // bubbles the last wave left on the sand
    float lace = fbm(p.xz * 8.0 + vec2(0.0, uTime * 0.25));
    float left = (1.0 - smoothstep(0.0, 0.34, z - zs)) * step(zs, z);
    float bub = smoothstep(0.50, 0.72, lace + left * 0.30) * left * (rising < 0.0 ? 0.75 : 0.35);
    col = mix(col, pick(vec3(0.80, 0.70, 0.70), FOAM * 0.9, FOAM * 0.9), bub);
    col += vec3(0.03, 0.40, 0.48) * bub * glow * (0.3 + 0.7 * vnoise(p.xz * 31.0 + uTime * 1.3));

    if (z < zs) {
      // ---- the sea
      float into = zs - z;                                // metres past the water's edge
      vec2 w = p.xz;
      float damp = 1.0 / (1.0 + tt * 0.16);
      float hx = 0.0, hz = 0.0, ph;
      ph = dot(w, vec2(0.10, 1.0)) * 2.6 - uTime * 1.9;  hx += cos(ph) * 0.10 * 0.26; hz += cos(ph) * 0.26;
      ph = dot(w, vec2(-0.25, 1.0)) * 4.3 - uTime * 2.6; hx -= cos(ph) * 0.25 * 0.17; hz += cos(ph) * 0.17;
      ph = dot(w, vec2(0.6, 0.8)) * 7.7 - uTime * 3.3;   hx += cos(ph) * 0.6 * 0.10;  hz += cos(ph) * 0.8 * 0.10;
      float n1 = fbm(w * 2.4 + vec2(0.0, uTime * 0.7));
      hx += (fbm(w * 2.4 + vec2(0.18, uTime * 0.7)) - n1) * 0.85;
      hz += (fbm(w * 2.4 + vec2(0.0, 0.18 + uTime * 0.7)) - n1) * 0.85;
      vec3 n = normalize(vec3(-hx * damp, 1.0, -hz * damp));
      vec3 Rw = reflect(rd, n);
      Rw.y = abs(Rw.y);
      float F = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
      F *= smoothstep(0.0, 0.30, into) * 0.85 + 0.15;                          // right at the edge the water is too thin to mirror the sky
      vec3 seen = sand * vec3(0.36, 0.62, 0.60);                              // the sand, seen through shallow water
      vec3 body = mix(seen, pick(vec3(0.035, 0.115, 0.150), vec3(0.006, 0.022, 0.050), vec3(0.075, 0.21, 0.27)), 1.0 - exp(-into * 0.70));
      col = mix(body, sky(Rw), F);
      float glit = pow(max(dot(Rw, SUN), 0.0), 260.0);
      col += pick(vec3(1.0, 0.72, 0.42), vec3(0.70, 0.82, 1.0), vec3(1.0, 0.90, 0.70)) * glit * pickf(3.2, 2.6, 3.0) * (0.5 + 0.5 * vnoise(w * 26.0 + uTime * 3.0));
      // foam at the leading edge, and the white lines of waves coming in
      float edge = 1.0 - smoothstep(0.0, 0.46, into);
      float lace2 = fbm(w * 6.5 + vec2(0.0, uTime * 0.8)) + 0.35 * vnoise(w * 19.0 - vec2(0.0, uTime * 1.3));
      float foam = smoothstep(0.70, 0.92, lace2 + edge * 0.50) * edge * (rising > 0.0 ? 1.0 : 0.55);
      foam = max(foam, (1.0 - smoothstep(0.0, 0.05, into)) * (0.55 + 0.45 * smoothstep(0.35, 0.6, lace2)));
      float sets = pow(0.5 + 0.5 * sin(z * 1.05 - uTime * 0.9 + fbm(vec2(x * 0.35, z * 0.2)) * 3.0), 12.0);
      foam = max(foam, sets * smoothstep(0.58, 0.80, lace2) * smoothstep(-16.0, -1.2, z) * (1.0 - smoothstep(-1.2, -0.2, z)) * 0.8);
      col = mix(col, FOAM, foam);
      col += vec3(0.04, 0.52, 0.60) * foam * glow * (0.30 + 0.70 * vnoise(w * 23.0 + uTime * 1.7));
      // the far sea melts into the sky
      col = mix(col, sky(normalize(vec3(rd.x, 0.004, rd.z))) * 0.92, smoothstep(7.0, 70.0, tt));
      // rings where a finger touched the water
      for (int i = 0; i < 3; i++) {
        if (uRip[i].z >= 0.0) {
          float d = length(p.xz - uRip[i].xy), r = uRip[i].z * 0.85;
          col += pick(vec3(1.0, 0.78, 0.62), vec3(0.20, 0.85, 0.95), vec3(1.0, 0.92, 0.84)) * (exp(-pow((d - r) / 0.035, 2.0)) + 0.5 * exp(-pow((d - r * 0.6) / 0.03, 2.0))) * (1.0 - smoothstep(0.6, 2.4, uRip[i].z)) * 0.5;
        }
      }
    }
    // the bottle's shadow, and the foam that gathers round it in the water
    vec2 bd = (p.xz - uBottle.xy) / (vec2(1.25, 0.85) * uBottle.z);
    float bl = length(bd);
    col *= 1.0 - 0.52 * (1.0 - smoothstep(0.35, 1.0, bl)) * uBottle.w;
    if (z < zs) col = mix(col, FOAM + vec3(0.0, 0.30, 0.34) * glow, (1.0 - smoothstep(0.0, 0.28, abs(bl - 1.02))) * uBottle.w * 0.55 * smoothstep(0.45, 0.7, fbm(p.xz * 11.0 + uTime)));
  }
  if (uLamp > 0.0) {
    // the flame itself: a bright point just above the sand, with a soft halo
    vec3 toLamp = vec3(0.27, 0.10, 1.16) - uCam;
    float along = dot(toLamp, rd), off = length(toLamp - rd * along);
    col += vec3(1.0, 0.74, 0.38) * uLamp * (0.86 + 0.14 * vnoise(vec2(uTime * 7.0, 3.3))) * step(0.0, along) * (exp(-off * off * 1400.0) * 1.8 + exp(-off * off * 90.0) * 0.22);
  }
  col *= 1.0 - 0.30 * dot(ndc * 0.62, ndc * 0.62);
  col *= 1.0 - 0.50 * uDim;
  gl_FragColor = vec4(col, 1.0);
}`;

const BLIT_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uGrain;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  c = c / (1.0 + 0.12 * dot(c, vec3(0.3333)));          // ease the brightest glints, keep the dusk dark
  c += (fract(sin(dot(gl_FragCoord.xy + uGrain, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 180.0;
  gl_FragColor = vec4(c, 1.0);
}`;

const MESH_VS = `
attribute vec3 aP;
attribute vec3 aN;
uniform mat4 uModel, uVP;
varying vec3 vN, vW, vO;
void main() {
  vec4 w = uModel * vec4(aP, 1.0);
  vW = w.xyz; vO = aP;
  vN = mat3(uModel) * aN;
  gl_Position = uVP * w;
}`;

// Glass, drawn twice. First what you see through it (the beach behind, bent and tinted),
// then, after the note and cork, what shines on its surface.
const GLASS_FS = `
precision highp float;
varying vec3 vN, vW, vO;
uniform vec3 uCam;
uniform vec2 uRes;
uniform sampler2D uBg;
uniform float uPass;          // 0 through, 1 shine
uniform float uWet;
${SKY}
void main() {
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float nv = max(dot(N, V), 0.0);
  if (uPass < 0.5) {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 bend = (N.xy - V.xy * nv) * 0.070;
    vec3 c = texture2D(uBg, clamp(uv - bend, 0.002, 0.998)).rgb;
    c *= mix(vec3(0.74, 0.96, 0.90), vec3(0.42, 0.74, 0.66), pow(1.0 - nv, 1.6));   // sea-glass green, deeper where the glass is seen edge on
    c = mix(c, vec3(0.03, 0.11, 0.10), pow(1.0 - nv, 3.5) * 0.62);
    c += vec3(0.05, 0.11, 0.10) * (0.35 + 0.65 * uWet) * pickf(1.0, 0.35, 1.2);                              // the faint milk of old glass
    gl_FragColor = vec4(c, 1.0);
  } else {
    vec3 R = reflect(-V, N);
    float F = 0.045 + 0.955 * pow(1.0 - nv, 4.2);
    vec3 refl = sky(vec3(R.x, abs(R.y) * 0.9 + 0.02, R.z));
    float sun = pow(max(dot(R, SUN), 0.0), 140.0) * 3.2 + pow(max(dot(R, SUN), 0.0), 18.0) * 0.20;
    // a long soft streak, the window of light every bottle carries down its side
    float streak = pow(max(dot(normalize(N + vec3(0.0, 0.0, 0.0)), normalize(vec3(-0.55, 0.30, 0.78))), 0.0), 26.0) * 0.55;
    streak += pow(max(dot(N, normalize(vec3(0.75, 0.10, 0.65))), 0.0), 60.0) * 0.22;
    // beads of sea water still clinging to it
    float beads = smoothstep(0.90, 0.96, vnoise(vO.xy * vec2(64.0, 64.0) + vO.z * 40.0)) * uWet;
    vec3 c = refl * F * 1.05 + pick(vec3(1.0, 0.80, 0.55), vec3(0.72, 0.84, 1.0), vec3(1.0, 0.92, 0.74)) * sun + pick(vec3(1.0, 0.95, 0.88), vec3(0.42, 0.50, 0.62), vec3(1.0, 0.97, 0.92)) * (streak + beads * 0.22);
    gl_FragColor = vec4(c, clamp(F * 0.55 + beads * 0.25, 0.0, 1.0));
  }
}`;

const SOLID_FS = `
precision highp float;
varying vec3 vN, vW, vO;
uniform vec3 uCam;
uniform float uKind;          // 0 cork, 1 rolled note
uniform float uShade;         // 0 in the open, 1 behind glass
${SKY}
void main() {
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float sunl = max(dot(N, normalize(vec3(-0.35, 0.45, 0.55))), 0.0);        // the last warm light, from over the sea
  float skyl = 0.5 + 0.5 * N.y;
  vec3 base;
  if (uKind < 0.5) {
    float sp = vnoise(vO.xz * 120.0 + vO.y * 90.0), pit = smoothstep(0.72, 0.9, vnoise(vO.xy * 70.0 + vO.z * 50.0));
    base = mix(vec3(0.56, 0.39, 0.22), vec3(0.72, 0.54, 0.33), sp) * (1.0 - 0.45 * pit);
  } else {
    float ang = atan(vO.z, vO.x);
    base = vec3(0.97, 0.93, 0.82) * (0.93 + 0.07 * vnoise(vec2(ang * 6.0, vO.y * 40.0)));
    base *= 1.0 - 0.30 * smoothstep(0.92, 1.0, sin(ang * 1.0 + 1.9));                 // the edge of the sheet along the roll
    float thread = 1.0 - smoothstep(0.012, 0.022, abs(vO.y + 0.10));                         // a red thread tied round the middle
    base = mix(base, vec3(0.62, 0.10, 0.10), thread);
    base *= 0.80 + 0.20 * smoothstep(0.0, 0.02, 0.04 - length(vO.xz) + 0.012);          // the dark spiral at each end
  }
  vec3 warm = (uKind < 0.5 ? vec3(1.0, 0.66, 0.42) : vec3(1.0, 0.82, 0.66)) * pick(vec3(1.0), vec3(0.42, 0.55, 0.85), vec3(1.05, 1.04, 1.0));
  vec3 c = base * (warm * sunl * 0.85 + mix(vec3(0.24, 0.21, 0.28), vec3(0.40, 0.39, 0.52), skyl) * pick(vec3(1.0), vec3(0.45, 0.56, 0.86), vec3(1.35, 1.25, 1.15)) * (uKind < 0.5 ? 0.85 : 1.05));
  c *= mix(1.0, 0.86, uShade);
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- shapes

/** Spin a profile [radius, y] round the y axis. */
function lathe(profile, seg) {
  const P = [], N = [], I = [];
  const rows = profile.length;
  for (let j = 0; j < rows; j++) {
    const a = profile[Math.max(0, j - 1)], b = profile[Math.min(rows - 1, j + 1)];
    let ty = b[1] - a[1], tr = b[0] - a[0];
    const tl = Math.hypot(ty, tr) || 1; ty /= tl; tr /= tl;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      P.push(profile[j][0] * c, profile[j][1], profile[j][0] * s);
      N.push(ty * c, -tr, ty * s);
    }
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { P: new Float32Array(P), N: new Float32Array(N), I: new Uint16Array(I) };
}

// The bottle is 1 unit long, centred, standing on its base along +y.
const BOTTLE = [[0.0, -0.5], [0.10, -0.5], [0.142, -0.492], [0.156, -0.470], [0.160, -0.440], [0.160, -0.20], [0.160, 0.06], [0.156, 0.115], [0.142, 0.165], [0.118, 0.215], [0.092, 0.258], [0.070, 0.295], [0.058, 0.330], [0.054, 0.370], [0.054, 0.435], [0.060, 0.444], [0.068, 0.452], [0.069, 0.478], [0.064, 0.492], [0.056, 0.500], [0.046, 0.500]];
const CORK = [[0.0, -0.065], [0.040, -0.065], [0.0445, -0.058], [0.049, 0.045], [0.050, 0.058], [0.044, 0.066], [0.0, 0.066]];
const NOTE = [[0.0, -0.25], [0.028, -0.25], [0.038, -0.248], [0.0385, 0.0], [0.038, 0.248], [0.028, 0.25], [0.0, 0.25]];
const CORK_SEAT = 0.455;   // where the cork sits, along the bottle
const NOTE_SEAT = -0.16;   // where the note rests

// ---------------------------------------------------------------- scene

class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    // Ask the way that looks best first, then more and more plainly. Some phones refuse the first and grant the last.
    const gl = this.gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)
      || canvas.getContext('webgl', { alpha: false, antialias: false, depth: true }) || canvas.getContext('webgl') || canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true });
    if (!gl) throw new Error('WebGL is not available');
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.shore = this._program(QUAD_VS, SHORE_FS);
    this.blit = this._program(QUAD_VS, BLIT_FS);
    this.glass = this._program(MESH_VS, GLASS_FS);
    this.solid = this._program(MESH_VS, SOLID_FS);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.mBottle = this._mesh(lathe(BOTTLE, 40));
    this.mCork = this._mesh(lathe(CORK, 20));
    this.mNote = this._mesh(lathe(NOTE, 20));
    this.fbo = gl.createFramebuffer();
    this.bg = null;
    // a tile of random values, smoothed by the graphics chip as it is read
    const nz = new Uint8Array(256 * 256);
    for (let i = 0; i < nz.length; i++) nz[i] = Math.random() * 256;
    this.noise = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, nz);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
    this.W = 1; this.H = 1; this.scale = 1;
    // The beach is soft by nature (dusk, haze, moving water), so it is drawn smaller and stretched.
    // The bottle is drawn over it at full sharpness. This roughly halves the work per frame.
    this.bgScale = 0.72;
    this.cam = { pos: [0, 1.22, 2.75], target: [0, 0.0, -1.5], fov: 62 * Math.PI / 180 };
    this._frame = 0;
    this.mood = 0;              // 0 dusk, 1 night, 2 dawn
    this.lamp = 0;              // 1 when the lantern is lit
  }

  _program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader failed');
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, vs.includes('aQ') ? 'aQ' : 'aP');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, u, aN: gl.getAttribLocation(p, 'aN') };
  }

  _mesh(m) {
    const gl = this.gl;
    const vp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vp); gl.bufferData(gl.ARRAY_BUFFER, m.P, gl.STATIC_DRAW);
    const vn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vn); gl.bufferData(gl.ARRAY_BUFFER, m.N, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.I, gl.STATIC_DRAW);
    return { vp, vn, ib, n: m.I.length };
  }

  /** w, h in css px. scale is device pixels per css px actually drawn. */
  resize(w, h, scale) {
    const gl = this.gl;
    this.W = w; this.H = h; this.scale = scale;
    const pw = Math.max(2, Math.round(w * scale)), ph = Math.max(2, Math.round(h * scale));
    if (this.canvas.width === pw && this.canvas.height === ph && this.bg) return;
    this.canvas.width = pw; this.canvas.height = ph;
    const bw = this.bw = Math.max(2, Math.round(pw * this.bgScale)), bh = this.bh = Math.max(2, Math.round(ph * this.bgScale));
    if (this.bg) gl.deleteTexture(this.bg);
    this.bg = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.bg);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, bw, bh, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.bg, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** The camera's frame: where it is, which way is forward, right and up, and how wide it sees. */
  basis() {
    const c = this.cam, f = norm(sub(c.target, c.pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    const ty = Math.tan(c.fov / 2), tx = ty * this.W / this.H;
    return { pos: c.pos, f, r, u, tx, ty };
  }

  viewProj() {
    const b = this.basis(), p = b.pos;
    const view = [b.r[0], b.u[0], -b.f[0], 0, b.r[1], b.u[1], -b.f[1], 0, b.r[2], b.u[2], -b.f[2], 0, -dot(b.r, p), -dot(b.u, p), dot(b.f, p), 1];
    return M.mul(M.perspective(this.cam.fov, this.W / this.H, 0.05, 60), view);
  }

  /** A point in the world, as css px on the screen (and whether it is in front of the camera). */
  project(w) {
    const vp = this.viewProj();
    const x = vp[0] * w[0] + vp[4] * w[1] + vp[8] * w[2] + vp[12], y = vp[1] * w[0] + vp[5] * w[1] + vp[9] * w[2] + vp[13], q = vp[3] * w[0] + vp[7] * w[1] + vp[11] * w[2] + vp[15];
    return { x: (x / q * 0.5 + 0.5) * this.W, y: (1 - (y / q * 0.5 + 0.5)) * this.H, front: q > 0 };
  }

  /** Where a touch at (sx, sy) lands on the ground (or on a level plane at height y). null if it points at the sky. */
  ground(sx, sy, y = 0) {
    const b = this.basis();
    const nx = sx / this.W * 2 - 1, ny = 1 - sy / this.H * 2;
    const d = norm([b.f[0] + b.r[0] * nx * b.tx + b.u[0] * ny * b.ty, b.f[1] + b.r[1] * nx * b.tx + b.u[1] * ny * b.ty, b.f[2] + b.r[2] * nx * b.tx + b.u[2] * ny * b.ty]);
    if (d[1] > -0.02) return null;
    const t = (y - b.pos[1]) / d[1];
    return [b.pos[0] + d[0] * t, y, b.pos[2] + d[2] * t];
  }

  /**
   * s: { time, dim, shadow:[x,z,size,amount], ripples:[{x,z,age}], bottle: mat4 or null, cork: mat4 or null, note: mat4 or null, wet }
   */
  draw(s) {
    const gl = this.gl;
    if (this.lost || !this.bg) return;
    const b = this.basis(), pw = this.canvas.width, ph = this.canvas.height;
    const tm = s.time % 2000;

    // 1. the beach, into a texture (the glass needs to look through it)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.bw, this.bh);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(this.shore.p);
    const u = this.shore.u;
    gl.uniform3fv(u.uCam, b.pos); gl.uniform3fv(u.uRight, b.r); gl.uniform3fv(u.uUp, b.u); gl.uniform3fv(u.uFwd, b.f);
    gl.uniform2f(u.uTan, b.tx, b.ty);
    gl.uniform1f(u.uTime, tm);
    gl.uniform1f(u.uMood, this.mood); gl.uniform3fv(u.uSun, SUNS[this.mood]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.uNoise, 1);
    gl.uniform4fv(u.uBottle, s.shadow || [0, 0, 1, 0]);
    const rip = new Float32Array(9).fill(-1);
    (s.ripples || []).slice(-3).forEach((r, i) => { rip[i * 3] = r.x; rip[i * 3 + 1] = r.z; rip[i * 3 + 2] = r.age; });
    gl.uniform3fv(u.uRip, rip);
    gl.uniform1f(u.uDim, s.dim || 0);
    gl.uniform1f(u.uLamp, this.lamp || 0);
    this._quad();

    // 2. onto the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(this.blit.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bg);
    gl.uniform1i(this.blit.u.uTex, 0);
    gl.uniform1f(this.blit.u.uGrain, (this._frame++ % 64) * 1.37);
    this._quad();
    if (!s.bottle) return;

    // 3. the bottle: through the glass, then what is inside it, then the shine on top
    const vp = this.viewProj();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    const glassPass = (pass) => {
      gl.useProgram(this.glass.p);
      const g = this.glass.u;
      gl.uniformMatrix4fv(g.uModel, false, s.bottle); gl.uniformMatrix4fv(g.uVP, false, vp);
      gl.uniform3fv(g.uCam, b.pos); gl.uniform2f(g.uRes, pw, ph);
      gl.uniform1i(g.uBg, 0); gl.uniform1i(g.uNoise, 1); gl.uniform1f(g.uPass, pass); gl.uniform1f(g.uTime, tm); gl.uniform1f(g.uWet, s.wet || 0); gl.uniform1f(g.uMood, this.mood); gl.uniform3fv(g.uSun, SUNS[this.mood]);
      this._drawMesh(this.mBottle, this.glass);
    };
    gl.depthMask(false);
    glassPass(0);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.solid.p);
    const so = this.solid.u;
    gl.uniformMatrix4fv(so.uVP, false, vp); gl.uniform3fv(so.uCam, b.pos); gl.uniform1f(so.uTime, tm); gl.uniform1i(so.uNoise, 1); gl.uniform1f(so.uMood, this.mood); gl.uniform3fv(so.uSun, SUNS[this.mood]);
    if (s.note) { gl.uniformMatrix4fv(so.uModel, false, s.note); gl.uniform1f(so.uKind, 1); gl.uniform1f(so.uShade, s.noteOut ? 0 : 1); this._drawMesh(this.mNote, this.solid); }
    if (s.cork) { gl.uniformMatrix4fv(so.uModel, false, s.cork); gl.uniform1f(so.uKind, 0); gl.uniform1f(so.uShade, 0); this._drawMesh(this.mCork, this.solid); }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    glassPass(1);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  }

  _quad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _drawMesh(m, prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vp);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    if (prog.aN >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vn);
      gl.enableVertexAttribArray(prog.aN);
      gl.vertexAttribPointer(prog.aN, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
    if (prog.aN >= 0) gl.disableVertexAttribArray(prog.aN);
  }
}

return { M, swash, DRY_LINE, MOOD, CORK_SEAT, NOTE_SEAT, Scene };
})();

// ---------------------------------------------------------------- story.js
__m.story = (function () {
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

const { M, swash, DRY_LINE, CORK_SEAT, NOTE_SEAT } = __m.scene;
const LIE = 0.42;         // the bottle's length on the beach, metres
const HOLD = 0.50;        // and in your hands
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);

class Story {
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

return { Story };
})();

// ---------------------------------------------------------------- audio.js
__m.audio = (function () {
// The sound of the shore, made live from noise and a few tones. No audio files to download.

class Shore {
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

return { Shore };
})();

// ---------------------------------------------------------------- thread.js
__m.thread = (function () {
// Conversations. Every bottle carries a secret key shared by the bottles sent back
// and forth after it. With that key a phone can ask the server for the rest of the
// conversation, so an old link shows the newest reply and the earlier notes.
//
// What the server holds is scrambled with the key (AES-GCM) before it leaves the
// phone, and the key only ever travels inside links, after the #. The server sees
// a conversation number and unreadable text. It cannot read a single note.
//
// SEALS. A conversation is sealed: only its members may read it or add to it. Each
// bottle carries one seat (its "claim"). The first phone to open that bottle takes
// the seat. A link that is forwarded on, and opened by someone else later, finds
// the seat taken: they can read the one note that is in the link, and nothing else.
// "Who is asking" is a token made from a secret that never leaves the phone (shore.js).
//
// A bottle never NEEDS the server: the note itself is in the link. If the server is
// slow, asleep or gone, bottles still open and replies still send.

const SERVER = {
  url: 'https://segtizidayglyouweszn.supabase.co',     // the Bottle project. It holds nothing else.
  // Its publishable key. It is meant to be public: all it can do is call the functions below.
  key: 'sb_publishable_2XYYYTBW-AEQN6IaXllIjQ_mQkYc4PP',
  // The public half of the key notifications are signed with. Also meant to be public.
  push: 'BN4Fq7TPzNUleFeKu7mcCiiu5VQtrmy4sJ2JKRUPJwJwNnPfrSgHIn6lBE2YEZEaSIqL3ns0TDAlJfRuzaRXzIA',
};

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (str) => { let b = str.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; const bin = atob(b), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
const sha = async (text) => new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(text)));
const hex = async (text) => Array.from(await sha(text), (b) => b.toString(16).padStart(2, '0')).join('');
const random = (n) => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return b64(a); };

/** A new conversation secret: 16 random bytes as 22 link-safe characters. */
function newKey() { return random(16); }
/** A new seat for one bottle: 12 random bytes as 16 link-safe characters. */
function newClaim() { return random(12); }

/** The public number of a conversation. Worked out from the key, and useless for reading anything. */
async function threadId(key) { return b64((await sha('bottle-thread:' + key)).subarray(0, 16)); }
/** What the server keeps of a seat: its fingerprint, never the seat itself. */
async function claimHash(claim) { return hex('bottle-claim:' + claim); }

async function aes(secret) {
  return subtle().importKey('raw', await sha('bottle-key:' + secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Scramble anything with a secret. */
async function box(secret, value) {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await aes(secret), new TextEncoder().encode(JSON.stringify(value))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

/** Unscramble it. null if the secret is wrong or it has been tampered with. */
async function unbox(secret, text) {
  try {
    const raw = unb64(text);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await aes(secret), raw.subarray(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

/** Scramble a note for the server. */
const seal = (key, note) => box(key, note);
/** Unscramble one. null if it is not ours or has been tampered with. */
async function unseal(key, body) {
  const v = await unbox(key, body);
  return v && typeof v.m === 'string' ? v : null;
}

/** Ask the server something. Resolves to its answer (which may be null), or undefined if it could not be asked. */
async function rpc(fn, args, ms = 6000) {
  if (!SERVER.url || !subtle() || typeof fetch !== 'function') return undefined;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(`${SERVER.url}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'content-type': 'application/json', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key },
      body: JSON.stringify(args),
    });
    if (!r.ok) return undefined;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return undefined;                 // no signal, server asleep, blocked: carry on without it
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the notification sender to do something. Never waited on by anything that matters. */
async function notify(body, ms = 8000) {
  if (!SERVER.url || typeof fetch !== 'function') return null;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(`${SERVER.url}/functions/v1/notify`, { method: 'POST', signal: ctl ? ctl.signal : undefined, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/**
 * Open a bottle: take its seat in the conversation, or learn where this phone stands.
 *   'claimed' this phone just took the seat      'member' it already belongs
 *   'legacy'  an old conversation, open as before 'none'   the server has never heard of it
 *   'taken'   another phone opened this bottle first: no earlier notes, no replying into it
 *   null      the server could not be asked
 */
async function open(auth, key, claim) {
  if (!key || !auth || !subtle()) return null;
  try {
    const r = await rpc('bottle_open', { p_auth: auth, p_thread: await threadId(key), p_claim: claim || null });
    return typeof r === 'string' ? r : null;
  } catch { return null; }
}

/** Put a note in its conversation, with the seat its link will carry. note: { m, n, mood, to, id, t }. Resolves true if the server took it. */
async function add(auth, key, note, claim) {
  if (!key || !auth || !subtle()) return false;
  try {
    const thread = await threadId(key);
    const r = await rpc('bottle_add', { p_auth: auth, p_thread: thread, p_body: await seal(key, note), p_claim: claim ? await claimHash(claim) : null });
    if (r !== 'ok') return false;
    notify({ do: 'bottle', auth, thread });          // tell the other side's lantern. Not waited on.
    return true;
  } catch { return false; }
}

/** Every note in a conversation this phone belongs to, oldest first. null if the server could not be asked. */
async function list(auth, key) {
  if (!key || !subtle()) return null;
  try {
    const rows = await rpc('bottle_list', { p_auth: auth || null, p_thread: await threadId(key) });
    if (!Array.isArray(rows)) return null;
    const out = [], seen = new Set();
    for (const row of rows) {
      const v = await unseal(key, row.body);
      if (!v || seen.has(v.id)) continue;
      seen.add(v.id);
      out.push({ message: v.m, name: v.n || '', mood: v.mood || 'dusk', to: v.to || '', id: v.id, at: Date.parse(row.created_at) || v.t || 0 });
    }
    return out.sort((a, b) => a.at - b.at);
  } catch { return null; }
}

return { SERVER, b64, unb64, hex, newKey, newClaim, threadId, claimHash, box, unbox, seal, unseal, rpc, notify, open, add, list };
})();

// ---------------------------------------------------------------- shore.js
__m.shore = (function () {
// Your shore: what this phone remembers, and who it is to the server.
//
// The memory is small: your name, the conversations you are part of, the ids of
// notes you wrote, and a copy of the notes you have already seen (so the history
// is still here if the server is asleep or gone).
//
// The shore's SECRET is made here and never leaves the phone as it is. Two things
// are worked out from it:
//   a token   shown to the server to say "this is me" (for the seats in thread.js)
//   a key     that scrambles the list of conversations before a copy is kept on
//             the server, so the same shore can be opened from the Home Screen app
// The server can check the token. It cannot work the secret or the key back out of it.

const { rpc, box, unbox, b64, hex, threadId } = __m.thread;
const has = typeof localStorage !== 'undefined';
const get = (k) => { try { return has ? localStorage.getItem(k) : null; } catch { return null; } };
const set = (k, v) => { try { if (has) localStorage.setItem(k, v); } catch {} };
const stored = (k) => { try { const v = JSON.parse(get(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const sha = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

const myName = () => get('bottle-name') || '';
function setName(n) { if (n !== myName()) { set('bottle-name', n); save(); } }
const threads = () => stored('bottle-threads').filter((x) => x && typeof x.k === 'string');

// A note the server knows is mine only if this phone wrote it. A note known just from its link is guessed from the name on it,
// until the conversation loads and says for certain (two people can share a name).
const isMine = (n) => !!n && (n.id ? stored('bottle-mine').includes(n.id) : !!(n.name && n.name === myName()));
function wrote(id) { set('bottle-mine', JSON.stringify([id, ...stored('bottle-mine')].slice(0, 300))); save(); }

/** Keep a conversation: its key, who it is with, and the newest note already seen (by the server's clock). */
function remember(k, w, seenAt) {
  if (!k) return;
  const all = threads(), old = all.find((x) => x.k === k) || {};
  const next = { k, w: w || old.w || '', s: Math.max(old.s || 0, seenAt || 0), t: Date.now() };
  set('bottle-threads', JSON.stringify([next, ...all.filter((x) => x.k !== k)].slice(0, 30)));
  if (next.w !== old.w || next.s !== old.s || !old.k) save();
}

// ---------------------------------------------------------------- the notes already seen, kept on the phone

const notes = () => { try { const v = JSON.parse(get('bottle-notes') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
/** What this phone has already seen of a conversation, oldest first. */
function kept(key) { const v = notes()[key]; return Array.isArray(v) ? v : []; }
/** Add what the server just said to what is kept, and give back the two together. */
function keep(key, fresh) {
  const by = new Map();
  for (const n of [...kept(key), ...(fresh || [])]) if (n && n.id) by.set(n.id, n);
  const all = [...by.values()].sort((a, b) => a.at - b.at).slice(-80);
  const book = notes();
  book[key] = all;
  const order = threads().map((t) => t.k);
  for (const k of Object.keys(book)) if (k !== key && !order.slice(0, 15).includes(k)) delete book[k];
  set('bottle-notes', JSON.stringify(book));
  return all;
}

// ---------------------------------------------------------------- who this phone is

/** The secret of this shore. Made the first time it is needed. */
function secret() {
  let s = get('bottle-shore');
  if (!s || !/^[A-Za-z0-9_-]{22}$/.test(s)) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    s = b64(a);
    set('bottle-shore', s);
  }
  return s;
}

let tokenOf = '', tokenIs = '';
/** What the server is shown. Worked out from the secret, and no way back. */
async function token() {
  const s = secret();
  if (tokenOf !== s) { tokenIs = b64((await sha('bottle-shore-auth:' + s)).subarray(0, 16)); tokenOf = s; }
  return tokenIs;
}

// ---------------------------------------------------------------- a copy with the server, scrambled

const state = () => ({ v: 1, name: myName(), threads: threads(), mine: stored('bottle-mine') });

/** Fold another copy of the shore into this one. Returns true if anything here changed. */
function fold(other) {
  if (!other || typeof other !== 'object') return false;
  const before = JSON.stringify(state());
  const by = new Map();
  for (const t of [...(Array.isArray(other.threads) ? other.threads : []), ...threads()]) {
    if (!t || typeof t.k !== 'string') continue;
    const old = by.get(t.k);
    by.set(t.k, old ? { k: t.k, w: (t.t || 0) >= (old.t || 0) ? (t.w || old.w || '') : (old.w || t.w || ''), s: Math.max(t.s || 0, old.s || 0), t: Math.max(t.t || 0, old.t || 0) } : { k: t.k, w: t.w || '', s: t.s || 0, t: t.t || 0 });
  }
  set('bottle-threads', JSON.stringify([...by.values()].sort((a, b) => b.t - a.t).slice(0, 30)));
  set('bottle-mine', JSON.stringify([...new Set([...stored('bottle-mine'), ...(Array.isArray(other.mine) ? other.mine : [])])].slice(0, 300)));
  if (!myName() && typeof other.name === 'string' && other.name) set('bottle-name', other.name.slice(0, 40));
  return JSON.stringify(state()) !== before;
}

/** Bring in whatever the server's copy has that this phone does not. Resolves true if something new arrived. */
async function pull() {
  try {
    const blob = await rpc('shore_get', { p_auth: await token() });
    if (typeof blob !== 'string') return false;
    return fold(await unbox('shore:' + secret(), blob));
  } catch { return false; }
}

let timer = 0;
/** Send this phone's copy to the server, a moment after the last change. */
function save() {
  if (!has || typeof window === 'undefined') return;
  clearTimeout(timer);
  timer = setTimeout(() => { saveNow(); }, 1200);
}
async function saveNow() {
  try {
    clearTimeout(timer);
    await pull();
    const ok = await rpc('shore_put', { p_auth: await token(), p_blob: await box('shore:' + secret(), state()) });
    names();
    return ok === 'ok';
  } catch { return false; }
}

// ---------------------------------------------------------------- carrying the shore to the Home Screen app (iPhone)

/**
 * An iPhone only delivers notifications to a page that has been added to the Home Screen, and that
 * app starts with an empty memory. So the shore is left in a parcel on the server, scrambled, and the
 * app is started with the parcel's one-time code in its address. The code works once, for three days.
 */
async function carry() {
  try {
    if (!(await saveNow())) return '';
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    const code = b64(a);
    const ok = await rpc('handoff_put', { p_id: await hex('bottle-handoff-id:' + code), p_blob: await box('handoff:' + code, { s: secret() }) });
    return ok === 'ok' ? code : '';
  } catch { return ''; }
}

/** The other end: open the parcel and become that shore. Resolves 'here' already done, 'came' just arrived, 'lost' no parcel. */
async function arrive(code) {
  try {
    if (!/^[A-Za-z0-9_-]{22}$/.test(code || '')) return 'lost';
    if (get('bottle-carried') === code) return 'here';
    const blob = await rpc('handoff_take', { p_id: await hex('bottle-handoff-id:' + code) });
    const v = typeof blob === 'string' ? await unbox('handoff:' + code, blob) : null;
    if (!v || !/^[A-Za-z0-9_-]{22}$/.test(v.s || '')) return 'lost';
    set('bottle-shore', v.s);
    set('bottle-carried', code);
    await pull();
    save();
    return 'came';
  } catch { return 'lost'; }
}

// ---------------------------------------------------------------- for the notification: who each conversation is with

/** Leave a small list where the notification worker can read it: conversation number -> name. Nothing else. */
async function names() {
  try {
    if (typeof caches === 'undefined') return;
    const map = {};
    for (const t of threads()) map[await threadId(t.k)] = t.w || '';
    const c = await caches.open('bottle-kv');
    await c.put(new URL('__names', location.href.replace(/[?#].*$/, '')).href, new Response(JSON.stringify(map), { headers: { 'content-type': 'application/json' } }));
  } catch {}
}

/** The conversation a notification pointed at, if this phone knows it. */
async function threadByNumber(id) {
  for (const t of threads()) if ((await threadId(t.k)) === id) return t;
  return null;
}

return { myName, setName, threads, isMine, wrote, remember, kept, keep, secret, token, pull, save, saveNow, carry, arrive, names, threadByNumber };
})();

// ---------------------------------------------------------------- lantern.js
__m.lantern = (function () {
// The lantern: a light on your shore, so a bottle can find you. In plain terms, a
// notification on this phone when someone sends you one.
//
// Android and computers: one tap, the browser asks, done.
// iPhone: Apple only delivers notifications to a page that has been added to the Home
// Screen (iOS 16.4 and later). So on an iPhone the lantern is lit in two steps: add the
// page to the Home Screen, then open it from there and light the lantern in it.

const { SERVER, rpc, notify, unb64 } = __m.thread;
const { token, names } = __m.shore;
const has = typeof window !== 'undefined' && typeof navigator !== 'undefined';
const ua = has ? navigator.userAgent : '';
const ios = has && (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
/** Opened from the Home Screen, not in a browser tab. */
const standalone = has && (navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  || /[?&]dev\b.*[?&]standalone\b/.test(location.search));          // ?dev&standalone pretends, for building
/** An app's own little browser (Instagram, Facebook and the like). On an iPhone these cannot add to the Home Screen. */
const inApp = has && (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|musical_ly|TikTok|Bytedance|GSA\/|; wv\)/i.test(ua) || (ios && !/Safari\//.test(ua)));
const iosVersion = (() => { const m = ua.match(/OS (\d+)[_.](\d+)/); return m ? Number(m[1]) + Number(m[2]) / 10 : (ios ? 17 : 0); })();
const can = has && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// For looking at each state by hand while building: ?dev&lantern=home (or can, lit, safari, blocked).
const pretend = has && /[?&]dev\b/.test(location.search) ? new URLSearchParams(location.search).get('lantern') : null;
const flag = (v) => { try { if (v === undefined) return localStorage.getItem('bottle-lantern') === '1'; if (v) localStorage.setItem('bottle-lantern', '1'); else localStorage.removeItem('bottle-lantern'); } catch {} return !!v; };

/**
 * Where this phone stands:
 *   'lit'      it will be told            'can'    one tap lights it
 *   'home'     iPhone: add to the Home Screen first      'safari'  iPhone, inside another app: open in Safari first
 *   'blocked'  notifications were refused in the browser's settings      'none'  this browser cannot do it
 */
function standing() {
  if (!has) return 'none';
  if (pretend) return pretend;
  if (can) {
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && flag() ? 'lit' : 'can';
  }
  if (ios && !standalone && iosVersion >= 16.4) return inApp ? 'safari' : 'home';
  return 'none';
}

async function subscribe() {
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const want = unb64(SERVER.push);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // made for another sender's key (it should never be): start again
    const k = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (k && (k.length !== want.length || k.some((b, i) => b !== want[i]))) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
  const j = sub.toJSON();
  const ok = await rpc('push_save', { p_auth: await token(), p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_key: j.keys.auth });
  if (ok !== 'ok') throw new Error('the server did not take it');
  return sub;
}

/** Light it. Must be called straight from a tap. Resolves 'lit', 'refused', or 'failed: why'. */
async function light() {
  try {
    if (!can) return 'failed: this browser cannot';
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') return 'refused';
    await subscribe();
    flag(true);
    await names();
    const r = await notify({ do: 'lit', auth: await token() });      // the first notification is the proof that it works
    return r && r.sent > 0 ? 'lit' : 'lit, but the first notification was not accepted' + (r && r.codes ? ' (' + r.codes.join(',') + ')' : '');
  } catch (e) {
    return 'failed: ' + String((e && e.message) || e).slice(0, 120);
  }
}

/** Put it out. */
async function douse() {
  try {
    flag(false);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await rpc('push_drop', { p_auth: await token(), p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch {}
}

/** Each visit: if the lantern is lit, make sure the server still knows where to reach this phone. */
async function tend() {
  try {
    if (standing() !== 'lit') return;
    await subscribe();
    await names();
  } catch {}
}

return { ios, standalone, inApp, standing, light, douse, tend };
})();

// ---------------------------------------------------------------- count.js
__m.count = (function () {
// The counter. It tells Michael how the page is doing on real phones: how far people
// get through the story, and what goes wrong. It is the only way a failure on
// someone else's phone is ever seen.
//
// What is sent: a short word for what happened, a short detail (an error message,
// a frame rate), a device family ("iPhone iOS 18.1 · Safari 18") and the app version.
// What is never sent: the note, a name, a key, a link.
//
// Nothing waits on it and nothing breaks without it.

const { SERVER } = __m.thread;
const has = typeof window !== 'undefined' && typeof document !== 'undefined';
const local = has && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const search = has ? location.search : '';
// Building on this computer counts nothing, unless asked to with ?count. Anything opened with ?dev is marked as a test.
const on = has && (!local || /[?&]count\b/.test(search));
const testing = /[?&]dev\b/.test(search);

/** "iPhone iOS 18.1 · Safari 18": enough to tell phones apart, not enough to tell people apart. */
function device(u = (has && navigator.userAgent) || '', touch = (has && navigator.maxTouchPoints) || 0) {
  let os = 'Other', br = 'Browser', m;
  if ((m = u.match(/iPhone OS (\d+)[_.](\d+)/))) os = `iPhone iOS ${m[1]}.${m[2]}`;
  else if ((m = u.match(/iPad; CPU OS (\d+)[_.](\d+)/))) os = `iPad iOS ${m[1]}.${m[2]}`;
  else if (/Macintosh/.test(u) && touch > 1) os = 'iPad';
  else if ((m = u.match(/Android (\d+)/))) os = `Android ${m[1]}`;
  else if (/CrOS/.test(u)) os = 'Chromebook';
  else if (/Windows/.test(u)) os = 'Windows';
  else if (/Macintosh/.test(u)) os = 'Mac';
  else if (/Linux/.test(u)) os = 'Linux';
  // apps that open links in their own browser come first: they are the ones that behave differently
  if (/Instagram/.test(u)) br = 'Instagram';
  else if (/FBAN|FBAV|FB_IAB/.test(u)) br = 'Facebook';
  else if (/musical_ly|TikTok|Bytedance/i.test(u)) br = 'TikTok';
  else if (/Snapchat/.test(u)) br = 'Snapchat';
  else if (/WhatsApp/.test(u)) br = 'WhatsApp';
  else if (/\bLine\//.test(u)) br = 'Line';
  else if (/GSA\//.test(u)) br = 'Google app';
  else if ((m = u.match(/CriOS\/(\d+)/))) br = `Chrome ${m[1]}`;
  else if ((m = u.match(/FxiOS\/(\d+)/))) br = `Firefox ${m[1]}`;
  else if ((m = u.match(/(?:EdgiOS|EdgA|Edg)\/(\d+)/))) br = `Edge ${m[1]}`;
  else if ((m = u.match(/SamsungBrowser\/(\d+)/))) br = `Samsung ${m[1]}`;
  else if ((m = u.match(/Firefox\/(\d+)/))) br = `Firefox ${m[1]}`;
  else if (/; wv\)/.test(u)) br = 'in-app browser';
  else if ((m = u.match(/Chrome\/(\d+)/))) br = `Chrome ${m[1]}`;
  else if ((m = u.match(/Version\/(\d+).*Safari/))) br = `Safari ${m[1]}`;
  else if (/AppleWebKit/.test(u) && /Mobile\//.test(u)) br = 'in-app browser';
  return `${os} · ${br}`;
}

const version = () => { try { const s = document.querySelector('script[src*="app.js?v="]'); return s ? s.src.split('v=')[1].slice(0, 12) : 'source'; } catch { return ''; } };
const said = new Set();
let sent = 0;

/** Count something. Each kind is counted once per visit unless again is true. Never throws, never waits. */
function count(kind, detail = '', again = false) {
  try {
    if (!on || !SERVER.url || typeof fetch !== 'function') return;
    if (!again) { if (said.has(kind)) return; said.add(kind); }
    if (++sent > 40) return;
    fetch(`${SERVER.url}/rest/v1/rpc/log_event`, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', apikey: SERVER.key, authorization: 'Bearer ' + SERVER.key },
      body: JSON.stringify({ p_kind: kind, p_detail: String(detail == null ? '' : detail).slice(0, 300), p_ua: testing ? 'test' : device(), p_ver: version() }),
    }).catch(() => {});
  } catch {}
}

// Anything that breaks while the page is running. At most three a visit: one broken thing can throw every frame.
if (has) {
  let n = 0;
  const where = (f) => String(f || '').split('/').pop().split('?')[0];
  addEventListener('error', (e) => { if (e && e.message && n++ < 3) count('f_error', `${e.message} @ ${where(e.filename)}:${e.lineno || 0}:${e.colno || 0}`, true); });
  addEventListener('unhandledrejection', (e) => { if (n++ < 3) count('f_error', 'promise: ' + String((e && e.reason && (e.reason.message || e.reason)) || ''), true); });
}

return { device, count };
})();

// ---------------------------------------------------------------- main.js
__m.main = (function () {
// Message in a bottle. One page, two faces:
//   a link with a message after the #  ->  the shore, and a bottle to open
//   no message                         ->  the writing desk
// After a note is read, sending one back is one tap: the desk opens already addressed.

const { decode, linkFor, MAX_MESSAGE } = __m.code;
const { Scene, swash, DRY_LINE, MOOD } = __m.scene;
const { Story } = __m.story;
const { Shore } = __m.audio;
const { newKey, newClaim, add, list, open } = __m.thread;
const { myName, setName, threads, isMine, wrote, remember, kept, keep, token, pull, carry, arrive, threadByNumber } = __m.shore;
const { standing, light, douse, tend, ios, standalone } = __m.lantern;
const { count } = __m.count;
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
      say(lanternSaid || 'Your lantern is lit. This phone will tell you when a bottle washes up.');
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
        lanternSaid = how === 'lit' ? '' : how === 'refused' ? 'No lantern, then. You can light one any time.'
          : how.startsWith('lit') ? 'The lantern is lit, but its first notification did not go through. If none shows up in a minute, put it out and light it again.'
          : 'The lantern would not light (' + how.replace('failed: ', '') + '). Try again in a minute.';
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
try { scene = qs.has('nogl') ? null : new Scene($('gl')); } catch (e) {
  scene = null;
  // Say enough to tell a real phone from a link preview or a locked-down browser: is the page on screen, how big, does the browser know 3D at all.
  count('f_nogl', `${String((e && e.message) || 'no 3D').replace(/\s+/g, ' ').slice(0, 120)} | ${document.visibilityState} ${innerWidth}x${innerHeight} | 3D known to browser: ${typeof WebGLRenderingContext !== 'undefined'} | ${bottle ? 'a bottle' : 'the desk'}`);
}
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

return {  };
})();

})();
