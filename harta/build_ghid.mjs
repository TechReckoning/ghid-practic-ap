import fs from 'fs';
import { NODES } from './src/data.js';
const G = '../ghid/';
const toc = fs.readFileSync(G + 'toc.json', 'utf8');
const body = fs.readFileSync(G + 'body.html', 'utf8');
const pri = { remediu: 0, decizie: 1, moment: 2, solutie: 3, risc: 4, link: 5 };
const map = {};
[...NODES].sort((a, b) => pri[a.type] - pri[b.type]).forEach((n) => n.ref.forEach((r) => {
  const k = r.split('–')[0];
  if (/^(IV|III|II|I)$/.test(k) || map[k]) return;
  map[k] = n.id;
}));
const out = fs.readFileSync(G + 'ghid_tpl.html', 'utf8')
  .replace('{{TOC_JSON}}', () => toc).replace('{{MAP_JSON}}', () => JSON.stringify(map)).replace('{{BODY}}', () => body);
fs.writeFileSync('out/ghid.html', out);
console.log('ghid', (out.length / 1024).toFixed(0) + 'KB', Object.keys(map).length, 'map links');
