import dagre from '@dagrejs/dagre';
import { ROLES, TYPES, NODES, EDGES, PATHS, PHASES, HOLIDAYS } from './data.js';
import { UPDATED } from './site.js';

// ───────────────────────── model
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const edges = EDGES.map(([from, to, label, kind, hint], i) => ({ i, from, to, label: label || '', kind, short: label || '', hint: hint || {} }));
const outE = {}, inE = {};
NODES.forEach((n) => { outE[n.id] = []; inE[n.id] = []; });
edges.forEach((e) => { outE[e.from].push(e); inE[e.to].push(e); });
const phaseOf = {};
PHASES.forEach((P, i) => P.nodes.forEach((id) => { phaseOf[id] = i; }));

const state = {
  sel: null, role: 'all', showRisk: true, view: 'graf',
  path: null, step: 0,
};

// ───────────────────────── DOM
const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const panelBody = $('#panel-body');
const panel = $('#panel');
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const x = document.createElementNS(SVGNS, tag);
  for (const k in attrs) x.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(x);
  return x;
};
const TYPE_GLYPH = { moment: '■', decizie: '⬢', raspuns: '●', act: '■', remediu: '■', solutie: '■', risc: '▲', faza: '➜' };

// ───────────────────────── text measurement & wrapping
const mctx = document.createElement('canvas').getContext('2d');
function measure(text, font) { mctx.font = font; return mctx.measureText(text).width; }
function wrap(text, maxW, font) {
  const lines = []; let line = '';
  for (const w of String(text).split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (line && measure(t, font) > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
const F_NODE = '500 12.5px "IBM Plex Sans", system-ui, sans-serif';
const F_DEC = '600 12.5px "IBM Plex Sans", system-ui, sans-serif';
const F_EDGE = 'italic 400 11px "IBM Plex Sans", system-ui, sans-serif';
const F_PHASE = '600 15px "Source Serif 4", Georgia, serif';
const LH = 16, ELH = 14;

// ───────────────────────── layout (dagre, de sus în jos, fazele ca grupuri)
// Capcanele cu mai multe surse se desenează o dată pentru fiecare sursă (copii), ca să nu traverseze graficul.
const items = {}; // cheie de afișare -> { key, id, n, w, h, lines }
const edgeTarget = {}; // e.i -> cheia de afișare a destinației
const itemsOf = {}; // id etapă -> [chei]
function boxFor(n) {
  if (n.type === 'raspuns') return { lines: [n.s], w: 56, h: 30 };
  const font = n.type === 'decizie' ? F_DEC : F_NODE;
  const maxW = n.type === 'decizie' ? 170 : 160;
  const lines = wrap(n.t, maxW, font);
  const tw = Math.max(...lines.map((l) => measure(l, font)));
  const padX = n.type === 'decizie' ? 34 : 14;
  return { lines, w: Math.ceil(tw + padX * 2), h: lines.length * LH + 16 };
}
let world, gNodes, gEdges, gLabels, gPhases, bounds;
// O capcană se desenează lângă etapa din care pleacă. Dacă are mai multe surse (sau sursa e în altă fază),
// apare câte o copie lângă fiecare sursă.
const riskIn = {};
edges.forEach((e) => { if (byId[e.to].type === 'risc') riskIn[e.to] = (riskIn[e.to] || 0) + 1; });
const riskCopied = (id) => byId[id].type === 'risc' && !(riskIn[id] === 1 && inE[id].every((e) => phaseOf[e.from] === phaseOf[id]));
// Legăturile unei etape spre altă fază se adună într-un singur portal pe fază-destinație.
// Portal cu o singură destinație: arată etapa; cu mai multe: arată faza (detaliile sunt în fișa etapei).
function portalLabel(it) { return it.targets.length === 1 ? `→ ${PHASES[it.phaseTo].name.split(' · ')[0]} · ${byId[it.targets[0]].s}` : `→ ${PHASES[it.phaseTo].name}`; }
function layoutPhase(P, pi) {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 34, edgesep: 16, marginx: 0, marginy: 0, ranker: 'network-simplex' });
  g.setDefaultEdgeLabel(() => ({}));
  const local = {};
  const add = (key, n) => {
    if (local[key]) return;
    const b = boxFor(n);
    local[key] = { key, id: n.id, n, portal: false, phase: pi, ...b };
    g.setNode(key, { width: b.w, height: b.h });
  };
  P.nodes.forEach((id) => { if (!riskCopied(id)) add(id, byId[id]); });
  const groups = {}; // cheie de legătură -> { from, to, edges[] }
  edges.filter((e) => phaseOf[e.from] === pi).forEach((e) => {
    let to = e.to;
    if (phaseOf[e.to] !== pi && !(byId[e.to].type === 'risc' && riskIn[e.to] === 1)) {
      to = `pt:${e.from}:${phaseOf[e.to]}`;
      if (!local[to]) local[to] = { key: to, portal: true, phase: pi, phaseTo: phaseOf[e.to], targets: [], kinds: [] };
      local[to].targets.push(e.to);
    } else {
      if (riskCopied(e.to)) to = e.to + '@' + e.from;
      add(to, byId[e.to]);
    }
    edgeTarget[e.i] = to;
    const gk = e.from + '>' + to;
    (groups[gk] = groups[gk] || { from: e.from, to, edges: [] }).edges.push(e);
  });
  Object.values(local).filter((it) => it.portal).forEach((it) => {
    it.id = it.targets[0];
    it.n = byId[it.id];
    it.lines = wrap(portalLabel(it), 180, F_NODE);
    it.w = Math.ceil(Math.max(...it.lines.map((l) => measure(l, F_NODE))) + 24);
    it.h = it.lines.length * LH + 14;
    g.setNode(it.key, { width: it.w, height: it.h });
  });
  Object.entries(groups).forEach(([gk, G]) => {
    const e = G.edges[0];
    const texts = G.edges.flatMap((x) => (x.label ? x.label.split('\n') : []));
    const lines = texts.flatMap((t) => wrap(t, 170, F_EDGE));
    const lw = lines.length ? Math.max(...lines.map((l) => measure(l, F_EDGE))) + 12 : 0;
    const kind = e.kind;
    g.setEdge(G.from, G.to, { group: G, kind, lines, width: lw, height: lines.length ? lines.length * ELH + 6 : 0, labelpos: 'c', weight: kind === 'loop' ? 0 : kind === 'risk' ? 1 : 2, minlen: 1 }, gk);
  });
  if (P.nodes.every((id) => byId[id].pos)) placeFixed(g, local); else dagre.layout(g);
  return { g, local };
}
// Așezarea din schemele draw.io ale lui Serban: pozițiile casetelor (pos), punctele intermediare ale săgeților (w)
// și locul etichetelor (lp), cu distanțele mărite ca textul să încapă în casete lizibile.
const SX = 1.65, SY = 1.3;
function pointAt(poly, t) {
  const seg = []; let tot = 0;
  for (let i = 1; i < poly.length; i++) { const l = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y); seg.push(l); tot += l; }
  let d = tot * Math.max(0, Math.min(1, t));
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? d / seg[i] : 0; return { x: poly[i].x + (poly[i + 1].x - poly[i].x) * k, y: poly[i].y + (poly[i + 1].y - poly[i].y) * k }; }
    d -= seg[i];
  }
  return poly[0];
}
// Traseu ortogonal între două casete, ca în draw.io: pleacă din punctul de ieșire ales pe caseta-sursă (o),
// intră prin punctul de intrare ales pe caseta-țintă (i) și trece prin punctele intermediare (wps).
function port(N, f, toward, preferV) {
  if (f) {
    const [fx, fy] = f;
    const x = N.x - N.width / 2 + fx * N.width, y = N.y - N.height / 2 + fy * N.height;
    const v = fy <= 0.01 || fy >= 0.99 ? true : fx <= 0.01 || fx >= 0.99 ? false : Math.abs(toward.y - N.y) > Math.abs(toward.x - N.x);
    return { x, y, v };
  }
  const dx = toward.x - N.x, dy = toward.y - N.y;
  if (Math.abs(dy) > N.height / 2 + 4 && (preferV || Math.abs(dy) * 1.2 >= Math.abs(dx) - N.width / 2)) return { x: N.x, y: N.y + Math.sign(dy) * N.height / 2, v: true };
  return { x: N.x + Math.sign(dx || 1) * N.width / 2, y: N.y, v: false };
}
function fixedRoute(A, B, wps, o, inn) {
  const a = port(A, o, wps[0] || B);
  // fără punct de intrare fixat: dacă săgeata vine pe verticală, intră prin latura de sus/jos (ca în draw.io)
  const b = port(B, inn, wps[wps.length - 1] || a, wps.length ? false : a.v);
  const poly = [{ x: a.x, y: a.y }];
  let vert = a.v;
  const go = (q) => {
    const p = poly[poly.length - 1];
    if (Math.abs(p.x - q.x) < 1) { poly.push({ x: q.x, y: q.y }); vert = true; return; }
    if (Math.abs(p.y - q.y) < 1) { poly.push({ x: q.x, y: q.y }); vert = false; return; }
    if (vert) { poly.push({ x: p.x, y: q.y }, { x: q.x, y: q.y }); vert = false; } else { poly.push({ x: q.x, y: p.y }, { x: q.x, y: q.y }); vert = true; }
  };
  wps.forEach(go);
  const p = poly[poly.length - 1];
  if (Math.abs(p.x - b.x) < 1 || Math.abs(p.y - b.y) < 1) poly.push({ x: b.x, y: b.y });
  else if (vert && b.v) {
    // ca în draw.io: ramificația se face imediat după caseta-sursă (dacă nu sunt puncte intermediare)
    const my = poly.length === 1 ? p.y + Math.sign(b.y - p.y) * Math.min(26, Math.abs(b.y - p.y) / 2) : (p.y + b.y) / 2;
    poly.push({ x: p.x, y: my }, { x: b.x, y: my }, { x: b.x, y: b.y });
  } else if (!vert && !b.v) {
    const mx = poly.length === 1 ? p.x + Math.sign(b.x - p.x) * Math.min(26, Math.abs(b.x - p.x) / 2) : (p.x + b.x) / 2;
    poly.push({ x: mx, y: p.y }, { x: mx, y: b.y }, { x: b.x, y: b.y });
  }
  else if (vert) poly.push({ x: p.x, y: b.y }, { x: b.x, y: b.y });
  else poly.push({ x: b.x, y: p.y }, { x: b.x, y: b.y });
  return poly.filter((q, k) => k === 0 || Math.abs(q.x - poly[k - 1].x) > 0.5 || Math.abs(q.y - poly[k - 1].y) > 0.5);
}
function placeFixed(g, local) {
  g.nodes().forEach((k) => { const n = byId[local[k].id]; const q = g.node(k); q.x = n.pos[0] * SX; q.y = n.pos[1] * SY; });
  g.edges().forEach((ed) => {
    const L = g.edge(ed);
    const hint = L.group.edges.find((x) => x.label)?.hint || L.group.edges[0].hint;
    const wps = (hint.w || []).map(([x, y]) => ({ x: x * SX, y: y * SY }));
    L.poly = fixedRoute(g.node(ed.v), g.node(ed.w), wps, hint.o, hint.i);
    const p = pointAt(L.poly, ((hint.lp ?? 0) + 1) / 2);
    L.x = p.x; L.y = p.y;
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const inc = (x, y, w = 0, h = 0) => { x0 = Math.min(x0, x - w / 2); x1 = Math.max(x1, x + w / 2); y0 = Math.min(y0, y - h / 2); y1 = Math.max(y1, y + h / 2); };
  g.nodes().forEach((k) => { const q = g.node(k); inc(q.x, q.y, q.width, q.height); });
  g.edges().forEach((ed) => { const L = g.edge(ed); L.poly.forEach((q) => inc(q.x, q.y)); if (L.lines.length) inc(L.x, L.y, L.width, L.height); });
  g.nodes().forEach((k) => { const q = g.node(k); q.x -= x0; q.y -= y0; });
  g.edges().forEach((ed) => { const L = g.edge(ed); L.poly.forEach((q) => { q.x -= x0; q.y -= y0; }); L.x -= x0; L.y -= y0; });
  Object.assign(g.graph(), { width: x1 - x0, height: y1 - y0 });
}
function roundPath(P) {
  let d = `M${P[0].x.toFixed(1)},${P[0].y.toFixed(1)}`;
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const r = Math.min(7, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y), vx = Math.sign(c.x - b.x), vy = Math.sign(c.y - b.y);
    d += `L${(b.x - ux * r).toFixed(1)},${(b.y - uy * r).toFixed(1)}Q${b.x.toFixed(1)},${b.y.toFixed(1)} ${(b.x + vx * r).toFixed(1)},${(b.y + vy * r).toFixed(1)}`;
  }
  return d + `L${P[P.length - 1].x.toFixed(1)},${P[P.length - 1].y.toFixed(1)}`;
}
function buildLayout() {
  const PAD = 26, TITLE = 40, GAP = 34;
  const parts = PHASES.map((P, i) => ({ P, ...layoutPhase(P, i) }));
  parts.forEach((pt) => { const gg = pt.g.graph(); pt.w = Math.max(gg.width, measure(pt.P.name, F_PHASE) + 10) + PAD * 2; pt.h = gg.height + PAD + TITLE; pt.gw = gg.width; });
  const W = Math.max(...parts.map((pt) => pt.w));
  let y = 30;
  parts.forEach((pt) => {
    pt.box = { x: 30 + (W - pt.w) / 2, y, w: pt.w, h: pt.h };
    pt.ox = pt.box.x + (pt.w - pt.gw) / 2; pt.oy = y + TITLE;
    y += pt.h + GAP;
  });
  bounds = { x: 0, y: 0, w: W + 60, h: y + 30 - GAP };
  return parts;
}

// Săgeată ortogonală (segmente verticale și orizontale, colțuri ușor rotunjite), prin punctele date de dagre.
// Pleacă din mijlocul laturii de jos a casetei-sursă și intră prin mijlocul laturii de sus a casetei-țintă
// (invers, dacă ținta e mai sus).
function orth(points, A, B, ox, oy) {
  const down = B.y >= A.y;
  const p0 = { x: A.x, y: A.y + (down ? A.height / 2 : -A.height / 2) };
  const pn = { x: B.x, y: B.y + (down ? -B.height / 2 : B.height / 2) };
  const mid = points.slice(1, -1);
  const pts = [p0, ...mid, pn];
  const poly = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = poly[poly.length - 1], b = pts[i];
    if (Math.abs(a.x - b.x) < 0.5) { poly.push(b); continue; }
    const my = i === pts.length - 1 ? b.y - (down ? 14 : -14) : (a.y + b.y) / 2;
    poly.push({ x: a.x, y: my }, { x: b.x, y: my }, b);
  }
  const P = poly.filter((q, i) => i === 0 || Math.abs(q.x - poly[i - 1].x) > 0.5 || Math.abs(q.y - poly[i - 1].y) > 0.5).map((q) => ({ x: q.x + ox, y: q.y + oy }));
  let d = `M${P[0].x.toFixed(1)},${P[0].y.toFixed(1)}`;
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const r = Math.min(7, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y), vx = Math.sign(c.x - b.x), vy = Math.sign(c.y - b.y);
    d += `L${(b.x - ux * r).toFixed(1)},${(b.y - uy * r).toFixed(1)}Q${b.x.toFixed(1)},${b.y.toFixed(1)} ${(b.x + vx * r).toFixed(1)},${(b.y + vy * r).toFixed(1)}`;
  }
  d += `L${P[P.length - 1].x.toFixed(1)},${P[P.length - 1].y.toFixed(1)}`;
  return d;
}

// curbă netedă prin punctele date de dagre (Catmull-Rom → Bézier)
function smooth(pts) {
  if (pts.length < 3) return `M${pts[0].x},${pts[0].y}L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
function shapePath(type, w, h) {
  const x = -w / 2, y = -h / 2;
  if (type === 'portal') { const r = 6; return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`; }
  if (type === 'decizie') { const s = 16; return `M${x + s},${y}H${x + w - s}L${x + w},0L${x + w - s},${y + h}H${x + s}L${x},0Z`; }
  const r = type === 'raspuns' ? h / 2 : type === 'moment' || type === 'solutie' ? 8 : 4;
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}

const svg = el('svg', { id: 'g2d', role: 'img', 'aria-label': 'Graficul deciziilor, ca schemă de flux' }, stage);
const drawn = []; // linii desenate: { path, lab, kind, edges[] }
function render() {
  drawn.length = 0;
  const parts = buildLayout();
  svg.innerHTML = '';
  const defs = el('defs', {}, svg);
  ['flow', 'choice', 'risk', 'loop', 'out', 'acc'].forEach((k) => {
    const m = el('marker', { id: 'a-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0 0L10 5L0 10z', class: 'ah k-' + k }, m);
  });
  world = el('g', { id: 'world' }, svg);
  gPhases = el('g', { class: 'phases' }, world);
  gEdges = el('g', { class: 'edges' }, world);
  gLabels = el('g', { class: 'elabels' }, world);
  gNodes = el('g', { class: 'nodes' }, world);
  parts.forEach((pt) => {
    const { P, g, local, ox, oy, box } = pt;
    P.box = box;
    const gp = el('g', { class: 'phase', 'data-ph': P.id }, gPhases);
    el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 12 }, gp);
    const tx = el('text', { x: box.x + 16, y: box.y + 26, class: 'ph-t' }, gp);
    tx.textContent = P.name;
    g.edges().forEach((ed) => {
      const L = g.edge(ed);
      const d = L.poly ? roundPath(L.poly.map((q) => ({ x: q.x + ox, y: q.y + oy }))) : orth(L.points, g.node(ed.v), g.node(ed.w), ox, oy);
      const path = el('path', { d, class: `ed k-${L.kind}`, 'marker-end': `url(#a-${L.kind})` }, gEdges);
      let lab = null;
      if (L.lines.length) {
        lab = el('g', { class: `el k-${L.kind}`, transform: `translate(${L.x + ox},${L.y + oy})` }, gLabels);
        el('rect', { x: -L.width / 2, y: -L.height / 2, width: L.width, height: L.height, rx: 3 }, lab);
        L.lines.forEach((l, k) => { const t = el('text', { x: 0, y: -L.height / 2 + 12 + k * ELH, 'text-anchor': 'middle' }, lab); t.textContent = l; });
      }
      drawn.push({ path, lab, kind: L.kind, edges: L.group.edges });
    });
    Object.values(local).forEach((it) => {
      const q = g.node(it.key);
      it.x = q.x + ox; it.y = q.y + oy;
      const key = it.portal ? `${P.id}|${it.key}` : it.key;
      items[key] = it;
      if (!it.portal) (itemsOf[it.id] = itemsOf[it.id] || []).push(key);
      const ng = el('g', { class: `nd t-${it.n.type}${it.portal ? ' portal' : ''}`, transform: `translate(${it.x},${it.y})`, 'data-id': it.id, tabindex: 0, role: 'button', 'aria-label': it.portal ? portalLabel(it) : it.n.t }, gNodes);
      el('path', { d: shapePath(it.portal ? 'portal' : it.n.type === 'faza' ? 'portal' : it.n.type, it.w, it.h), class: 'shape' }, ng);
      it.lines.forEach((l, k) => {
        const t = el('text', { x: 0, y: -it.lines.length * LH / 2 + LH / 2 + 4.5 + k * LH, 'text-anchor': 'middle' }, ng);
        t.textContent = l;
      });
      const tt = el('title', {}, ng); tt.textContent = it.portal ? it.targets.map((id) => byId[id].t).join(' · ') : it.n.t;
      const act = () => {
        if (it.portal && it.targets.length > 1) fitBox(PHASES[it.phaseTo].box, { maxK: 1 });
        else if (it.n.type === 'faza' && it.n.go.length === 1 && !state.path) select(it.n.go[0], { fly: true });
        else select(it.id, { fly: true });
      };
      ng.addEventListener('click', (ev) => { ev.stopPropagation(); if (!dragMoved) act(); });
      ng.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); } });
      it.g = ng;
    });
  });
  const sel = $('#phase-go');
  if (sel && !sel.options.length) {
    sel.appendChild(new Option('Mergi la faza…', ''));
    PHASES.forEach((P) => sel.appendChild(new Option(P.name, P.id)));
  }
}

// ───────────────────────── emphasis
function reach(start, dirMap, key) {
  const seen = new Set();
  const q = [start];
  while (q.length) {
    const id = q.shift();
    for (const e of dirMap[id]) {
      if (e.kind === 'loop') continue;
      const nx = e[key];
      if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
    }
  }
  seen.delete(start);
  return seen;
}
function visibleNode(n) {
  if (!state.showRisk && n.type === 'risc') return false;
  return true;
}
function computeLevels() {
  const lv = {};
  const elv = {};
  const accentEdges = new Set();
  if (state.path) {
    const P = PATHS.find((p) => p.id === state.path);
    const set = new Set(P.nodes);
    NODES.forEach((n) => { lv[n.id] = set.has(n.id) ? 'mid' : 'dim'; });
    P.nodes.slice(0, state.step + 1).forEach((id) => { lv[id] = 'strong'; });
    for (let i = 1; i < P.nodes.length; i++) {
      const e = edges.find((x) => x.from === P.nodes[i - 1] && x.to === P.nodes[i]);
      if (e) { accentEdges.add(e.i); elv[e.i] = i <= state.step ? 'strong' : 'mid'; }
    }
  } else if (state.sel) {
    const next = new Set(outE[state.sel].map((e) => e.to));
    const desc = reach(state.sel, outE, 'to');
    const anc = reach(state.sel, inE, 'from');
    NODES.forEach((n) => {
      lv[n.id] = n.id === state.sel || next.has(n.id) ? 'strong' : desc.has(n.id) || anc.has(n.id) ? 'mid' : 'dim';
    });
    outE[state.sel].forEach((e) => { accentEdges.add(e.i); elv[e.i] = 'strong'; });
    inE[state.sel].forEach((e) => { elv[e.i] = 'mid'; });
  } else {
    NODES.forEach((n) => { lv[n.id] = 'base'; });
  }
  if (state.role !== 'all') {
    NODES.forEach((n) => { if (!n.roles.includes(state.role)) lv[n.id] = 'dim'; });
  }
  return { lv, elv, accentEdges };
}
function applyEmphasis() {
  const { lv, elv, accentEdges } = computeLevels();
  Object.values(items).forEach((it) => {
    const ids = it.portal ? it.targets : [it.id];
    const vis = ids.some((id) => visibleNode(byId[id]));
    it.g.style.display = vis ? '' : 'none';
    it.g.dataset.lv = ids.map((id) => lv[id]).sort((a, b) => ({ dim: 0, mid: 1, base: 2, strong: 3 })[b] - ({ dim: 0, mid: 1, base: 2, strong: 3 })[a])[0];
    it.g.classList.toggle('sel', it.id === state.sel);
  });
  const RANK = { dim: 0, mid: 1, base: 2, strong: 3 };
  drawn.forEach((d) => {
    let best = 'dim', acc = false, vis = false;
    d.edges.forEach((e) => {
      if (visibleNode(byId[e.from]) && visibleNode(byId[e.to])) vis = true;
      let l = elv[e.i];
      if (!l) l = lv[e.from] === 'dim' || lv[e.to] === 'dim' ? 'dim' : lv[e.from] === 'base' ? 'base' : 'mid';
      if (RANK[l] > RANK[best]) best = l;
      if (accentEdges.has(e.i)) acc = true;
    });
    for (const x of [d.path, d.lab]) {
      if (!x) continue;
      x.style.display = vis ? '' : 'none';
      x.dataset.lv = best;
      x.classList.toggle('acc', acc);
    }
    d.path.setAttribute('marker-end', `url(#a-${acc ? 'acc' : d.kind})`);
  });
  // casetele fazelor rămân vizibile; se estompează doar cele fără nimic evidențiat
  PHASES.forEach((P) => {
    const any = P.nodes.some((id) => lv[id] !== 'dim');
    gPhases.querySelector(`[data-ph="${P.id}"]`).dataset.lv = any ? 'base' : 'dim';
  });
}

// ───────────────────────── pan & zoom
const view = { x: 0, y: 0, k: 1 };
let anim = null;
function applyView() { world.setAttribute('transform', `translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.k.toFixed(4)})`); }
const clampK = (k) => Math.max(0.15, Math.min(2.2, k));
function vpSize() { const r = stage.getBoundingClientRect(); return { w: r.width, h: r.height }; }
function animateTo(t, ms = 450) {
  const from = { ...view };
  const t0 = performance.now();
  cancelAnimationFrame(anim);
  const step = (now) => {
    const a = Math.min(1, (now - t0) / ms);
    const e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
    view.x = from.x + (t.x - from.x) * e; view.y = from.y + (t.y - from.y) * e; view.k = from.k + (t.k - from.k) * e;
    applyView();
    if (a < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function fitBox(b, { top = false, pad = 24, maxK = 1.1, minK = 0, animate = true } = {}) {
  const { w, h } = vpSize();
  const k = clampK(Math.max(minK, Math.min(maxK, (w - pad * 2) / b.w, top ? Infinity : (h - pad * 2) / b.h)));
  const t = { k, x: w / 2 - (b.x + b.w / 2) * k, y: top ? pad - b.y * k : h / 2 - (b.y + b.h / 2) * k };
  if (animate) animateTo(t); else { Object.assign(view, t); applyView(); }
}
function focusNode(id) {
  const keys = itemsOf[id] || [];
  if (!keys.length) return;
  const it = items[keys[0]];
  const { w, h } = vpSize();
  const k = Math.max(view.k, Math.min(1, w / 420));
  animateTo({ k, x: w / 2 - it.x * k, y: h / 2 - it.y * k });
}
function zoomAt(f, cx, cy) {
  const k = clampK(view.k * f);
  view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k;
  applyView();
}
const pointers = new Map();
let dragStart = null, dragMoved = false, pinch = null;
svg.addEventListener('pointerdown', (ev) => {
  cancelAnimationFrame(anim);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  dragMoved = false;
  if (pointers.size === 1) dragStart = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
  }
});
svg.addEventListener('pointermove', (ev) => {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const r = svg.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((pinch.k * d / pinch.d) / view.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    dragMoved = true;
    return;
  }
  if (!dragStart) return;
  const dx = ev.clientX - dragStart.x, dy = ev.clientY - dragStart.y;
  if (!dragMoved && Math.hypot(dx, dy) < 5) return;
  if (!dragMoved) svg.setPointerCapture(ev.pointerId);
  dragMoved = true;
  view.x = dragStart.vx + dx; view.y = dragStart.vy + dy;
  applyView();
});
const endPtr = (ev) => {
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    if (!dragMoved && ev.type === 'pointerup' && !ev.target.closest('.nd') && !state.path) select(null);
    dragStart = null;
  }
};
svg.addEventListener('pointerup', endPtr);
svg.addEventListener('pointercancel', endPtr);
svg.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  cancelAnimationFrame(anim);
  const r = svg.getBoundingClientRect();
  if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), ev.clientX - r.left, ev.clientY - r.top);
  else { view.x -= ev.deltaX; view.y -= ev.deltaY; applyView(); }
}, { passive: false });

// ───────────────────────── selection & panel
function select(id, { fly = false } = {}) {
  state.sel = id;
  if (state.path) {
    const P = PATHS.find((p) => p.id === state.path);
    const k = P.nodes.indexOf(id);
    if (k >= 0) state.step = k; else exitPath(false);
  }
  applyEmphasis();
  renderPanel();
  if (id) openSheet();
  // centrarea se face după ce fișa s-a deschis (pe telefon, fișa micșorează zona graficului)
  if (id && fly && state.view === 'graf') requestAnimationFrame(() => focusNode(id));
  if (state.view === 'list' && id) {
    const li = document.getElementById(`li-${id}`);
    if (li) { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    document.querySelectorAll('.li.on').forEach((x) => x.classList.remove('on'));
    li?.classList.add('on');
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function chip(type) { return `<span class="chip t-${type}"><i aria-hidden="true">${TYPE_GLYPH[type]}</i>${TYPES[type]}</span>`; }

function renderPanel() {
  const pathBar = renderPathBar();
  if (!state.sel) {
    panelBody.innerHTML = pathBar + INTRO;
    bindPathBar();
    return;
  }
  const n = byId[state.sel];
  const where = PHASES[phaseOf[n.id]].name;
  const roles = n.roles.length === 3 ? '' : `<p class="roles">${n.roles.map((r) => `<span>${ROLES[r]}</span>`).join('')}</p>`;
  const fields = (n.f || []).map(([k, v]) => `<div class="fld"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const nxt = outE[n.id].filter((e, i, A) => A.findIndex((x) => x.to === e.to && x.label === e.label) === i).map((e) => edgeBtn(e, e.to)).join('')
    + (n.type === 'faza' ? n.go.map((id) => `<li><button type="button" data-go="${id}" class="eb k-flow"><span class="eb-l">Mergi la ${esc(byId[id].t)}</span><span class="eb-t"><i class="g t-${byId[id].type}" aria-hidden="true">${TYPE_GLYPH[byId[id].type]}</i>${esc(PHASES[phaseOf[id]].name)}</span></button></li>`).join('') : '');
  const prv = inE[n.id].filter((e, i, A) => A.findIndex((x) => x.from === e.from && x.label === e.label) === i).map((e) => edgeBtn(e, e.from, true)).join('')
    + NODES.filter((m) => m.type === 'faza' && m.go.includes(n.id)).map((m) => `<li><button type="button" data-go="${m.id}" class="eb k-flow"><span class="eb-l">Din ${esc(PHASES[phaseOf[m.id]].name)}</span><span class="eb-t"><i class="g t-faza" aria-hidden="true">${TYPE_GLYPH.faza}</i>trimitere</span></button></li>`).join('');
  const sum = n.type === 'faza' ? `Graficul continuă în altă fază. ${n.go.length > 1 ? 'Alege unde mergi:' : 'Mergi direct la etapa de mai jos.'}` : n.sum;
  panelBody.innerHTML = `${pathBar}
    <div class="ph">
      <div class="crumbs">${esc(where)}</div>
      <div class="ph-row">${chip(n.type)}<button type="button" class="x" id="close-node" aria-label="Închide fișa">Închide</button></div>
      <h2>${esc(n.t)}</h2>
      ${roles}
    </div>
    <p class="sum">${esc(sum)}</p>
    ${n.warn ? `<p class="warn"><b>Atenție.</b> ${esc(n.warn)}</p>` : ''}
    ${fields ? `<dl class="fields">${fields}</dl>` : ''}
    ${n.calc ? calcHTML(n) : ''}
    ${nxt ? `<h3>Ce urmează</h3><ul class="edges">${nxt}</ul>` : ''}
    ${prv ? `<h3>Cum ajungi aici</h3><ul class="edges prev">${prv}</ul>` : ''}
    ${n.ref.length || n.art ? `<p class="refs">${n.ref.length ? `<span>Ghid ${n.ref.map((r) => `<a href="./#${refAnchor(r)}">${esc(r)}</a>`).join(' · ')}</span>` : ''}${n.art ? `<span>${esc(n.art)}</span>` : ''}</p>` : ''}`;
  panelBody.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go, { fly: true })));
  $('#close-node').addEventListener('click', () => select(null));
  bindPathBar();
  if (n.calc) bindCalc(n);
  panelBody.scrollTop = 0;
}
function refAnchor(r) {
  const k = r.split('–')[0];
  return /^(IV|III|II|I)$/.test(k) ? `partea-${k}` : k;
}
function edgeBtn(e, other, back) {
  const o = byId[other];
  const hidden = !visibleNode(o) ? ' data-hidden="1"' : '';
  return `<li><button type="button" data-go="${o.id}" class="eb k-${e.kind}"${hidden}>
    <span class="eb-l">${esc(back ? o.t : (e.label ? e.label.replace(/\n/g, ' · ') : o.t))}</span>
    <span class="eb-t"><i class="g t-${o.type}" aria-hidden="true">${TYPE_GLYPH[o.type]}</i>${esc(back ? (e.label ? e.label.replace(/\n/g, ' · ') : TYPES[o.type]) : (e.label ? o.t : TYPES[o.type]))}</span>
  </button></li>`;
}

// ───────────────────────── paths
function renderPathBar() {
  if (!state.path) return '';
  const P = PATHS.find((p) => p.id === state.path);
  const n = P.nodes.length;
  const dots = P.nodes.map((id, i) => `<button type="button" class="dot${i === state.step ? ' on' : ''}${i < state.step ? ' done' : ''}" data-step="${i}" aria-label="Pasul ${i + 1}: ${esc(byId[id].s)}"></button>`).join('');
  return `<div class="pathbar">
    <div class="pb-top"><span class="pb-k">Traseu</span><b>${esc(P.name)}</b><button type="button" class="x" id="pb-exit">Ieși din traseu</button></div>
    <div class="dots">${dots}</div>
    <div class="pb-nav"><button type="button" id="pb-prev" ${state.step === 0 ? 'disabled' : ''}>Pasul anterior</button>
    <span class="pb-n">${state.step + 1} / ${n}</span>
    <button type="button" id="pb-next" class="pri" ${state.step === n - 1 ? 'disabled' : ''}>Pasul următor</button></div>
  </div>`;
}
function bindPathBar() {
  if (!state.path) return;
  const P = PATHS.find((p) => p.id === state.path);
  $('#pb-exit').addEventListener('click', () => exitPath(true));
  $('#pb-prev').addEventListener('click', () => goStep(state.step - 1));
  $('#pb-next').addEventListener('click', () => goStep(state.step + 1));
  panelBody.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => goStep(+b.dataset.step)));
}
function goStep(k) {
  const P = PATHS.find((p) => p.id === state.path);
  state.step = Math.max(0, Math.min(P.nodes.length - 1, k));
  select(P.nodes[state.step], { fly: true });
}
function startPath(id) {
  if (!id) { exitPath(true); return; }
  state.path = id;
  state.step = 0;
  goStep(0);
}
function exitPath(rerender) {
  state.path = null;
  $('#path').value = '';
  if (rerender) { applyEmphasis(); renderPanel(); }
}

// ───────────────────────── deadline calculator (art. 5 L101: sistem intermediar)
const HSET = new Set(HOLIDAYS);
const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const fmtRO = (d) => `${ZILE[d.getDay()]}, ${d.getDate()} ${LUNI[d.getMonth()]} ${d.getFullYear()}`;
function deadline(startISO, days) {
  const [y, m, dd] = startISO.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + days);
  const moved = [];
  while (d.getDay() === 0 || d.getDay() === 6 || HSET.has(fmtISO(d))) { moved.push(fmtISO(d)); d.setDate(d.getDate() + 1); }
  return { d, moved };
}
let calcDate = null;
function calcHTML(n) {
  const z = n.calc.zile;
  const opts = z.length > 1
    ? `<div class="seg" role="radiogroup" aria-label="Pragul">${z.map((v, i) => `<label><input type="radio" name="prag" id="prag-${v}" value="${v}" ${i === 0 ? 'checked' : ''}><span>${i === 0 ? 'Peste pragul UE' : 'Sub prag'} · ${v} zile</span></label>`).join('')}</div>`
    : `<p class="calc-fixed">Termen: ${z[0]} zile</p>`;
  return `<section class="calc" aria-label="Calculator de termen">
    <h3>Calculează termenul</h3>
    <label class="calc-l" for="calc-date">${esc(n.calc.de)}</label>
    <input type="date" id="calc-date">
    ${opts}
    <output id="calc-out" class="calc-out"></output>
    <p class="calc-note">Ziua evenimentului nu se numără; termenul se încheie la ora 24:00 a ultimei zile; dacă aceasta e nelucrătoare, se prelungește până la sfârșitul primei zile lucrătoare (art. 5 L101). Sărbătorile legale sunt incluse pentru 2026–2027. Rezultatul are caracter informativ.</p>
  </section>`;
}
function bindCalc(n) {
  const inp = $('#calc-date');
  if (!calcDate) calcDate = fmtISO(new Date());
  inp.value = calcDate;
  const run = () => {
    calcDate = inp.value || calcDate;
    const sel = panelBody.querySelector('input[name="prag"]:checked');
    const days = sel ? +sel.value : n.calc.zile[0];
    if (!inp.value) { $('#calc-out').textContent = 'Alege o dată.'; return; }
    const { d, moved } = deadline(inp.value, days);
    $('#calc-out').innerHTML = `Expiră <b>${fmtRO(d)}</b>, ora 24:00${moved.length ? `<small>prelungit cu ${moved.length} ${moved.length === 1 ? 'zi nelucrătoare' : 'zile nelucrătoare'}</small>` : ''}`;
  };
  inp.addEventListener('input', run);
  panelBody.querySelectorAll('input[name="prag"]').forEach((r) => r.addEventListener('change', run));
  run();
}

// ───────────────────────── intro content
const LEGEND = [
  ['moment', 'Etapă a procedurii'],
  ['decizie', 'Întrebare'],
  ['raspuns', 'Răspunsul la întrebare: Da / Nu'],
  ['remediu', 'Acțiune, act procedural sau situație: cereri, contestații, soluții'],
  ['act', 'Act sau conduită a autorității contractante'],
  ['risc', 'Capcană: ce se întâmplă dacă ratezi un termen sau o condiție'],
  ['faza', 'Trimitere la altă fază; clic pentru a merge acolo'],
];
const legend = LEGEND.map(([k, d]) => `<li><i class="g t-${k}" aria-hidden="true">${TYPE_GLYPH[k]}</i>${d}</li>`).join('');
const INTRO = `
  <div class="ph"><div class="crumbs">Partea II · înainte de încheierea contractului</div><h2>Cum citești graficul?</h2></div>
  <p class="sum">Graficul reflectă o parte semnificativă dintre deciziile posibile într-un litigiu din domeniul achizițiilor publice, de la publicarea anunțului de participare și până la hotărârea definitivă a Curții de Apel asupra plângerii, revizuirii ori contestației în anulare. Alege orice etapă pentru a te familiariza cu variantele posibile. Căile procedurale ce pot fi urmate, actele procedurale care pot fi formulate, precum și capcanele ce pot apărea vor fi marcate distinctiv, fără ca restul graficului să dispară.</p>
  <dl class="fields axes">
    <div class="fld"><dt>De sus în jos</dt><dd>ordinea etapelor în procedură</dd></div>
    <div class="fld"><dt>Casetele</dt><dd>fazele: documentația, evaluarea, rezultatul, contestația la CNSC, decizia, plângerea, căile extraordinare, încheierea contractului</dd></div>
    <div class="fld"><dt>Săgețile</dt><dd>continue: ce urmează; roșii: capcane; întrerupte: revenirea la o etapă anterioară</dd></div>
    <div class="fld"><dt>Navigarea</dt><dd>trage sau derulează pentru deplasare; Ctrl + rotița ori două degete pentru zoom</dd></div>
  </dl>
  <h3>Legenda</h3>
  <ul class="legend">${legend}</ul>
  <h3>Începe de aici</h3>
  <ul class="edges">
    ${['p_anunt', 'p_eval', 'p_rezultat', 'c_cnsc', 'c_dec', 'pl', 'k_asteptare'].map((id) => `<li><button type="button" class="eb" data-go="${id}"><span class="eb-l">${esc(byId[id].t)}</span><span class="eb-t"><i class="g t-${byId[id].type}" aria-hidden="true">${TYPE_GLYPH[byId[id].type]}</i>${TYPES[byId[id].type]}</span></button></li>`).join('')}
  </ul>
  <h3>Abrevieri</h3>
  <p class="abbr"><b>AC</b> autoritatea contractantă · <b>CNSC</b> Consiliul Național de Soluționare a Contestațiilor · <b>SEAP</b> Sistemul electronic de achiziții publice · <b>L101</b> Legea nr. 101/2016 · <b>L98</b> Legea nr. 98/2016 · <b>pragul UE</b> pragurile valorice de la care se aplică regimul „peste prag”</p>
  <p class="disc">Material educativ, nu consultanță juridică. Conținutul provine din „Ghid practic — Inițiere în litigiile din materia achizițiilor publice”, actualizat la ${UPDATED}. Înainte de a-l folosi într-un dosar, verificați forma consolidată în vigoare a actelor normative.</p>`;


// ───────────────────────── list view
function renderList() {
  const html = PHASES.map((P) => {
    const shown = P.nodes.map((id) => byId[id]).filter(visibleNode).filter((n) => state.role === 'all' || n.roles.includes(state.role));
    if (!shown.length) return '';
    return `<section class="lg"><h2>${esc(P.name)}</h2><ol>${shown.map((n) => `
      <li class="li" id="li-${n.id}">
        <button type="button" class="li-h" data-go="${n.id}"><i class="g t-${n.type}" aria-hidden="true">${TYPE_GLYPH[n.type]}</i><span>${esc(n.t)}</span><em>${TYPES[n.type]}</em></button>
        <p>${esc(n.sum)}</p>
        ${outE[n.id].length ? `<ul>${outE[n.id].filter((e) => visibleNode(byId[e.to])).map((e) => `<li><button type="button" class="li-e k-${e.kind}" data-go="${e.to}">${esc(e.label)} <span>→ ${esc(byId[e.to].s)}</span></button></li>`).join('')}</ul>` : ''}
      </li>`).join('')}</ol></section>`;
  }).join('');
  $('#list').innerHTML = html;
  $('#list').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go)));
}

// ───────────────────────── controls
window.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea')) return;
  if (ev.key === 'Escape') { if (state.path) exitPath(true); else select(null); }
  if (state.path && ev.key === 'ArrowRight') goStep(state.step + 1);
  if (state.path && ev.key === 'ArrowLeft') goStep(state.step - 1);
});
$('#role').addEventListener('change', (e) => { state.role = e.target.value; applyEmphasis(); if (state.view === 'list') renderList(); });
$('#path').addEventListener('change', (e) => startPath(e.target.value));
$('#t-risk').addEventListener('change', (e) => { state.showRisk = e.target.checked; applyEmphasis(); renderPanel(); if (state.view === 'list') renderList(); });
document.querySelectorAll('[name="view"]').forEach((r) => r.addEventListener('change', (e) => setMode(e.target.value)));
$('#zoom-in').addEventListener('click', () => { const { w, h } = vpSize(); zoomAt(1.25, w / 2, h / 2); });
$('#zoom-out').addEventListener('click', () => { const { w, h } = vpSize(); zoomAt(0.8, w / 2, h / 2); });
$('#fit').addEventListener('click', () => fitBox(bounds));
$('#phase-go').addEventListener('change', (e) => { const P = PHASES.find((p) => p.id === e.target.value); if (P) fitBox(P.box, { maxK: 1 }); e.target.value = ''; });
$('#sheet-toggle').addEventListener('click', () => {
  const c = panel.classList.toggle('collapsed');
  $('#sheet-toggle').setAttribute('aria-expanded', String(!c));
  $('#sheet-toggle').textContent = c ? 'Arată fișa' : 'Ascunde fișa';
});
function openSheet() {
  if (panel.classList.contains('collapsed')) $('#sheet-toggle').click();
}
function setMode(v) {
  state.view = v;
  document.body.dataset.view = v;
  if (v === 'list') renderList();
}
PATHS.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('#path').appendChild(o); });

// ───────────────────────── start (după încărcarea fonturilor, ca măsurătorile textului să fie corecte)
function start() {
  render();
  applyEmphasis();
  renderPanel();
  // vederea inițială: prima etapă a Fazei 1, sus, centrată pe orizontală
  {
    const P = PHASES[0], it = items[itemsOf[P.nodes[0]][0]];
    const { w } = vpSize();
    const k = clampK(Math.max(0.55, Math.min(1, (w - 48) / P.box.w)));
    Object.assign(view, { k, x: Math.min(24 - P.box.x * k, Math.max(w - 24 - (P.box.x + P.box.w) * k, w / 2 - it.x * k)), y: 24 - P.box.y * k });
    applyView();
  }
  const h0 = decodeURIComponent(location.hash.slice(1));
  if (byId[h0]) setTimeout(() => select(h0, { fly: true }), 200);
  else if (window.matchMedia('(max-width: 860px)').matches) $('#sheet-toggle').click();
}
let started = false;
const go = () => { if (!started) { started = true; start(); } };
(document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
setTimeout(go, 1500);
window.__harta = { select, state, fitBox, view };
