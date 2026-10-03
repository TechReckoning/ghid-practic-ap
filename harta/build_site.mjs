import fs from 'fs';
import { UPDATED } from './src/site.js';
const S = 'site/';
fs.rmSync(S, { recursive: true, force: true });
fs.mkdirSync(S + 'fonts', { recursive: true });
const want = [
  ['ibm-plex-sans', ['400', '400-italic', '500', '600']],
  ['ibm-plex-mono', ['400', '500']],
  ['source-serif-4', ['400', '400-italic', '500', '600', '600-italic']],
];
let css = '';
for (const [pkg, ws] of want) {
  for (const w of ws) {
    const src = fs.readFileSync(`../node_modules/@fontsource/${pkg}/${w}.css`, 'utf8');
    for (const block of src.split(/(?=\/\* )/)) {
      if (!/-latin(-ext)?-\d+-(normal|italic) \*\//.test(block)) continue;
      const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
      fs.copyFileSync(`../node_modules/@fontsource/${pkg}/files/${file}`, S + 'fonts/' + file);
      css += block.replace(/src: [^;]+;/, `src: url(fonts/${file}) format('woff2');`).trim() + '\n';
    }
  }
}
fs.writeFileSync(S + 'fonts.css', css);
const GF = /<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
const DESC = 'Grafic interactiv 3D al deciziilor posibile în litigiile de achiziții publice (Legea 101/2016) și ghid practic pentru avocați la început de drum. Gratuit, fără cont.';
const meta = (title, desc) => `<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:locale" content="ro_RO">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="fonts.css">`;
// index
let page = fs.readFileSync('out/harta.html', 'utf8');
if (!GF.test(page)) throw new Error('font link not found in map page');
page = page.replace(GF, meta('Graficul litigiilor în materia achizițiilor publice', DESC));
const index = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}*{box-sizing:border-box}</style>
${page.replace(/<header class="bar">[\s\S]*$/, '')}</head>
<body>
${page.match(/<header class="bar">[\s\S]*$/)[0]}
</body>
</html>
`;
fs.writeFileSync(S + 'index.html', index);
// ghid
let g = fs.readFileSync('out/ghid.html', 'utf8');
if (!GF.test(g)) throw new Error('font link not found in guide');
g = g.replace(GF, meta('Ghidul litigiilor în achiziții publice', 'Ghid practic de inițiere în litigiile din materia achizițiilor publice: cadrul normativ, contestația la CNSC, plângerea, căile extraordinare, litigiile după semnarea contractului și un caz practic.'));
fs.writeFileSync(S + 'ghid.html', g);
// despre
let d = fs.readFileSync('src/despre.html', 'utf8');
if (!GF.test(d)) throw new Error('font link not found in about page');
d = d.replace(GF, meta('Despre · Graficul litigiilor în materia achizițiilor publice', 'Șerban Sârbu, Managing Associate la Țuca Zbârcea & Asociații, autorul ghidului și al graficului litigiilor în materia achizițiilor publice: prezentare, data actualizării și date de contact.'))
  .replace('{{BIO}}', () => fs.readFileSync('src/despre_bio.html', 'utf8').trim()).replace('{{UPDATED}}', UPDATED);
fs.writeFileSync(S + 'despre.html', d);
fs.copyFileSync('src/serban-sarbu.webp', S + 'serban-sarbu.webp');
fs.writeFileSync(S + 'favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#16202A"/><path d="M7 22l9-5 9 5M7 15l9-5 9 5" fill="none" stroke="#87A3FF" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`);
fs.writeFileSync(S + '404.html', `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina nu există</title><link rel="stylesheet" href="/fonts.css"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#E6EAEE;color:#16202A;font:16px/1.5 "IBM Plex Sans",system-ui,sans-serif;padding:16px}@media (prefers-color-scheme:dark){body{background:#0E1318;color:#E1E7ED}a{color:#87A3FF}}h1{font:600 26px/1.2 "Source Serif 4",Georgia,serif;margin:0 0 8px}a{color:#2446B5}</style></head><body><main><h1>Pagina nu există</h1><p><a href="/">Înapoi la grafic</a> · <a href="/ghid.html">Ghidul</a> · <a href="/despre.html">Despre</a></p></main></body></html>`);
console.log(fs.readdirSync(S), fs.readdirSync(S + 'fonts').length, 'fonts');
