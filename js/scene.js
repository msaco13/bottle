// The shoreline at dusk, and the bottle. Raw WebGL, no libraries, so it loads fast on a phone.
//
// The beach is not a 3D model. Every pixel casts a ray from the camera: if it
// points above the horizon it is sky, otherwise it lands on the ground, and the
// shader works out whether that spot is dry sand, wet sand or sea right now.
// The bottle, cork and note are real 3D shapes drawn over it. The glass bends
// the beach behind it and reflects the same sky.

// ---------------------------------------------------------------- small maths

export const M = {
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
export function swash(x, t) {
  const ph = (((t / 7 - x * 0.035) % 1) + 1) % 1;
  const s = ph < 0.3 ? 1 - Math.pow(1 - ph / 0.3, 3) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - 0.3) / 0.7);
  return -0.55 + 1.25 * s + 0.11 * Math.sin(x * 2.1 + t * 0.5) + 0.06 * Math.sin(x * 5.3 - t * 0.8);
}
/** The highest the water ever reaches. Past this the sand is dry. */
export const DRY_LINE = 0.98;

/** The three skies a bottle can arrive under, and where the sun or moon hangs in each. */
export const MOOD = { dusk: 0, night: 1, dawn: 2 };
export const SUNS = [[-0.1385, 0.0940, -0.9859], [0.160, 0.190, -0.969], [0.100, 0.060, -0.993]];

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
export const BOTTLE = [[0.0, -0.5], [0.10, -0.5], [0.142, -0.492], [0.156, -0.470], [0.160, -0.440], [0.160, -0.20], [0.160, 0.06], [0.156, 0.115], [0.142, 0.165], [0.118, 0.215], [0.092, 0.258], [0.070, 0.295], [0.058, 0.330], [0.054, 0.370], [0.054, 0.435], [0.060, 0.444], [0.068, 0.452], [0.069, 0.478], [0.064, 0.492], [0.056, 0.500], [0.046, 0.500]];
export const CORK = [[0.0, -0.065], [0.040, -0.065], [0.0445, -0.058], [0.049, 0.045], [0.050, 0.058], [0.044, 0.066], [0.0, 0.066]];
export const NOTE = [[0.0, -0.25], [0.028, -0.25], [0.038, -0.248], [0.0385, 0.0], [0.038, 0.248], [0.028, 0.25], [0.0, 0.25]];
export const CORK_SEAT = 0.455;   // where the cork sits, along the bottle
export const NOTE_SEAT = -0.16;   // where the note rests

// ---------------------------------------------------------------- scene

/** Where the viewer stands and what they see. The 3D shore and the 2D shore share it, so the story cannot tell them apart. */
export class Camera {
  constructor() {
    this.W = 1; this.H = 1; this.scale = 1;
    this.cam = { pos: [0, 1.22, 2.75], target: [0, 0.0, -1.5], fov: 62 * Math.PI / 180 };
    this.mood = 0; this.lamp = 0;
  }
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
  project(w) {
    const vp = this.viewProj();
    const x = vp[0] * w[0] + vp[4] * w[1] + vp[8] * w[2] + vp[12], y = vp[1] * w[0] + vp[5] * w[1] + vp[9] * w[2] + vp[13], q = vp[3] * w[0] + vp[7] * w[1] + vp[11] * w[2] + vp[15];
    return { x: (x / q * 0.5 + 0.5) * this.W, y: (1 - (y / q * 0.5 + 0.5)) * this.H, front: q > 0 };
  }
  ground(sx, sy, y = 0) {
    const b = this.basis();
    const nx = sx / this.W * 2 - 1, ny = 1 - sy / this.H * 2;
    const d = norm([b.f[0] + b.r[0] * nx * b.tx + b.u[0] * ny * b.ty, b.f[1] + b.r[1] * nx * b.tx + b.u[1] * ny * b.ty, b.f[2] + b.r[2] * nx * b.tx + b.u[2] * ny * b.ty]);
    if (d[1] > -0.02) return null;
    const t = (y - b.pos[1]) / d[1];
    return [b.pos[0] + d[0] * t, y, b.pos[2] + d[2] * t];
  }
}

// How to ask a phone for a 3D drawing surface, best first. Safari on an iPhone sometimes refuses the first and grants a later one.
const ASKS = [
  ['webgl', { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' }, 'smooth edges'],
  ['webgl', { alpha: false, antialias: true, depth: true, stencil: false }, 'smooth edges, default power'],
  ['webgl', { alpha: false, antialias: false, depth: true, stencil: false }, 'plain edges'],
  ['experimental-webgl', { alpha: false, antialias: false, depth: true }, 'old name'],
  ['webgl2', { alpha: false, antialias: true, depth: true, stencil: false }, 'version 2'],
];

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    // Ask the way that looks best first, then more and more plainly. Some phones refuse the first and grant the last.
    let gl = null;
    this.kind = '';
    for (const [name, how, label] of ASKS) {
      try { gl = canvas.getContext(name, how); } catch (e) { gl = null; }
      if (gl) { this.kind = (name === 'webgl2' ? 'WebGL 2' : 'WebGL 1') + ', ' + label; break; }
    }
    this.gl = gl;
    if (!gl) throw new Error('WebGL is not available');
    // Safari can hand over a surface that is already dead (the graphics chip was busy, or short of memory).
    if (gl.isContextLost && gl.isContextLost()) throw new Error('WebGL was handed over already lost');
    this.lost = false;
    this.onlost = null;          // called if the phone takes the 3D away later
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (this.lost) return; this.lost = true; if (this.onlost) this.onlost(); });
    // Every phone since about 2013 draws in full precision. One that cannot gets the same shaders at half precision: rougher water, but a 3D beach.
    const hp = gl.getShaderPrecisionFormat ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT) : null;
    this.highp = !!(hp && hp.precision > 0);
    const fit = (src) => (this.highp ? src : src.replace('precision highp float;', 'precision mediump float;'));
    this.shore = this._program(QUAD_VS, fit(SHORE_FS));
    this.blit = this._program(QUAD_VS, BLIT_FS);
    this.glass = this._program(MESH_VS, fit(GLASS_FS));
    this.solid = this._program(MESH_VS, fit(SOLID_FS));
    this.direct = false;         // true if this phone cannot draw the beach into a texture first (then the glass does not bend the view)
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

  /** What this phone gave us, in a few words. */
  info() {
    const gl = this.gl;
    let chip = '';
    try { const x = gl.getExtension('WEBGL_debug_renderer_info'); chip = String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).replace(/\s+/g, ' ').slice(0, 70); } catch (e) { chip = ''; }
    return `3D beach | ${this.kind}${this.highp ? '' : ', half precision'}${this.direct ? ', glass does not bend the view' : ''} | ${chip} | ${this.canvas.width}x${this.canvas.height}`;
  }

  /** Let go of everything, so the phone has the memory back. */
  dispose() {
    try { this.lost = true; const x = this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* nothing to do */ }
    try { this.canvas.width = 1; this.canvas.height = 1; } catch (e) { /* nothing to do */ }
  }

  _program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      if (!s) throw new Error('WebGL stopped while the beach was being built');
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.bg, 0);
    this.direct = gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.direct ? null : this.fbo);
    gl.viewport(0, 0, this.direct ? pw : this.bw, this.direct ? ph : this.bh);
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
    if (!this.direct) {
      gl.useProgram(this.blit.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bg);
      gl.uniform1i(this.blit.u.uTex, 0);
      gl.uniform1f(this.blit.u.uGrain, (this._frame++ % 64) * 1.37);
      this._quad();
    }
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
    if (!this.direct) glassPass(0);
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
