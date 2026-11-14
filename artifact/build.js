// Builds Vidhya as one claude.ai Artifact page: node artifact/build.js
//
// It reads the app as it is (lib/, public/) and writes:
//   dist/vidhya.html   the page to publish (the Artifact tool adds the document skeleton)
//   dist/preview.html  the same page inside that skeleton, to open from a local server
//
// The engine in lib/ is bundled unchanged behind a small require() shim. Each page's <main>
// and script become one view of the single page; src/shell.js routes between them and
// answers Vidhya.api() calls in the page with src/server.js. The few edits a page needs
// are listed in PATCHES and each must match exactly once, so a change to the app that
// breaks one stops the build instead of shipping silently.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const ASTRONOMY = 'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js';
const VIEWS = ['home', 'space', 'kundli', 'year', 'dasha', 'panchang', 'discover', 'onboarding'];

function patch(source, label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match for ${JSON.stringify(from.slice(0, 60))}, found ${count}`);
  return source.replace(from, () => to);
}

const PATCHES = {
  // Consult isn't part of the Artifact, so no page may point at it.
  home: [
    [`        <div class="card reveal">
          <h2>Talk to a priest</h2>
          <p class="soft" style="font-size:0.94rem">Bring one clear question. A jyotishi reads your life, not just your placements.</p>
          <div id="next-booking"></div>
          <a class="btn block" href="/consult">Book a consultation</a>
        </div>
`, ''],
    [`      const bookings = await Vidhya.api('/api/bookings');
      const upcoming = bookings.filter((b) => b.status !== 'cancelled' && new Date(b.slot_start.replace(' ', 'T')) > new Date())[0];
      if (upcoming) {
        document.getElementById('next-booking').innerHTML =
          \`<p><span class="chip gold">Next: \${Vidhya.escapeHtml(upcoming.priest_name)} · \${Vidhya.escapeHtml(upcoming.slot_start)}</span></p>\`;
      }
`, ''],
  ],
  panchang: [
    [' Ask a priest to look closer.', ''],
  ],
  // Download everything as JSON; shell.js shows the card when the viewer allows downloads.
  space: [
    [`\${a.offer === 'consult' ? '<a class="btn secondary" href="/consult">Talk to a priest</a>' : ''}`, ''],
    ['</aside>',
      `<div class="card reveal" id="export-card" hidden>
          <h2>Your data</h2>
          <p class="muted">Everything Vidhya keeps for you, plus your chart and dashas worked out, in one JSON file for your own tools.</p>
          <button class="btn ghost" type="button" id="export-json">Download everything (JSON)</button>
          <p class="hint" id="export-msg" aria-live="polite"></p>
        </div>
      </aside>`],
  ],
};

// The same for the engine's wording: the guide's page list and the boundary answers.
const LIB_PATCHES = {
  guide: [
    ["\n  ['/consult', 'Consult — book a priest (kundli matching, personal questions)'],", ''],
    ['; kundli matching is done on the Consult page.', '.'],
  ],
  intent: [
    [' If it helps to talk to a person here, the Consult page can book a conversation, but please do not wait for that if you are not safe.', ''],
    ['a priest on the Consult page can sit with you in a real conversation.', 'please talk to someone you trust.'],
    [' Kundli matching is something the priests on the Consult page do. In the meantime I can read', ' I can read'],
  ],
};

// ---------------------------------------------------------------- styles
let css = read('public', 'css', 'style.css');
// The viewer marks an explicit theme choice with data-theme and leaves it unset for "system",
// so the light palette also applies under prefers-color-scheme: light.
const lightBlock = css.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/);
if (!lightBlock) throw new Error('style.css: light theme block not found');
css = patch(css, 'style.css', lightBlock[0],
  `${lightBlock[0]}\n@media (prefers-color-scheme: light) {\n  :root:not([data-theme="dark"]) {${lightBlock[1]}\n  }\n}`);
css = patch(css, 'style.css', ':root[data-theme="light"] body::before { opacity: 0.22; }',
  ':root[data-theme="light"] body::before { opacity: 0.22; }\n@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) body::before { opacity: 0.22; } }');
css += `\n${read('artifact', 'src', 'artifact.css')}`;

// ---------------------------------------------------------------- engine
const libFiles = fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js')).sort();
const modules = [
  ...libFiles.map((f) => {
    const name = f.replace(/\.js$/, '');
    let src = read('lib', f);
    for (const [from, to] of LIB_PATCHES[name] || []) src = patch(src, `lib/${f}`, from, to);
    return [name, src];
  }),
  ['server', read('artifact', 'src', 'server.js')],
].map(([name, src]) => `__define(${JSON.stringify(name)}, function (module, exports, require) {\n${src}\n});`).join('\n');

const shim = `// CommonJS for lib/: modules resolve by file name; astronomy-engine is the browser build's global.
const __modules = {};
const __cache = {};
function __define(name, factory) { __modules[name] = factory; }
function __require(spec) {
  if (spec === 'astronomy-engine') {
    if (!window.Astronomy) throw new Error('The astronomy library did not load. Check your connection and open Vidhya again.');
    return window.Astronomy;
  }
  if (spec === '@anthropic-ai/sdk') return class Anthropic {};
  const name = spec.replace(/^.*\\//, '').replace(/\\.js$/, '');
  if (__cache[name]) return __cache[name].exports;
  if (!__modules[name]) throw new Error('Unknown module ' + spec);
  const module = { exports: {} };
  __cache[name] = module;
  __modules[name](module, module.exports, __require);
  return module.exports;
}`;

// ---------------------------------------------------------------- pages
const views = VIEWS.map((name) => {
  let html = read('public', `${name}.html`);
  for (const [from, to] of PATCHES[name] || []) html = patch(html, `${name}.html`, from, to);
  const main = html.match(/<main[\s\S]*?<\/main>/);
  // The page's own script is the last inline one, just before </body>.
  const open = html.lastIndexOf('<script>');
  const close = html.indexOf('</script>', open);
  if (!main || open < 0 || !/^\s*<\/body>/.test(html.slice(close + 9))) throw new Error(`${name}.html: <main> or page script not found`);
  const script = html.slice(open + 8, close);
  return `  ${name}: {\n    html: ${JSON.stringify(main[0])},\n    run: function (document, location, alert) {${script}},\n  },`;
}).join('\n');

let guide = read('public', 'js', 'guide.js');
guide = patch(guide, 'guide.js', "'The AI guide is not connected yet, so this came from Vidhya\\'s built-in reader.'",
  "'Claude is not available in this view, so this came from Vidhya\\'s built-in reader.'");
// A followed link no longer reloads the page, so close the panel on a phone here.
guide = patch(guide, 'guide.js', "if (ev.target.closest('a') && narrow()) { st.open = false; save(); }",
  "if (ev.target.closest('a') && narrow()) setTimeout(() => toggle(false));");

const scripts = [
  `${shim}\n${modules}`,
  read('public', 'js', 'app.js'),
  read('public', 'js', 'chart.js'),
  `// Ask Vidhya, mounted once birth details exist.\nfunction mountGuide() {\n${guide}\n}`,
  `const VIEWS = {\n${views}\n};`,
  read('artifact', 'src', 'shell.js'),
];
for (const s of scripts) if (/<\/script/i.test(s)) throw new Error('A script contains </script>');

const page = `<title>Vidhya</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script>(function(){try{var t=localStorage.getItem('vidhya-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}})()</script>
<style>
${css}
</style>
<header class="site-header"><nav class="nav"><span class="brand"><span class="brand-mark">✶</span> Vidhya</span></nav></header>
<div id="app"><div class="sky-veil"><div><div class="orbit"><i></i><i></i></div><p class="status">Opening your chart…</p></div></div></div>
<script src="${ASTRONOMY}"></script>
${scripts.map((s) => `<script>\n${s}\n</script>`).join('\n')}
`;

// The skeleton the Artifact tool wraps a page in, for local previews.
const preview = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'vidhya.html'), page);
fs.writeFileSync(path.join(__dirname, 'dist', 'preview.html'), preview);
console.log(`dist/vidhya.html ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, ${VIEWS.length} views, ${libFiles.length} lib modules`);
