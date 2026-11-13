// Draws the Home Screen icons: a bottle on a dusk sea. Run: node ops/make-icons.mjs
// No image library: the picture is worked out pixel by pixel and written as a PNG by hand.
import fs from 'node:fs';
import zlib from 'node:zlib';

const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// distance from point p to the line a-b, minus a radius: a pill
const pill = (p, a, b, r) => {
  const pa = [p[0] - a[0], p[1] - a[1]], ba = [b[0] - a[0], b[1] - a[1]];
  const h = clamp((pa[0] * ba[0] + pa[1] * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1]));
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h) - r;
};

function pixel(u, v, plain) {
  if (plain) {                                                    // the small one-colour badge Android shows in the status bar
    const d = Math.min(pill([u, v], [0.30, 0.66], [0.58, 0.44], 0.13), pill([u, v], [0.60, 0.42], [0.74, 0.31], 0.055));
    return [1, 1, 1, 1 - smooth(-0.01, 0.01, d)];
  }
  const horizon = 0.60;
  let c;
  if (v < horizon) {
    c = mix(hex('#2a1c52'), hex('#b8436f'), smooth(0.0, 0.42, v));
    c = mix(c, hex('#ff9a4f'), smooth(0.36, horizon, v));
    const sun = Math.hypot(u - 0.5, v - 0.50);
    c = mix(c, hex('#ffd9a0'), 0.55 * (1 - smooth(0.10, 0.34, sun)));
    c = mix(c, hex('#fff1d0'), 1 - smooth(0.105, 0.115, sun));
  } else {
    c = mix(hex('#c8603f'), hex('#141a3a'), smooth(horizon, 0.80, v));
    const path = (1 - smooth(0.0, 0.07 + (v - horizon) * 0.28, Math.abs(u - 0.5))) * (0.55 + 0.45 * Math.sin(v * 130)) * (1 - smooth(0.62, 0.98, v));
    c = mix(c, hex('#ffd9a0'), 0.75 * clamp(path));
  }
  // the bottle, lying at a tilt on the water
  const p = [u, v];
  const body = pill(p, [0.29, 0.70], [0.56, 0.52], 0.125);
  const neck = pill(p, [0.60, 0.49], [0.725, 0.405], 0.052);
  const cork = pill(p, [0.745, 0.392], [0.775, 0.372], 0.046);
  const glass = Math.min(body, neck);
  const px = 0.004;
  c = mix(c, hex('#0c1228'), 0.35 * (1 - smooth(0.0, 0.05, glass - 0.01)) * smooth(0.60, 0.70, v));      // its shadow on the water
  c = mix(c, hex('#8a5a33'), 1 - smooth(-px, px, cork));
  if (glass < px) {
    let g = mix(hex('#8fd3c2'), hex('#2f7d74'), smooth(-0.11, 0.0, glass));
    const note = pill(p, [0.33, 0.675], [0.52, 0.548], 0.045);
    g = mix(g, hex('#f6ead0'), 1 - smooth(-px, px, note));
    const thread = pill(p, [0.405, 0.662], [0.437, 0.585], 0.012);
    g = mix(g, hex('#a32a22'), (1 - smooth(-px, px, thread)) * (1 - smooth(-px, px, note)));
    const shine = pill(p, [0.30, 0.625], [0.50, 0.49], 0.016);
    g = mix(g, hex('#ffffff'), 0.7 * (1 - smooth(-px, px * 2, shine)));
    c = mix(c, g, 1 - smooth(-px, px, glass));
  }
  return [...c, 1];
}

function png(size, plain) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { const c = pixel((x + dx) / size, (y + dy) / size, plain); for (let k = 0; k < 4; k++) acc[k] += c[k] / 4; }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let k = 0; k < 4; k++) raw[o + k] = Math.round(clamp(acc[k]) * 255);
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0); return Buffer.concat([len, body, crc]); };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../', import.meta.url);
for (const [name, size, plain] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['badge.png', 96, true]]) {
  fs.writeFileSync(new URL(name, out), png(size, plain));
  console.log(name);
}
