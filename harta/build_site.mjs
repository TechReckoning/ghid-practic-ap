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
const DESC = 'Grafic interactiv al deciziilor posibile în litigiile de achiziții publice de până la încheierea contractului (Legea nr. 101/2016), legat de ghidul practic. Gratuit, fără cont.';
// Adresa publică: Netlify o dă la build în URL (domeniul principal). Local lipsește, iar legăturile rămân relative.
const SITE = (process.env.URL || '').replace(/\/$/, '');
const abs = (path) => SITE + '/' + path;
const meta = (title, desc, path) => `<meta name="description" content="${desc}">
${SITE ? `<link rel="canonical" href="${abs(path)}">\n<meta property="og:url" content="${abs(path)}">\n` : ''}<meta property="og:type" content="website">
<meta property="og:site_name" content="Ghidul litigiilor în achiziții publice">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:locale" content="ro_RO">
<meta property="og:image" content="${abs('og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Litigiile în materia achizițiilor publice: ghid practic și grafic interactiv">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="fonts.css">`;
// graficul (grafic.html)
let page = fs.readFileSync('out/harta.html', 'utf8');
if (!GF.test(page)) throw new Error('font link not found in map page');
page = page.replace(GF, meta('Graficul litigiilor în materia achizițiilor publice', DESC, 'grafic.html'));
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
fs.writeFileSync(S + 'grafic.html', index);
// ghidul — pagina principală (index.html)
let g = fs.readFileSync('out/ghid.html', 'utf8');
if (!GF.test(g)) throw new Error('font link not found in guide');
g = g.replace(GF, meta('Ghidul litigiilor în achiziții publice', 'Ghid practic de inițiere în litigiile din materia achizițiilor publice: cadrul normativ, contestația la CNSC, plângerea, căile extraordinare, litigiile după semnarea contractului și un caz practic.', ''));
fs.writeFileSync(S + 'index.html', g);
// despre
let d = fs.readFileSync('src/despre.html', 'utf8');
if (!GF.test(d)) throw new Error('font link not found in about page');
d = d.replace(GF, meta('Despre · Graficul litigiilor în materia achizițiilor publice', 'Șerban Sârbu, Managing Associate la Țuca Zbârcea & Asociații, autorul ghidului și al graficului litigiilor în materia achizițiilor publice: prezentare, data actualizării și date de contact.', 'despre.html'))
  .replace('{{BIO}}', () => fs.readFileSync('src/despre_bio.html', 'utf8').trim()).replace('{{UPDATED}}', UPDATED);
fs.writeFileSync(S + 'despre.html', d);
fs.copyFileSync('src/serban-sarbu.webp', S + 'serban-sarbu.webp');
fs.copyFileSync('src/og.png', S + 'og.png');
// motoarele de căutare: totul e public; harta site-ului doar când știm adresa (pe Netlify)
fs.writeFileSync(S + 'robots.txt', 'User-agent: *\nAllow: /\n' + (SITE ? `\nSitemap: ${abs('sitemap.xml')}\n` : ''));
if (SITE) {
  const day = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(S + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', 'grafic.html', 'despre.html'].map((p) => `  <url><loc>${abs(p)}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
}
fs.writeFileSync(S + 'favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#16202A"/><path d="M7 22l9-5 9 5M7 15l9-5 9 5" fill="none" stroke="#87A3FF" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`);
fs.writeFileSync(S + '404.html', `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina nu există</title><link rel="stylesheet" href="/fonts.css"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#E6EAEE;color:#16202A;font:16px/1.5 "IBM Plex Sans",system-ui,sans-serif;padding:16px}@media (prefers-color-scheme:dark){body{background:#0E1318;color:#E1E7ED}a{color:#87A3FF}}h1{font:600 26px/1.2 "Source Serif 4",Georgia,serif;margin:0 0 8px}a{color:#2446B5}</style></head><body><main><h1>Pagina nu există</h1><p><a href="/">Ghidul</a> · <a href="/grafic.html">Graficul</a> · <a href="/despre.html">Despre</a></p></main></body></html>`);
console.log(fs.readdirSync(S), fs.readdirSync(S + 'fonts').length, 'fonts');
