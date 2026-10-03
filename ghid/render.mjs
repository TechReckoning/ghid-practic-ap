import { transformSync } from 'esbuild';
import fs from 'fs';
const kebab = (k) => k === 'viewBox' || k.startsWith('data-') || k.startsWith('aria-') ? k : k === 'className' ? 'class' : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
globalThis.__h = (tag, props, ...kids) => {
  if (typeof tag === 'function') return tag({ ...props, children: kids });
  const a = Object.entries(props || {}).filter(([k, v]) => v != null && v !== false && k !== 'key').map(([k, v]) => [k, k === 'style' && typeof v === 'object' ? Object.entries(v).map(([a, b]) => kebab(a) + ':' + b).join(';') : v]).map(([k, v]) => ` ${kebab(k)}="${esc(v).replace(/"/g, '&quot;')}"`).join('');
  const flat = (x) => Array.isArray(x) ? x.map(flat).join('') : x == null || x === false || x === true ? '' : typeof x === 'object' && x.__html ? x.__html : (typeof x === 'string' && x.startsWith('\u0000')) ? x.slice(1) : esc(x);
  return '\u0000' + `<${tag}${a}>${kids.map(flat).join('')}</${tag}>`;
};
globalThis.Frag = (p) => p.children;
globalThis.claude = { Visualize: (p) => { const f = p.children.flat().find((c) => typeof c === 'function'); return f({ rows: p.sources.rows.data, datum: () => ({}) }); } };
const out = {};
for (const f of fs.readdirSync('embeds')) {
  const src = fs.readFileSync('embeds/' + f, 'utf8');
  const js = transformSync(src, { loader: 'jsx', jsxFactory: '__h', jsxFragment: 'Frag', format: 'esm' }).code;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  let svg = mod.default();
  if (Array.isArray(svg)) svg = svg.join('');
  svg = svg.replace(/^\u0000/, '').replace(/\u0000/g, '');
  out[f.replace('.jsx', '')] = svg;
}
fs.writeFileSync('embeds.json', JSON.stringify(out));
for (const [k, v] of Object.entries(out)) console.log(k, v.length, v.slice(0, 90));
