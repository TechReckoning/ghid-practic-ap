import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LEVELS, TRACKS, ROLES, TYPES, NODES, EDGES, PATHS, HOLIDAYS } from './data.js';
import { UPDATED } from './site.js';

// ───────────────────────── model
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const edges = EDGES.map(([from, to, label, kind, short], i) => ({ i, from, to, label, kind, short: short || label }));
const outE = {}, inE = {};
NODES.forEach((n) => { outE[n.id] = []; inE[n.id] = []; });
edges.forEach((e) => { outE[e.from].push(e); inE[e.to].push(e); });

const SX = 5.2, LY = 11, RISK_DY = -3, X0 = 9, ZS = 2;
function posOf(n) {
  return new THREE.Vector3((n.col - X0) * SX, n.lvl * LY + (n.type === 'risc' ? RISK_DY : 0), (TRACKS[n.tr].z + (n.dz || 0)) * ZS);
}
NODES.forEach((n) => { n.pos = posOf(n); });

const state = {
  sel: null, role: 'all', showRisk: true, view: '3d',
  path: null, step: 0,
};

// ───────────────────────── DOM
const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const labelsEl = $('#labels');
const panelBody = $('#panel-body');
const panel = $('#panel');

// ───────────────────────── colors from tokens
const css = () => getComputedStyle(document.documentElement);
let C = {};
function readColors() {
  const s = css();
  const g = (k) => new THREE.Color(s.getPropertyValue(k).trim() || '#888');
  C = {
    moment: g('--c-moment'), decizie: g('--c-decizie'), remediu: g('--c-remediu'), solutie: g('--c-solutie'),
    risc: g('--c-risc'), link: g('--c-link'), line: g('--edge'), accent: g('--accent'), floor: g('--floor'),
    floorEdge: g('--floor-edge'), bg: g('--bg'),
  };
}
readColors();

// ───────────────────────── three setup
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 10;
controls.maxDistance = 320;
controls.maxPolarAngle = Math.PI * 0.495;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(-20, 40, 30);
scene.add(dir);

const VIEWS = {
  ansamblu: { dir: [-0.06, 0.3, 0.95], target: [2, 14, 0], r: 42 },
  fata: { dir: [0, 0.06, 1], target: [2, 15, 0], r: 46 },
  sus: { dir: [0, 1, 0.0001], target: [2, 0, 0], r: 46 },
};
function fitPos(k) {
  const v = VIEWS[k];
  const vf = (camera.fov * Math.PI) / 360;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = v.r / Math.sin(Math.min(vf * 1.35, hf));
  return new THREE.Vector3(...v.dir).normalize().multiplyScalar(d).add(new THREE.Vector3(...v.target));
}

// floors
const xmin = (-1.2 - X0) * SX, xmax = (19.4 - X0) * SX;
const zmin = -9.5 * ZS, zmax = 11.5 * ZS;
const floors = [];
LEVELS.forEach((L) => {
  const w = xmax - xmin, d = zmax - zmin;
  const g = new THREE.PlaneGeometry(w, d);
  const m = new THREE.MeshBasicMaterial({ color: C.floor, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  const y = L.id * LY - 0.75 + (L.id === 0 ? RISK_DY + 0.1 : 0) * 0;
  mesh.position.set((xmin + xmax) / 2, L.id * LY - 0.8, (zmin + zmax) / 2);
  scene.add(mesh);
  const eg = new THREE.EdgesGeometry(g);
  const lm = new THREE.LineBasicMaterial({ color: C.floorEdge, transparent: true, opacity: 0.9 });
  const outline = new THREE.LineSegments(eg, lm);
  outline.rotation.x = -Math.PI / 2;
  outline.position.copy(mesh.position);
  scene.add(outline);
  // track guides
  const tl = [];
  Object.values(TRACKS).forEach((T) => {
    const pts = [new THREE.Vector3(xmin + 0.5, mesh.position.y + 0.01, T.z), new THREE.Vector3(xmax - 0.5, mesh.position.y + 0.01, T.z)];
    const lg = new THREE.BufferGeometry().setFromPoints(pts);
    const lmat = new THREE.LineDashedMaterial({ color: C.floorEdge, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(lg, lmat);
    line.computeLineDistances();
    scene.add(line);
    tl.push(line);
  });
  floors.push({ mesh, outline, tl, y: mesh.position.y });
});

// node meshes
const GEO = {
  moment: new THREE.SphereGeometry(0.44, 32, 16),
  decizie: new THREE.OctahedronGeometry(0.66),
  remediu: new THREE.BoxGeometry(0.78, 0.98, 0.22),
  solutie: new THREE.SphereGeometry(0.52, 32, 16),
  risc: new THREE.ConeGeometry(0.46, 0.82, 3),
  link: new THREE.TorusGeometry(0.42, 0.15, 12, 32),
};
const pickables = [];
NODES.forEach((n) => {
  const mat = new THREE.MeshStandardMaterial({ color: C[n.type], roughness: 0.45, metalness: 0.05, transparent: true });
  const mesh = new THREE.Mesh(GEO[n.type], mat);
  mesh.position.copy(n.pos);
  if (n.type === 'risc') mesh.rotation.x = Math.PI;
  if (n.type === 'solutie') mesh.scale.setScalar(0.85);
  mesh.userData.id = n.id;
  scene.add(mesh);
  pickables.push(mesh);
  n.mesh = mesh;
  // invisible larger hit target
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(n.pos);
  hit.userData.id = n.id;
  scene.add(hit);
  pickables.push(hit);
  n.hit = hit;
});

// selection ring
const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 48), new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }));
ring.renderOrder = 10;
ring.visible = false;
scene.add(ring);

// edges
const up = new THREE.Vector3(0, 1, 0);
const coneGeo = new THREE.ConeGeometry(0.15, 0.42, 12);
edges.forEach((e) => {
  const a = byId[e.from].pos, b = byId[e.to].pos;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dist = a.distanceTo(b);
  const lift = e.kind === 'loop' ? 2.2 + dist * 0.18 : 0.5 + dist * 0.07;
  mid.y += lift;
  const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
  e.curve = curve;
  const dashed = e.kind === 'loop' || e.kind === 'out';
  let line;
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color: C.line, dashSize: 0.35, gapSize: 0.3, transparent: true })
    : new THREE.MeshBasicMaterial({ color: C.line, transparent: true });
  if (dashed) {
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    line = new THREE.Line(g, mat);
    line.computeLineDistances();
  } else {
    line = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, e.kind === 'risk' ? 0.03 : 0.045, 6, false), mat);
  }
  scene.add(line);
  // arrow
  const endR = byId[e.to].type === 'decizie' ? 0.8 : 0.66;
  const len = curve.getLength();
  const t = Math.max(0.5, 1 - (endR + 0.2) / len);
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: C.line, transparent: true }));
  cone.position.copy(p);
  cone.quaternion.setFromUnitVectors(up, tan);
  scene.add(cone);
  e.line = line;
  e.cone = cone;
});

// ───────────────────────── labels
const TYPE_GLYPH = { moment: '●', decizie: '◆', remediu: '▮', solutie: '●', risc: '▼', link: '◎' };
NODES.forEach((n) => {
  const b = document.createElement('button');
  b.className = `lbl t-${n.type}`;
  b.type = 'button';
  b.textContent = n.s;
  b.title = n.t;
  b.addEventListener('click', (ev) => { ev.stopPropagation(); select(n.id, { fly: true }); });
  b.addEventListener('pointerenter', () => setHover(n.id));
  b.addEventListener('pointerleave', () => setHover(null));
  labelsEl.appendChild(b);
  n.lbl = b;
});
const floorLabels = LEVELS.map((L, i) => {
  const d = document.createElement('div');
  d.className = 'flbl';
  d.innerHTML = `<span>Nivel ${L.id}</span>${L.name}`;
  labelsEl.appendChild(d);
  return { el: d, p: new THREE.Vector3(xmin + 0.6, floors[i].y + 0.05, zmin + 0.4) };
});
const trackLabels = [
  ['contract', 0], ['cnsc', 0],
].map(([k, lvl]) => {
  const d = document.createElement('div');
  d.className = 'tlbl';
  d.textContent = TRACKS[k].name;
  labelsEl.appendChild(d);
  return { el: d, k, p: new THREE.Vector3(xmin + 0.6, floors[lvl].y + 0.05, TRACKS[k].z * ZS - 0.6) };
});
const edgeLabelPool = [];
function edgeLabel(i) {
  if (!edgeLabelPool[i]) {
    const d = document.createElement('div');
    d.className = 'elbl';
    labelsEl.appendChild(d);
    edgeLabelPool[i] = d;
  }
  return edgeLabelPool[i];
}
let activeEdgeLabels = [];

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
const OP = { strong: 1, mid: 0.6, base: 0.95, dim: 0.13 };
function computeLevels() {
  const lv = {};
  const elv = {};
  let accentEdges = new Set();
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
  NODES.forEach((n) => {
    const vis = visibleNode(n);
    const o = OP[lv[n.id]];
    n.mesh.visible = vis;
    n.hit.visible = vis;
    n.mesh.material.opacity = o;
    n.mesh.material.depthWrite = o > 0.5;
    n.mesh.material.color.copy(C[n.type]);
    n.lbl.hidden = !vis;
    n.lbl.dataset.lv = lv[n.id];
    n.lbl.classList.toggle('sel', n.id === state.sel);
    n.mesh.scale.setScalar((n.type === 'solutie' ? 0.85 : 1) * (n.id === state.sel ? 1.25 : 1));
  });
  edges.forEach((e) => {
    const vis = visibleNode(byId[e.from]) && visibleNode(byId[e.to]);
    e.line.visible = e.cone.visible = vis;
    let o;
    if (elv[e.i]) o = OP[elv[e.i]];
    else {
      const a = OP[lv[e.from]], b = OP[lv[e.to]];
      o = Math.min(a, b) * (state.sel || state.path ? 0.55 : 0.75);
      if (lv[e.from] === 'dim' || lv[e.to] === 'dim') o = 0.07;
    }
    const col = accentEdges.has(e.i) ? C.accent : e.kind === 'risk' ? C.risc : C.line;
    [e.line.material, e.cone.material].forEach((m) => { m.opacity = o; m.color.copy(col); });
  });
  // edge labels
  activeEdgeLabels.forEach((x) => { x.el.hidden = true; });
  activeEdgeLabels = [];
  let list = [];
  if (state.path) {
    const P = PATHS.find((p) => p.id === state.path);
    const a = P.nodes[state.step], b = P.nodes[state.step + 1];
    const e = b && edges.find((x) => x.from === a && x.to === b);
    if (e) list = [e];
  } else if (state.sel) list = outE[state.sel];
  list.filter((e) => visibleNode(byId[e.to])).forEach((e, k) => {
    const el = edgeLabel(k);
    el.textContent = e.short;
    el.className = `elbl k-${e.kind}`;
    el.hidden = false;
    activeEdgeLabels.push({ el, p: e.curve.getPointAt(e.kind === 'risk' ? 0.72 : 0.55) });
  });
  if (state.sel && byId[state.sel].mesh.visible) {
    ring.visible = true;
    ring.position.copy(byId[state.sel].pos);
  } else ring.visible = false;
  ring.material.color.copy(C.accent);
}

// ───────────────────────── camera fly
let fly = null;
function flyTo(target, pos, ms = 700) {
  fly = { t0: performance.now(), ms, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: pos.clone() };
}
function flyToNode(id) {
  const n = byId[id];
  const off = camera.position.clone().sub(controls.target);
  const want = Math.min(Math.max(off.length(), 24), 44);
  off.setLength(want);
  flyTo(n.pos, n.pos.clone().add(off));
}
function setView(k) {
  const v = VIEWS[k];
  flyTo(new THREE.Vector3(...v.target), fitPos(k), 900);
}

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
  if (id && fly && state.view === '3d') flyToNode(id);
  if (id) openSheet();
  if (state.view === 'list' && id) {
    const el = document.getElementById(`li-${id}`);
    if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    document.querySelectorAll('.li.on').forEach((x) => x.classList.remove('on'));
    el?.classList.add('on');
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
  const lvl = LEVELS[n.lvl].name;
  const where = n.tr === 'contract' ? TRACKS.contract.name : lvl;
  const roles = n.roles.length === 3 ? '' : `<p class="roles">${n.roles.map((r) => `<span>${ROLES[r]}</span>`).join('')}</p>`;
  const fields = (n.f || []).map(([k, v]) => `<div class="fld"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const nxt = outE[n.id].map((e) => edgeBtn(e, e.to)).join('');
  const prv = inE[n.id].map((e) => edgeBtn(e, e.from, true)).join('');
  panelBody.innerHTML = `${pathBar}
    <div class="ph">
      <div class="crumbs">${esc(where)}</div>
      <div class="ph-row">${chip(n.type)}<button type="button" class="x" id="close-node" aria-label="Închide fișa">Închide</button></div>
      <h2>${esc(n.t)}</h2>
      ${roles}
    </div>
    <p class="sum">${esc(n.sum)}</p>
    ${n.warn ? `<p class="warn"><b>Atenție.</b> ${esc(n.warn)}</p>` : ''}
    ${fields ? `<dl class="fields">${fields}</dl>` : ''}
    ${n.calc ? calcHTML(n) : ''}
    ${nxt ? `<h3>Ce urmează</h3><ul class="edges">${nxt}</ul>` : ''}
    ${prv ? `<h3>Cum ajungi aici</h3><ul class="edges prev">${prv}</ul>` : ''}
    <p class="refs"><span>Ghid ${n.ref.map((r) => `<a href="ghid.html#${refAnchor(r)}">${esc(r)}</a>`).join(' · ')}</span>${n.art ? `<span>${esc(n.art)}</span>` : ''}</p>`;
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
    <span class="eb-l">${esc(back ? o.s : e.label)}</span>
    <span class="eb-t"><i class="g t-${o.type}" aria-hidden="true">${TYPE_GLYPH[o.type]}</i>${esc(back ? e.label : o.s)}</span>
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
const legend = Object.keys(TYPES).map((k) => `<li><i class="g t-${k}" aria-hidden="true">${TYPE_GLYPH[k]}</i><b>${TYPES[k]}</b>${{
  moment: 'un moment din procedură sau din litigiu',
  decizie: 'aici cineva alege; din el pleacă toate variantele',
  remediu: 'un act pe care îl depui: contestație, intervenție, plângere',
  solutie: 'cum se poate termina o etapă',
  risc: 'ce se întâmplă dacă ratezi un termen sau o condiție',
  link: 'continuă în alt capitol al ghidului',
}[k]}</li>`).join('');
const INTRO = `
  <div class="ph"><div class="crumbs">Partea II · înainte de încheierea contractului</div><h2>Cum citești harta?</h2></div>
  <p class="sum">Harta reflectă o parte semnificativă dintre deciziile posibile într-un litigiu din domeniul achizițiilor publice, de la publicarea anunțului de participare și până la hotărârea definitivă a Curții de Apel asupra plângerii, revizuirii ori contestației în anulare. Alege orice etapă pentru a te familiariza cu variantele posibile. Căile procedurale ce pot fi urmate, actele procedurale care pot fi formulate, precum și capcanele ce pot apărea vor fi marcate distinctiv, fără ca restul hărții să dispară.</p>
  <dl class="fields axes">
    <div class="fld"><dt>De la stânga la dreapta</dt><dd>timpul procedurii</dd></div>
    <div class="fld"><dt>De jos în sus</dt><dd>treptele litigiului: procedura de atribuire, CNSC, curtea de apel, căile extraordinare</dd></div>
    <div class="fld"><dt>Din față spre spate</dt><dd>încheierea contractului, calea CNSC</dd></div>
  </dl>
  <h3>Legenda</h3>
  <ul class="legend">${legend}</ul>
  <h3>Începe de aici</h3>
  <ul class="edges">
    ${['p_anunt', 'p_rezultat', 'c_rez', 'k_obligatie'].map((id) => `<li><button type="button" class="eb" data-go="${id}"><span class="eb-l">${esc(byId[id].t)}</span><span class="eb-t"><i class="g t-${byId[id].type}" aria-hidden="true">${TYPE_GLYPH[byId[id].type]}</i>${TYPES[byId[id].type]}</span></button></li>`).join('')}
  </ul>
  <h3>Abrevieri</h3>
  <p class="abbr"><b>AC</b> autoritatea contractantă · <b>CNSC</b> Consiliul Național de Soluționare a Contestațiilor · <b>SEAP</b> Sistemul electronic de achiziții publice · <b>L101</b> Legea nr. 101/2016 · <b>L98</b> Legea nr. 98/2016 · <b>pragul UE</b> pragurile valorice de la care se aplică regimul „peste prag”</p>
  <p class="disc">Material educativ, nu consultanță juridică. Conținutul provine din „Ghid practic — Inițiere în litigiile din materia achizițiilor publice”, actualizat la ${UPDATED}. Înainte de a-l folosi într-un dosar, verificați forma consolidată în vigoare a actelor normative.</p>`;

// ───────────────────────── list view
function renderList() {
  const groups = [
    { k: 'Procedura de atribuire', f: (n) => n.lvl === 0 && n.tr === 'cnsc' },
    { k: 'Încheierea contractului', f: (n) => n.tr === 'contract' },
    { k: 'Contestația la CNSC', f: (n) => n.lvl === 1 && n.tr === 'cnsc' },
    { k: 'Curtea de apel · plângerea', f: (n) => n.lvl === 2 && n.tr === 'cnsc' },
    { k: 'Căi extraordinare de atac', f: (n) => n.lvl === 3 },
  ];
  const html = groups.map((g) => {
    const items = NODES.filter(g.f).filter(visibleNode).filter((n) => state.role === 'all' || n.roles.includes(state.role))
      .sort((a, b) => a.col - b.col || (a.dz || 0) - (b.dz || 0));
    if (!items.length) return '';
    return `<section class="lg"><h2>${g.k}</h2><ol>${items.map((n) => `
      <li class="li" id="li-${n.id}">
        <button type="button" class="li-h" data-go="${n.id}"><i class="g t-${n.type}" aria-hidden="true">${TYPE_GLYPH[n.type]}</i><span>${esc(n.t)}</span><em>${TYPES[n.type]}</em></button>
        <p>${esc(n.sum)}</p>
        ${outE[n.id].length ? `<ul>${outE[n.id].filter((e) => visibleNode(byId[e.to])).map((e) => `<li><button type="button" class="li-e k-${e.kind}" data-go="${e.to}">${esc(e.label)} <span>→ ${esc(byId[e.to].s)}</span></button></li>`).join('')}</ul>` : ''}
      </li>`).join('')}</ol></section>`;
  }).join('');
  $('#list').innerHTML = html;
  $('#list').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go)));
}

// ───────────────────────── interaction
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let hoverId = null;
let downAt = null;
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(pickables.filter((m) => m.visible || m === m), false).filter((h) => byId[h.object.userData.id].mesh.visible);
  return hits.length ? hits[0].object.userData.id : null;
}
function setHover(id) {
  if (hoverId === id) return;
  if (hoverId) byId[hoverId].lbl.classList.remove('hov');
  hoverId = id;
  if (id) byId[id].lbl.classList.add('hov');
  renderer.domElement.style.cursor = id ? 'pointer' : '';
}
renderer.domElement.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') setHover(pick(ev)); });
renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; fly = null; });
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downAt) return;
  const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return;
  const id = pick(ev);
  if (id) select(id, { fly: true });
  else if (!state.path) select(null);
});
window.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea')) return;
  if (ev.key === 'Escape') { if (state.path) exitPath(true); else select(null); }
  if (state.path && ev.key === 'ArrowRight') goStep(state.step + 1);
  if (state.path && ev.key === 'ArrowLeft') goStep(state.step - 1);
});

$('#role').addEventListener('change', (e) => { state.role = e.target.value; applyEmphasis(); if (state.view === 'list') renderList(); });
$('#path').addEventListener('change', (e) => startPath(e.target.value));
$('#t-risk').addEventListener('change', (e) => { state.showRisk = e.target.checked; applyEmphasis(); renderPanel(); if (state.view === 'list') renderList(); });
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.cam)));
document.querySelectorAll('[name="view"]').forEach((r) => r.addEventListener('change', (e) => setMode(e.target.value)));
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
  if (v === 'list') renderList(); else resize();
}

PATHS.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('#path').appendChild(o); });

// theme changes
const onTheme = () => {
  readColors();
  floors.forEach((f) => { f.mesh.material.color.copy(C.floor); f.outline.material.color.copy(C.floorEdge); f.tl.forEach((l) => l.material.color.copy(C.floorEdge)); });
  applyEmphasis();
};
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ───────────────────────── render loop
function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();
controls.target.set(...VIEWS.ansamblu.target);
camera.position.copy(fitPos('ansamblu'));
if (window.matchMedia('(max-width: 600px)').matches) {
  const t = byId.p_rezultat.pos.clone().add(new THREE.Vector3(-2, 2, 0));
  controls.target.copy(t);
  camera.position.copy(t).add(new THREE.Vector3(-0.07, 0.5, 0.86).normalize().multiplyScalar(54));
}

const v = new THREE.Vector3();
function place(el, p, w, h, dy = 0) {
  v.copy(p).project(camera);
  if (v.z > 1 || v.z < -1) { el.style.visibility = 'hidden'; return; }
  const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h + dy;
  if (x < -200 || x > w + 200 || y < -60 || y > h + 60) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = '';
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  return { x, y, z: v.z };
}
const LV_PRI = { strong: 50, mid: 20, base: 10, dim: 0 };
const TYPE_PRI = { decizie: 6, remediu: 5, moment: 4, link: 3, solutie: 2, risc: 1 };
let sizeTick = 0;
const tmp = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  if (state.view !== '3d') return;
  if (fly) {
    const k = Math.min(1, (now - fly.t0) / fly.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    controls.target.lerpVectors(fly.fromT, fly.toT, e);
    camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  ring.quaternion.copy(camera.quaternion);
  renderer.render(scene, camera);
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const dist = camera.position.distanceTo(controls.target);
  labelsEl.dataset.far = dist > 115 ? '1' : '';
  if (sizeTick++ % 30 === 0) NODES.forEach((n) => { n.lw = n.lbl.offsetWidth; n.lh = n.lbl.offsetHeight; });
  const placed = [];
  NODES.forEach((n) => {
    if (n.lbl.hidden) return;
    tmp.copy(n.pos);
    tmp.y -= n.type === 'risc' ? 0.55 : 0.75;
    const r = place(n.lbl, tmp, w, h, 4);
    if (!r) return;
    const lv = n.lbl.dataset.lv;
    const pri = (n.id === state.sel ? 1000 : 0) + (n.id === hoverId ? 900 : 0) + LV_PRI[lv] + TYPE_PRI[n.type] + (1 - r.z) * 40;
    placed.push({ n, pri, x0: r.x - n.lw / 2 - 3, x1: r.x + n.lw / 2 + 3, y0: r.y - 2, y1: r.y + n.lh + 2 });
  });
  placed.sort((a, b) => b.pri - a.pri);
  const kept = [];
  placed.forEach((p) => {
    const hit = kept.some((k) => p.x0 < k.x1 && p.x1 > k.x0 && p.y0 < k.y1 && p.y1 > k.y0);
    p.n.lbl.classList.toggle('cull', hit);
    if (!hit) kept.push(p);
  });
  floorLabels.forEach((f) => place(f.el, f.p, w, h));
  trackLabels.forEach((f) => { if (!f.el.hidden) place(f.el, f.p, w, h); });
  activeEdgeLabels.forEach((x) => place(x.el, x.p, w, h, -10));
}

applyEmphasis();
renderPanel();
const h0 = decodeURIComponent(location.hash.slice(1));
if (byId[h0]) setTimeout(() => select(h0, { fly: true }), 300);
else if (window.matchMedia('(max-width: 860px)').matches) $('#sheet-toggle').click();
requestAnimationFrame(frame);
window.__harta = { select, setView, state };
