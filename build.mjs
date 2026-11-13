// Build: node build.mjs
// Packs the modules in js/ into one file, app.js, and stamps index.html with a
// version so phones never mix an old file with a new one. One request instead of
// six, and an update lands whole or not at all.
// The source of truth stays in js/. Tests run against js/. Only app.js is loaded by the page.

import fs from 'node:fs';
import crypto from 'node:crypto';

const ORDER = ['code', 'scene', 'flat', 'story', 'audio', 'thread', 'shore', 'lantern', 'count', 'main'];   // each may only use the ones before it
let out = "/* Message in a bottle. Built from js/ by build.mjs. Do not edit: edit js/ and rebuild. */\n(function () {\n'use strict';\nconst __m = {};\n";
for (const name of ORDER) {
  let src = fs.readFileSync(new URL(`./js/${name}.js`, import.meta.url), 'utf8');
  const names = [];
  src = src.replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\/(\w+)\.js';?\s*$/gm, (_, list, from) => {
    if (ORDER.indexOf(from) >= ORDER.indexOf(name)) throw new Error(`${name}.js imports ${from}.js, which comes later in the build order`);
    return `const {${list}} = __m.${from};`;
  });
  if (/^import\s/m.test(src)) throw new Error(`${name}.js has an import this build does not understand`);
  src = src.replace(/^export\s+((?:async\s+)?function|class|const|let)\s+(\w+)/gm, (_, kind, id) => { names.push(id); return `${kind} ${id}`; });
  if (/^export\s/m.test(src)) throw new Error(`${name}.js has an export this build does not understand`);
  out += `\n// ---------------------------------------------------------------- ${name}.js\n__m.${name} = (function () {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
}
out += '\n})();\n';
fs.writeFileSync(new URL('./app.js', import.meta.url), out);

const css = fs.readFileSync(new URL('./css/style.css', import.meta.url), 'utf8');
const v = crypto.createHash('sha256').update(out + css).digest('hex').slice(0, 10);
const htmlUrl = new URL('./index.html', import.meta.url);
let html = fs.readFileSync(htmlUrl, 'utf8');
const before = html;
html = html.replace(/<script (?:type="module" src="js\/main\.js"|defer src="app\.js\?v=\w+")><\/script>/, `<script defer src="app.js?v=${v}"></script>`);
html = html.replace(/href="css\/style\.css(?:\?v=\w+)?"/, `href="css/style.css?v=${v}"`);
{
  const th = fs.readFileSync(new URL('./js/thread.js', import.meta.url), 'utf8');
  const url = (th.match(/url: '([^']*)'/) || [])[1], key = (th.match(/key: '([^']*)'/) || [])[1];
  if (!url || !key || !/var SERVER = \[[^\]]*\];/.test(html)) throw new Error('could not copy the server address into index.html');
  html = html.replace(/var SERVER = \[[^\]]*\];/, `var SERVER = [${JSON.stringify(url)}, ${JSON.stringify(key)}];`);
  // the stats page talks to the same server
  const statsUrl = new URL('./stats.html', import.meta.url);
  const st = fs.readFileSync(statsUrl, 'utf8'), st2 = st.replace(/var SERVER = \[[^\]]*\];/, `var SERVER = [${JSON.stringify(url)}, ${JSON.stringify(key)}];`);
  if (st2 !== st) fs.writeFileSync(statsUrl, st2);
}
if (!html.includes(`app.js?v=${v}`) || !html.includes(`style.css?v=${v}`)) throw new Error('could not stamp index.html');
if (html !== before) fs.writeFileSync(htmlUrl, html);
console.log(`built app.js (${(out.length / 1024).toFixed(0)} KB before compression), version ${v}`);
