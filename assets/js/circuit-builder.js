// Circuit builder: pupils drag components onto a dotted grid, join them with wires that only
// run along the grid (so every corner is a right angle), and see what happens: lamps light,
// meters give readings, and moving dots show the current splitting at junctions.
//
// Markup (see starters/bge/electricity-circuit-builder.html):
//   [data-circuit-builder]   wrapper for one builder
//     .cb-task[data-check]   one task each; the builder ticks it off when the circuit does the job.
//                            Each has a .q-feedback, an optional .hint and a .q-explain (the answer).
//     .cb-palette button[data-type]   one button per component
//     .cb-board              the <svg> grid
// Needs circuit-symbols.js for the symbols, and works alongside starter.js (timer, Show answers, Reset).
(function () {
  'use strict';

  const root = document.querySelector('[data-circuit-builder]');
  if (!root) return;

  // ---------- Grid ----------
  const S = 40;                       // grid spacing in SVG units
  const COLS = 19;                    // grid points across (x = 0 … 18)
  const ROWS = 11;                    // grid points down (y = 0 … 10)
  const at = (i) => S / 2 + i * S;    // grid index to SVG coordinate
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const pk = (x, y) => x + ',' + y;
  const unpk = (k) => k.split(',').map(Number);
  // A wire is stored as unit-length edges between neighbouring grid points
  const ek = (x1, y1, x2, y2) =>
    x1 < x2 || (x1 === x2 && y1 < y2) ? pk(x1, y1) + '|' + pk(x2, y2) : pk(x2, y2) + '|' + pk(x1, y1);
  const ends = (e) => e.split('|').map(unpk);

  // ---------- Components and how they behave electrically ----------
  // Cells are an EMF with a tiny internal resistance. Values are chosen so readings are tidy:
  // one lamp on one cell takes 0.30 A.
  const TYPES = {
    cell:      { name: 'Cell', emf: 1.5, r: 0.01 },
    battery:   { name: 'Battery', emf: 3, r: 0.02 },
    lamp:      { name: 'Lamp', R: 5 },
    switch:    { name: 'Switch' },
    resistor:  { name: 'Resistor', R: 10 },
    motor:     { name: 'Motor', R: 5, letter: 'M' },
    led:       { name: 'LED' },
    ammeter:   { name: 'Ammeter', R: 0.001, letter: 'A' },
    voltmeter: { name: 'Voltmeter', R: 1e7, letter: 'V' },
  };
  const SWITCH_R = 1e-4;
  const LED_VF = 1.2;                 // LED only conducts once it has this much voltage, one way round
  const LED_R = 2;
  const LAMP_FULL = 0.3 * 0.3 * 5;    // power (W) of one lamp on one cell = "normal" brightness
  const WORKING = 0.05;               // lamps and motors carrying more current (A) than this are on
  const SHORT = 5;                    // a cell giving more current (A) than this is short-circuited

  // The two ends of a component. For cells and the battery, end 0 is positive (the long plate);
  // for the LED, current can only go in at end 0.
  function ends2(c) {
    const [dx, dy] = DIRS[c.rot];
    return [[c.x - dx, c.y - dy], [c.x + dx, c.y + dy]];
  }

  // ---------- State ----------
  const KEY = 'circuit-builder-v1';
  let state = { comps: [], wires: [], next: 1 };
  let solved = new Set();
  let task = 0;
  let history = [];
  let sel = null;        // { comp: id } or { wire: Set of edge keys }
  let pending = null;    // [x, y]: start of a wire drawn by tapping
  let drag = null;       // the drag in progress on the board
  let preview = null;    // { comp, bad } or { wire: edges, bad } drawn on top while dragging
  let showFlow = true;

  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.state) {
      state = saved.state;
      solved = new Set(saved.solved || []);
      task = saved.task || 0;
    }
  } catch (e) { /* storage blocked: start empty */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state, solved: [...solved], task })); } catch (e) { /* ignore */ }
  }

  const clone = (st) => JSON.parse(JSON.stringify(st));
  function commit(change) {
    history.push(clone(state));
    if (history.length > 60) history.shift();
    change();
    save();
    update();
  }

  // ---------- Layout rules ----------
  const inGrid = ([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  // The middle of a component is under its symbol, so no wire or other component may use it
  function midSet(st, skipId) {
    const s = new Set();
    st.comps.forEach((c) => { if (c.id !== skipId) s.add(pk(c.x, c.y)); });
    return s;
  }

  function canPlace(st, c) {
    const [a, b] = ends2(c);
    if (!inGrid(a) || !inGrid(b)) return false;
    for (const o of st.comps) {
      if (o.id === c.id) continue;
      const [oa, ob] = ends2(o);
      const m = [c.x, c.y];
      if (same(m, [o.x, o.y]) || same(m, oa) || same(m, ob)) return false;
      if (same([o.x, o.y], a) || same([o.x, o.y], b)) return false;
    }
    const mid = pk(c.x, c.y);
    return !st.wires.some((e) => e.split('|').includes(mid));
  }

  // Dropped onto a straight bit of wire: the component takes the place of the two edges under
  // it, turned to line up with the wire, so it is joined in without rewiring.
  // Returns { comp, cut } or null if it doesn't fit there.
  function spliceInto(st, c) {
    const mid = pk(c.x, c.y);
    const touching = st.wires.filter((e) => e.split('|').includes(mid));
    if (touching.length !== 2) return null;   // no wire here, a corner end, or a junction
    for (const rot of [c.rot, (c.rot + 1) % 4]) {
      const t = Object.assign({}, c, { rot });
      const cut = ends2(t).map(([x, y]) => ek(x, y, c.x, c.y));
      if (!cut.every((e) => touching.includes(e))) continue;
      const rest = Object.assign({}, st, { wires: st.wires.filter((e) => !cut.includes(e)) });
      if (canPlace(rest, t)) return { comp: t, cut };
    }
    return null;
  }

  // Where a dragged component would go: a clear spot, or spliced into a wire
  function placement(st, c) {
    if (canPlace(st, c)) return { comp: c, bad: false };
    const s = spliceInto(st, c);
    return s ? { comp: s.comp, cut: s.cut, bad: false } : { comp: c, bad: true };
  }
  const SPLICE_MSG = 'Let go to join it into the wire.';

  // Edges along a path that goes straight, or turns one right-angled corner
  function route(p, q, horizontalFirst) {
    const corner = horizontalFirst ? [q[0], p[1]] : [p[0], q[1]];
    const edges = [];
    const walk = (from, to) => {
      let [x, y] = from;
      while (x !== to[0] || y !== to[1]) {
        const nx = x + Math.sign(to[0] - x);
        const ny = nx === x ? y + Math.sign(to[1] - y) : y;
        edges.push(ek(x, y, nx, ny));
        [x, y] = [nx, ny];
      }
    };
    walk(p, corner);
    walk(corner, q);
    return edges;
  }

  function wireOk(st, edges) {
    const mids = midSet(st);
    return edges.length > 0 && edges.every((e) => !e.split('|').some((p) => mids.has(p)));
  }

  // Try the preferred corner first, then the other one
  function bestRoute(st, p, q, horizontalFirst) {
    const a = route(p, q, horizontalFirst);
    if (wireOk(st, a)) return { edges: a, ok: true };
    const b = route(p, q, !horizontalFirst);
    if (wireOk(st, b)) return { edges: b, ok: true };
    return { edges: a, ok: false };
  }

  // ---------- Simulation ----------
  // Wires join grid points into "nets" (one voltage each). Every component is a branch between
  // two nets: current a→b inside it is I = G (Va − Vb − E). Solved with nodal analysis.
  function netsOf(st) {
    const parent = new Map();
    const find = (k) => {
      if (!parent.has(k)) parent.set(k, k);
      while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); }
      return k;
    };
    st.wires.forEach((e) => {
      const [p, q] = e.split('|');
      const a = find(p), b = find(q);
      if (a !== b) parent.set(a, b);
    });
    return find;
  }

  function gauss(A, b) {
    const n = b.length;
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
      [A[k], A[p]] = [A[p], A[k]];
      [b[k], b[p]] = [b[p], b[k]];
      const piv = A[k][k] || 1e-30;
      for (let i = k + 1; i < n; i++) {
        const f = A[i][k] / piv;
        if (!f) continue;
        for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
        b[i] -= f * b[k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / (A[i][i] || 1e-30);
    }
    return x;
  }

  // opts.removed: ids treated as taken out; opts.switches: Map id → closed, overriding the board
  function solve(st, opts = {}) {
    const removed = opts.removed || new Set();
    const switches = opts.switches || new Map();
    const find = netsOf(st);
    const index = new Map();
    const node = (p) => {
      const r = find(pk(p[0], p[1]));
      if (!index.has(r)) index.set(r, index.size);
      return index.get(r);
    };
    const els = [];
    st.comps.forEach((c) => {
      if (removed.has(c.id)) return;
      const [pa, pb] = ends2(c);
      const el = { c, pa, pb, a: node(pa), b: node(pb), G: 0, E: 0 };
      const t = TYPES[c.type];
      if (t.emf) { el.G = 1 / t.r; el.E = t.emf; }
      else if (c.type === 'switch') {
        const closed = switches.has(c.id) ? switches.get(c.id) : c.closed;
        el.G = closed ? 1 / SWITCH_R : 0;
      } else if (c.type === 'led') { el.led = true; el.on = false; }
      else el.G = 1 / t.R;
      els.push(el);
    });

    const n = index.size;
    let V = new Array(n).fill(0);
    // LEDs: guess which are on, solve, fix the guesses, repeat until nothing changes
    for (let round = 0; round < 20; round++) {
      els.forEach((el) => {
        if (el.led) { el.G = el.on ? 1 / LED_R : 1e-9; el.E = el.on ? LED_VF : 0; }
      });
      const A = Array.from({ length: n }, () => new Array(n).fill(0));
      const rhs = new Array(n).fill(0);
      for (let i = 0; i < n; i++) A[i][i] = 1e-9; // keeps unconnected parts solvable
      els.forEach(({ a, b, G, E }) => {
        if (!G || a === b) return;
        A[a][a] += G; A[b][b] += G; A[a][b] -= G; A[b][a] -= G;
        rhs[a] += G * E; rhs[b] -= G * E;
      });
      V = n ? gauss(A, rhs) : [];
      let changed = false;
      els.forEach((el) => {
        if (!el.led) return;
        const dv = V[el.a] - V[el.b];
        if (el.on && dv < LED_VF) { el.on = false; changed = true; }
        else if (!el.on && dv > LED_VF + 1e-6) { el.on = true; changed = true; }
      });
      if (!changed) break;
    }

    const byId = new Map();
    els.forEach((el) => {
      // A cell whose two ends are joined by bare wire gets its full short-circuit current
      el.I = el.G * (V[el.a] - V[el.b] - el.E);
      el.V = V[el.a] - V[el.b];
      byId.set(el.c.id, el);
    });
    return { els, byId, find };
  }

  const current = (res, id) => (res.byId.has(id) ? Math.abs(res.byId.get(id).I) : 0);
  const working = (res, id) => current(res, id) > WORKING;

  // How the current shares out along the wires inside each net (for the moving dots). Wires are
  // treated as equal small resistances; component currents go in and out at their ends.
  function wireFlows(st, res) {
    const groups = new Map();
    st.wires.forEach((e) => {
      const r = res.find(e.split('|')[0]);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(e);
    });
    const inject = new Map();
    res.els.forEach((el) => {
      const ka = pk(...el.pa), kb = pk(...el.pb);
      inject.set(ka, (inject.get(ka) || 0) - el.I);
      inject.set(kb, (inject.get(kb) || 0) + el.I);
    });
    const flows = new Map();
    groups.forEach((edges) => {
      const idx = new Map();
      edges.forEach((e) => e.split('|').forEach((p) => { if (!idx.has(p)) idx.set(p, idx.size); }));
      const n = idx.size;
      const A = Array.from({ length: n }, () => new Array(n).fill(0));
      const b = new Array(n).fill(0);
      edges.forEach((e) => {
        const [p, q] = e.split('|').map((k) => idx.get(k));
        A[p][p] += 1; A[q][q] += 1; A[p][q] -= 1; A[q][p] -= 1;
      });
      idx.forEach((i, k) => { b[i] = inject.get(k) || 0; });
      A[0] = new Array(n).fill(0); A[0][0] = 1; b[0] = 0; // fix one point's level
      const phi = gauss(A, b);
      edges.forEach((e) => {
        const [p, q] = e.split('|').map((k) => idx.get(k));
        flows.set(e, phi[p] - phi[q]);
      });
    });
    return flows;
  }

  // ---------- Task checks ----------
  const ofType = (st, type) => st.comps.filter((c) => c.type === type);
  const without = (st, ids) => solve(st, { removed: new Set(ids) });
  const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));

  // Two working lamps where taking either out puts the other out too
  function seriesPair(st, res) {
    const lit = ofType(st, 'lamp').filter((c) => working(res, c.id));
    return pairs(lit).some(([a, b]) =>
      !working(without(st, [a.id]), b.id) && !working(without(st, [b.id]), a.id));
  }
  // Two working lamps where each keeps going when the other is taken out
  function parallelPairs(st, res) {
    const lit = ofType(st, 'lamp').filter((c) => working(res, c.id));
    return pairs(lit).filter(([a, b]) =>
      working(without(st, [a.id]), b.id) && working(without(st, [b.id]), a.id));
  }

  const CHECKS = {
    'one-lamp': (st, res) => ofType(st, 'lamp').some((c) => working(res, c.id)),

    // Only once the pupil has closed the switch and seen the lamp come on
    'switch-lamp': (st, res) => ofType(st, 'switch').some((s) => {
      if (!s.closed) return false;
      const off = solve(st, { switches: new Map([[s.id, false]]) });
      return ofType(st, 'lamp').some((l) => working(res, l.id) && !working(off, l.id));
    }),

    series: (st, res) => seriesPair(st, res),

    parallel: (st, res) => parallelPairs(st, res).length > 0,

    // A voltmeter joined across a working lamp
    voltage: (st, res) => ofType(st, 'voltmeter').some((v) => {
      const ev = res.byId.get(v.id);
      return ev && Math.abs(ev.V) > 0.1 && ofType(st, 'lamp').some((l) => {
        const el = res.byId.get(l.id);
        return working(res, l.id) && ((el.a === ev.a && el.b === ev.b) || (el.a === ev.b && el.b === ev.a));
      });
    }),

    // Parallel lamps, an ammeter in each branch, and one ammeter for the total
    'current-split': (st, res) => {
      const meters = ofType(st, 'ammeter').filter((m) => current(res, m.id) > WORKING);
      return parallelPairs(st, res).some(([l1, l2]) => {
        const role = (m) => {
          const r = without(st, [m.id]);
          return (working(r, l1.id) ? 0 : 1) + (working(r, l2.id) ? 0 : 2);
        };
        const roles = meters.map(role);
        const total = meters.filter((m, i) => roles[i] === 3);
        return roles.includes(1) && roles.includes(2) && total.some((m) =>
          Math.abs(current(res, m.id) - current(res, l1.id) - current(res, l2.id)) < 0.02);
      });
    },

    // Two lamps, each with its own switch that turns off that lamp only
    'two-switches': (st) => {
      const sw = ofType(st, 'switch');
      const lamps = ofType(st, 'lamp');
      return pairs(sw).some(([s1, s2]) => {
        if (!s1.closed || !s2.closed) return false;
        const set = (a, b) => solve(st, { switches: new Map([[s1.id, a], [s2.id, b]]) });
        const both = set(true, true), open1 = set(false, true), open2 = set(true, false);
        return lamps.some((l1) => lamps.some((l2) => l1 !== l2 &&
          working(both, l1.id) && working(both, l2.id) &&
          !working(open1, l1.id) && working(open1, l2.id) &&
          working(open2, l1.id) && !working(open2, l2.id)));
      });
    },
  };

  // Example circuits for each task (teacher only, under Show answers)
  const W = (...pts) => pts.slice(1).flatMap((q, i) => route(pts[i], q, pts[i][1] === q[1]));
  const C = (type, x, y, extra) => Object.assign({ type, x, y, rot: 0, closed: false }, extra);
  const loop = [W([8, 8], [5, 8], [5, 3], [8, 3]), W([10, 8], [13, 8], [13, 3], [10, 3])].flat();
  const ladder = (top, bottom) => ({
    comps: [C(top, 6, 2, { closed: true }), C('lamp', 11, 2), C(top, 6, 5, { closed: true }), C('lamp', 11, 5),
      C('cell', 6, 9)].concat(bottom ? [C(bottom, 11, 9)] : []),
    wires: [W([3, 2], [5, 2]), W([7, 2], [10, 2]), W([12, 2], [15, 2]), W([3, 5], [5, 5]), W([7, 5], [10, 5]),
      W([12, 5], [15, 5]), W([3, 2], [3, 9], [5, 9]),
      bottom ? W([7, 9], [10, 9]).concat(W([12, 9], [15, 9], [15, 2])) : W([7, 9], [15, 9], [15, 2])].flat(),
  });
  const EXAMPLES = {
    'one-lamp': { comps: [C('cell', 9, 8), C('lamp', 9, 3)], wires: loop },
    'switch-lamp': {
      comps: [C('cell', 7, 8), C('switch', 11, 8, { closed: true }), C('lamp', 9, 3)],
      wires: [W([6, 8], [4, 8], [4, 3], [8, 3]), W([8, 8], [10, 8]), W([12, 8], [14, 8], [14, 3], [10, 3])].flat(),
    },
    series: {
      comps: [C('cell', 9, 8), C('lamp', 7, 3), C('lamp', 11, 3)],
      wires: [W([8, 8], [4, 8], [4, 3], [6, 3]), W([8, 3], [10, 3]), W([10, 8], [14, 8], [14, 3], [12, 3])].flat(),
    },
    parallel: {
      comps: [C('cell', 9, 9), C('lamp', 9, 2), C('lamp', 9, 5)],
      wires: [W([8, 9], [5, 9], [5, 2], [8, 2]), W([5, 5], [8, 5]), W([10, 9], [13, 9], [13, 2], [10, 2]),
        W([10, 5], [13, 5])].flat(),
    },
    voltage: {
      comps: [C('cell', 9, 8), C('lamp', 9, 3), C('voltmeter', 9, 1)],
      wires: loop.concat(W([8, 1], [7, 1], [7, 3]), W([10, 1], [11, 1], [11, 3])),
    },
    'current-split': ladder('ammeter', 'ammeter'),
    'two-switches': ladder('switch', null),
  };

  // ---------- Elements ----------
  const NS = 'http://www.w3.org/2000/svg';
  const board = root.querySelector('.cb-board');
  const layer = document.createElementNS(NS, 'g');
  board.setAttribute('viewBox', `0 0 ${COLS * S} ${ROWS * S}`);
  board.innerHTML =
    `<defs><pattern id="cb-dots" width="${S}" height="${S}" patternUnits="userSpaceOnUse">` +
    `<circle cx="${S / 2}" cy="${S / 2}" r="2.2" class="cb-griddot"/></pattern>` +
    `<radialGradient id="cb-glow"><stop offset="0" stop-color="var(--cb-glow)" stop-opacity="0.95"/>` +
    `<stop offset="1" stop-color="var(--cb-glow)" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="cb-glow-led"><stop offset="0" stop-color="var(--cb-led)" stop-opacity="0.9"/>` +
    `<stop offset="1" stop-color="var(--cb-led)" stop-opacity="0"/></radialGradient></defs>` +
    `<rect class="cb-paper" width="${COLS * S}" height="${ROWS * S}" rx="8"/>` +
    `<rect width="${COLS * S}" height="${ROWS * S}" fill="url(#cb-dots)"/>`;
  board.append(layer);

  const stage = root.querySelector('.cb-stage');
  const pop = root.querySelector('.cb-pop');
  const status = root.querySelector('.cb-status');
  const warning = root.querySelector('.cb-warning');
  const tasks = [...root.querySelectorAll('.cb-task')];
  const taskNav = root.querySelector('.cb-task-nav');
  const ghost = document.createElement('div');
  ghost.className = 'cb-ghost';
  ghost.hidden = true;
  document.body.append(ghost);

  const DEFAULT_MSG = 'Drag a component onto the grid. To add a wire, drag from the end of a component.';
  function say(msg) { status.textContent = msg || DEFAULT_MSG; }

  // ---------- Drawing ----------
  function symbolSvg(c, x, y) {
    const t = TYPES[c.type];
    const id = c.type === 'switch' ? (c.closed ? 'switch-closed' : 'switch-open') : t.letter ? 'ring' : c.type;
    let s = `<use href="#sym-${id}" x="${x - S}" y="${y - (2 * S) / 3}" width="${2 * S}" height="${(4 * S) / 3}"` +
      ` transform="rotate(${c.rot * 90} ${x} ${y})"/>`;
    if (t.letter) s += `<text class="cb-letter" x="${x}" y="${y + 7.3}" text-anchor="middle">${t.letter}</text>`;
    return s;
  }

  const fmt = (v, unit) => {
    const a = Math.abs(v);
    return (a >= 100 ? a.toFixed(0) : a.toFixed(2)) + ' ' + unit;
  };

  // A rounded box around a component, lined up with it
  const outline = (c, cls) =>
    `<rect class="${cls}" x="${at(c.x) - S - 6}" y="${at(c.y) - S * 0.6}" width="${2 * S + 12}" height="${S * 1.2}"` +
    ` rx="10" transform="rotate(${c.rot * 90} ${at(c.x)} ${at(c.y)})"/>`;

  function draw() {
    const st = clone(state);
    let bad = null;
    let extraWire = null;
    if (preview && preview.comp) {
      const i = st.comps.findIndex((c) => c.id === preview.comp.id);
      if (i >= 0) st.comps.splice(i, 1);
      if (preview.bad) bad = preview.comp; else st.comps.push(preview.comp);
      if (preview.cut) st.wires = st.wires.filter((e) => !preview.cut.includes(e));
    }
    if (preview && preview.wire) {
      if (preview.bad) extraWire = preview.wire;
      else st.wires = [...new Set(st.wires.concat(preview.wire))];
    }

    const res = solve(st);
    const flows = wireFlows(st, res);
    const shorted = res.els.filter((el) => TYPES[el.c.type].emf && Math.abs(el.I) > SHORT);

    let glow = '', wires = '', flow = '', comps = '', dots = '', marks = '', labels = '', over = '';

    // Wires
    const selWire = sel && sel.wire;
    st.wires.forEach((e) => {
      const [[x1, y1], [x2, y2]] = ends(e);
      const cls = selWire && selWire.has(e) ? 'cb-wire is-selected' : 'cb-wire';
      wires += `<line class="${cls}" x1="${at(x1)}" y1="${at(y1)}" x2="${at(x2)}" y2="${at(y2)}"/>`;
      const I = flows.get(e) || 0;
      if (showFlow && Math.abs(I) > 0.002) {
        const [p, q] = I > 0 ? [[x1, y1], [x2, y2]] : [[x2, y2], [x1, y1]];
        const speed = Math.min(240, 200 * Math.abs(I));
        flow += `<line class="cb-flow" data-speed="${speed}" data-period="40" x1="${at(p[0])}" y1="${at(p[1])}"` +
          ` x2="${at(q[0])}" y2="${at(q[1])}"/>`;
      }
    });
    if (extraWire) {
      extraWire.forEach((e) => {
        const [[x1, y1], [x2, y2]] = ends(e);
        over += `<line class="cb-wire is-bad" x1="${at(x1)}" y1="${at(y1)}" x2="${at(x2)}" y2="${at(y2)}"/>`;
      });
    }

    // How many things meet at each grid point: three or more gets a junction dot
    const degree = new Map();
    const bump = (k) => degree.set(k, (degree.get(k) || 0) + 1);
    st.wires.forEach((e) => e.split('|').forEach(bump));
    st.comps.forEach((c) => ends2(c).forEach((p) => bump(pk(...p))));
    degree.forEach((d, k) => {
      const [x, y] = unpk(k);
      if (d >= 3) dots += `<circle class="cb-junction" cx="${at(x)}" cy="${at(y)}" r="6"/>`;
      // A loose end: show a hollow ring to invite a wire
      else if (d === 1 && st.comps.some((c) => ends2(c).some((p) => pk(...p) === k))) {
        marks += `<circle class="cb-end" cx="${at(x)}" cy="${at(y)}" r="7"/>`;
      }
    });

    // Components
    const comp = (c, cls) => {
      const x = at(c.x), y = at(c.y);
      const el = res.byId.get(c.id);
      const I = el ? Math.abs(el.I) : 0;
      let s = `<g class="cb-comp ${cls || ''}">`;
      if (sel && sel.comp === c.id) s += outline(c, 'cb-sel');
      if (shorted.some((x2) => x2.c.id === c.id)) s += outline(c, 'cb-short');
      if (c.type === 'lamp' && el) {
        const b = (I * I * TYPES.lamp.R) / LAMP_FULL;
        if (I > 0.01) {
          const k = Math.min(1, Math.sqrt(b));
          glow += `<circle cx="${x}" cy="${y}" r="${S * (0.6 + 0.45 * Math.min(b, 2.5))}" fill="url(#cb-glow)"` +
            ` opacity="${k.toFixed(2)}"/>`;
          s += `<circle class="cb-lit" cx="${x}" cy="${y}" r="15" opacity="${k.toFixed(2)}"/>`;
        }
      }
      if (c.type === 'led' && el && el.on && I > 0.002) {
        const k = Math.min(1, I / 0.05);
        glow += `<circle cx="${x}" cy="${y}" r="${S * 0.95}" fill="url(#cb-glow-led)" opacity="${(0.35 + 0.65 * k).toFixed(2)}"/>`;
        s += `<circle class="cb-lit-led" cx="${x}" cy="${y}" r="16" opacity="${(0.3 + 0.5 * k).toFixed(2)}"/>`;
      }
      if (c.type === 'motor' && I > WORKING && showFlow) {
        s += `<circle class="cb-spin" data-speed="${Math.min(200, 160 * I)}" data-period="14.45" cx="${x}" cy="${y}" r="23"/>`;
      }
      s += symbolSvg(c, x, y) + '</g>';

      // Readings
      const vertical = c.rot % 2 === 1;
      const lx = vertical ? x + S * 1.2 : x;
      const ly = vertical ? y : y - S * 0.95;
      const pill = (text, cls2) =>
        `<g class="cb-reading ${cls2 || ''}"><rect x="${lx - 44}" y="${ly - 15}" width="88" height="30" rx="8"/>` +
        `<text x="${lx}" y="${ly + 6.5}" text-anchor="middle">${text}</text></g>`;
      if (el && c.type === 'ammeter') labels += pill(fmt(el.I, 'A'));
      if (el && c.type === 'voltmeter') labels += pill(fmt(el.V, 'V'));
      if (c.type === 'resistor') labels += `<text class="cb-value" x="${lx}" y="${ly + 6}" text-anchor="middle">10 Ω</text>`;
      return s;
    };
    st.comps.forEach((c) => { comps += comp(c); });
    if (bad) over += comp(bad, 'is-bad');

    if (pending) {
      over += `<circle class="cb-pending" cx="${at(pending[0])}" cy="${at(pending[1])}" r="13"/>`;
    }

    layer.innerHTML = `<g>${glow}</g><g>${wires}</g><g>${flow}</g><g>${comps}</g><g>${dots}</g>` +
      `<g>${marks}</g><g>${labels}</g><g>${over}</g>`;
    movers = [...layer.querySelectorAll('[data-speed]')];
    if (movers.length) startAnimation();

    warning.hidden = shorted.length === 0;
    placePop();
    return res;
  }

  // ---------- Moving dots ----------
  let movers = [];
  let animating = false;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function startAnimation() {
    if (animating || reduceMotion()) return;
    animating = true;
    const t0 = performance.now();
    const frame = (now) => {
      if (!movers.length) { animating = false; return; }
      const t = (now - t0) / 1000;
      movers.forEach((m) => {
        const period = +m.dataset.period;
        m.style.strokeDashoffset = String(-((t * +m.dataset.speed) % period));
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function svgPoint(x, y) {
    const p = board.createSVGPoint();
    p.x = x;
    p.y = y;
    return p;
  }

  // ---------- Selection pop-up (Turn, Delete) ----------
  function placePop() {
    let target = null;
    if (sel && sel.comp) {
      const c = state.comps.find((c2) => c2.id === sel.comp);
      if (c && !drag) target = { x: at(c.x), y: at(c.y), r: c.rot % 2 ? S * 1.2 : S * 0.75, comp: c };
    } else if (sel && sel.wire && !drag) {
      const pts = [...sel.wire].flatMap(ends);
      const xs = pts.map((p) => at(p[0])), ys = pts.map((p) => at(p[1]));
      target = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys), r: S * 0.4 };
    }
    pop.hidden = !target;
    if (!target) return;
    pop.querySelector('[data-act="turn"]').hidden = !target.comp;
    const m = board.getScreenCTM();
    const box = stage.getBoundingClientRect();
    const p = svgPoint(target.x, target.y).matrixTransform(m);
    const scale = m.a;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let top = p.y - box.top - target.r * scale - h - 8;
    if (top < 4) top = p.y - box.top + target.r * scale + 8;
    const left = Math.max(4, Math.min(box.width - w - 4, p.x - box.left - w / 2));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !sel) return;
    if (btn.dataset.act === 'delete') {
      if (sel.comp) commit(() => { state.comps = state.comps.filter((c) => c.id !== sel.comp); });
      else commit(() => { state.wires = state.wires.filter((w) => !sel.wire.has(w)); });
      sel = null;
      say();
      update();
    }
    if (btn.dataset.act === 'turn') {
      const c = state.comps.find((c2) => c2.id === sel.comp);
      for (let k = 1; k <= 3; k++) {
        const t = Object.assign({}, c, { rot: (c.rot + k) % 4 });
        if (canPlace(state, t)) { commit(() => { c.rot = t.rot; }); return; }
      }
      say('There is no room to turn it here. Move it somewhere with more space first.');
    }
  });

  // ---------- Board pointer handling ----------
  function gridAt(e) {
    const p = svgPoint(e.clientX, e.clientY).matrixTransform(board.getScreenCTM().inverse());
    const fx = (p.x - S / 2) / S, fy = (p.y - S / 2) / S;
    const x = Math.max(0, Math.min(COLS - 1, Math.round(fx)));
    const y = Math.max(0, Math.min(ROWS - 1, Math.round(fy)));
    return { x, y, fx, fy };
  }
  const outside = (e) => {
    const r = board.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  const compAt = (x, y) => state.comps.find((c) => c.x === x && c.y === y);
  const isEnd = (x, y) => state.comps.some((c) => ends2(c).some((p) => p[0] === x && p[1] === y));

  // The wire nearest a point, if the finger is on one
  function wireNear(fx, fy) {
    let best = null, bestD = 0.32;
    state.wires.forEach((e) => {
      const [[x1, y1], [x2, y2]] = ends(e);
      const d = y1 === y2
        ? (fx >= x1 - 0.15 && fx <= x2 + 0.15 ? Math.abs(fy - y1) : 9)
        : (fy >= y1 - 0.15 && fy <= y2 + 0.15 ? Math.abs(fx - x1) : 9);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  // A whole wire from one connection to the next: follow it through plain bends
  function wireRun(edge) {
    const deg = new Map();
    state.wires.forEach((e) => e.split('|').forEach((k) => deg.set(k, (deg.get(k) || 0) + 1)));
    const run = new Set([edge]);
    const todo = edge.split('|');
    while (todo.length) {
      const k = todo.pop();
      const [x, y] = unpk(k);
      if (deg.get(k) !== 2 || isEnd(x, y)) continue;
      state.wires.forEach((e) => {
        if (!run.has(e) && e.split('|').includes(k)) {
          run.add(e);
          todo.push(e.split('|').find((p) => p !== k));
        }
      });
    }
    return run;
  }

  function addWire(edges) {
    commit(() => { state.wires = [...new Set(state.wires.concat(edges))]; });
  }

  function tap(g) {
    const c = compAt(g.x, g.y);
    if (c) {
      pending = null;
      if (c.type === 'switch') {
        commit(() => { c.closed = !c.closed; });
        sel = { comp: c.id };
        say(c.closed ? 'Switch closed: the gap is joined, so current can flow.' : 'Switch open: there is a gap, so no current can flow through it.');
      } else if (sel && sel.comp === c.id) {
        sel = null;
        say();
      } else {
        sel = { comp: c.id };
        say(TYPES[c.type].name + ' selected. Drag it to move it, or use Turn or Delete.');
      }
      draw();
      return;
    }
    const p = [g.x, g.y];
    if (pending) {
      if (same(pending, p)) { pending = null; say(); draw(); return; }
      const r = bestRoute(state, pending, p, true);
      if (r.ok) { pending = null; sel = null; say(); addWire(r.edges); }
      else say('A wire can’t go through a component. Try a different spot.');
      return;
    }
    const w = wireNear(g.fx, g.fy);
    if (isEnd(g.x, g.y)) {
      pending = p;
      sel = null;
      say('Now tap where the wire should go.');
      draw();
      return;
    }
    if (w) {
      sel = { wire: wireRun(w) };
      say('Wire selected. Tap a component to join it into this wire, or use Delete.');
    } else {
      sel = null;
      say();
    }
    draw();
  }

  board.addEventListener('pointerdown', (e) => {
    if (drag || e.button > 0) return;
    const g = gridAt(e);
    drag = { id: e.pointerId, cx: e.clientX, cy: e.clientY, start: g, moving: false, comp: compAt(g.x, g.y) };
    // Keep receiving this finger's moves even if it slides off the grid
    board.setPointerCapture(e.pointerId);
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 10) return;
      drag.moving = true;
      pending = null;
      pop.hidden = true;
    }
    const g = gridAt(e);
    if (drag.comp) {
      // Move the component with the finger; off the board means "remove"
      const c = drag.comp;
      const moved = Object.assign({}, c, { x: c.x + g.x - drag.start.x, y: c.y + g.y - drag.start.y });
      drag.off = outside(e);
      const key = drag.off ? 'off' : moved.x + ',' + moved.y;
      if (key === drag.last) return;
      drag.last = key;
      preview = drag.off ? { comp: c, bad: true } : placement(state, moved);
      say(drag.off ? 'Let go here to remove it.' : preview.cut ? SPLICE_MSG : '');
      draw();
      return;
    }
    // Draw a wire: straight, or with one right-angled corner
    const p = [drag.start.x, drag.start.y];
    const q = [g.x, g.y];
    const key = q.join(',');
    if (key === drag.last) return;
    drag.last = key;
    if (same(p, q)) { preview = null; draw(); return; }
    if (drag.horizontal === undefined) drag.horizontal = Math.abs(g.fx - p[0]) >= Math.abs(g.fy - p[1]);
    const r = bestRoute(state, p, q, drag.horizontal);
    preview = { wire: r.edges, bad: !r.ok };
    draw();
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    const pv = preview;
    drag = null;
    preview = null;
    if (!d.moving) {
      if (e.type === 'pointerup') tap(d.start);
      return;
    }
    if (e.type === 'pointercancel' || !pv) { draw(); return; }
    if (pv.comp) {
      if (d.off) {
        commit(() => { state.comps = state.comps.filter((c) => c.id !== d.comp.id); });
        sel = null;
        say('Removed.');
      } else if (!pv.bad) {
        commit(() => {
          Object.assign(d.comp, { x: pv.comp.x, y: pv.comp.y, rot: pv.comp.rot });
          if (pv.cut) state.wires = state.wires.filter((e) => !pv.cut.includes(e));
        });
        sel = { comp: d.comp.id };
        say(pv.cut ? TYPES[d.comp.type].name + ' joined into the wire.' : '');
      } else {
        say('It can’t go there: it would sit on top of something. Try a clear spot.');
      }
      draw();
      return;
    }
    if (pv.wire && !pv.bad) { sel = null; say(); addWire(pv.wire); }
    else { say('A wire can’t go through a component. Go round it.'); draw(); }
  }
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('lostpointercapture', (e) => {
    if (drag && e.pointerId === drag.id) endDrag({ type: 'pointercancel', pointerId: e.pointerId });
  });

  // ---------- Palette: drag a component in, or tap to drop it in a free space ----------
  function freeSpot(type) {
    const spots = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) spots.push([x, y]);
    spots.sort((a, b) => Math.hypot(a[0] - 9, (a[1] - 5) * 1.6) - Math.hypot(b[0] - 9, (b[1] - 5) * 1.6));
    for (const [x, y] of spots) {
      const c = { id: 'new', type, x, y, rot: 0, closed: false };
      // Leave a gap round it so it doesn't touch anything by accident
      const clear = state.comps.every((o) => Math.abs(o.x - x) + Math.abs(o.y - y) >= 4) &&
        !state.wires.some((e) => ends(e).some((p) => Math.abs(p[0] - x) <= 1 && Math.abs(p[1] - y) <= 1));
      if (clear && canPlace(state, c)) return c;
    }
    // Crowded grid: settle for any space it fits
    for (const [x, y] of spots) {
      const c = { id: 'new', type, x, y, rot: 0, closed: false };
      if (canPlace(state, c)) return c;
    }
    return null;
  }

  function addComp(c, cut) {
    const id = state.next;
    commit(() => {
      state.next += 1;
      state.comps.push(Object.assign({}, c, { id }));
      if (cut) state.wires = state.wires.filter((e) => !cut.includes(e));
    });
    sel = { comp: id };
    pending = null;
    draw();
  }

  root.querySelectorAll('.cb-palette [data-type]').forEach((btn) => {
    const type = btn.dataset.type;
    let p = null;
    let dragged = false;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, moving: false };
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!p || e.pointerId !== p.id) return;
      if (!p.moving) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) return;
        p.moving = true;
        ghost.innerHTML = btn.querySelector('svg').outerHTML;
        sel = null;
        pending = null;
      }
      if (outside(e)) {
        ghost.hidden = false;
        ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        if (preview) { preview = null; draw(); }
        p.last = null;
        return;
      }
      ghost.hidden = true;
      const g = gridAt(e);
      const key = g.x + ',' + g.y;
      if (key === p.last) return;
      p.last = key;
      const c = { id: 'new', type, x: g.x, y: g.y, rot: 0, closed: false };
      preview = placement(state, c);
      say(preview.cut ? SPLICE_MSG : '');
      draw();
    });
    const end = (e) => {
      if (!p || e.pointerId !== p.id) return;
      const was = p.moving;
      p = null;
      ghost.hidden = true;
      if (!was) return;
      dragged = true;
      setTimeout(() => { dragged = false; }, 0);
      const pv = preview;
      preview = null;
      if (e.type === 'pointerup' && pv && !pv.bad) {
        addComp(pv.comp, pv.cut);
        say(pv.cut ? TYPES[type].name + ' joined into the wire.' : '');
      }
      else {
        if (pv) say('It can’t go there: it would sit on top of something. Try a clear spot.');
        draw();
      }
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', () => {
      if (dragged) return;
      if (sel && sel.wire) {
        // Tap fallback for dropping onto a wire: put it into the selected wire, near its middle
        const pts = [...new Set([...sel.wire].flatMap((e) => e.split('|')))].map(unpk);
        const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        pts.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
        for (const [x, y] of pts) {
          const s = spliceInto(state, { id: 'new', type, x, y, rot: 0, closed: false });
          if (s) { addComp(s.comp, s.cut); say(TYPES[type].name + ' joined into the wire.'); return; }
        }
        say('That wire is too short to fit a component. It needs a straight part at least two squares long.');
        return;
      }
      const c = freeSpot(type);
      if (!c) { say('The grid is full. Remove something first.'); return; }
      addComp(c);
      say(TYPES[type].name + ' added. Drag it where you want it.');
    });
  });

  // ---------- Toolbar ----------
  root.querySelector('[data-cb="undo"]').addEventListener('click', () => {
    if (!history.length) { say('Nothing to undo.'); return; }
    state = history.pop();
    sel = null;
    pending = null;
    save();
    say();
    update();
  });
  root.querySelector('[data-cb="clear"]').addEventListener('click', () => {
    if (!state.comps.length && !state.wires.length) return;
    commit(() => { state.comps = []; state.wires = []; });
    sel = null;
    pending = null;
    say('Grid cleared. Undo brings it back.');
    draw();
  });
  const flowBtn = root.querySelector('[data-cb="flow"]');
  flowBtn.addEventListener('click', () => {
    showFlow = !showFlow;
    flowBtn.setAttribute('aria-pressed', String(showFlow));
    draw();
  });

  // ---------- Tasks ----------
  const nav = tasks.map((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cb-chip';
    b.textContent = t.classList.contains('q-challenge') ? 'Challenge' : String(i + 1);
    b.addEventListener('click', () => { task = i; save(); showTask(); });
    taskNav.insertBefore(b, taskNav.querySelector('.cb-example'));
    return b;
  });

  function showTask() {
    tasks.forEach((t, i) => { t.hidden = i !== task; });
    nav.forEach((b, i) => {
      b.classList.toggle('is-done', solved.has(i));
      if (i === task) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.setAttribute('aria-label', (b.textContent === 'Challenge' ? 'Challenge' : 'Task ' + (i + 1)) +
        (solved.has(i) ? ', done' : ''));
    });
    tasks.forEach((t, i) => {
      const box = t.querySelector('.q-feedback');
      if (!box) return;
      t.classList.toggle('is-solved', solved.has(i));
      if (solved.has(i)) {
        const explain = t.querySelector('.q-explain');
        const last = i === tasks.length - 1;
        box.className = 'q-feedback is-good';
        box.innerHTML = '<strong>Correct!</strong> ' + (explain ? explain.innerHTML : '') +
          (last ? '' : ' <button type="button" class="tool cb-next">Next task</button>');
      } else {
        box.className = 'q-feedback';
        box.innerHTML = '';
      }
    });
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('.cb-next')) {
      task = Math.min(tasks.length - 1, task + 1);
      save();
      showTask();
    }
    if (e.target.closest('[data-cb="example"]')) {
      const ex = EXAMPLES[tasks[task].dataset.check];
      if (!ex) return;
      commit(() => {
        state.comps = ex.comps.map((c) => Object.assign({}, c, { id: state.next++ }));
        state.wires = ex.wires.slice();
      });
      sel = null;
      pending = null;
      say('Example circuit for task ' + (task + 1) + '. Undo brings back what was there before.');
      draw();
    }
  });

  function checkTasks(res) {
    let fresh = [];
    tasks.forEach((t, i) => {
      if (solved.has(i)) return;
      const check = CHECKS[t.dataset.check];
      if (check && check(state, res)) { solved.add(i); fresh.push(i); }
    });
    if (!fresh.length) return;
    save();
    showTask();
    const names = fresh.map((i) => (i === tasks.length - 1 ? 'the Challenge' : 'task ' + (i + 1)));
    say('Well done: you have finished ' + names.join(' and ') + '.');
  }

  function update() {
    const res = draw();
    checkTasks(res);
  }

  // starter.js resets the question cards; this clears the board and progress too
  const resetBtn = document.querySelector('[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      history = [];
      state = { comps: [], wires: [], next: 1 };
      solved = new Set();
      task = 0;
      sel = null;
      pending = null;
      save();
      say();
      showTask();
      draw();
    });
  }

  window.addEventListener('resize', () => placePop());

  say();
  showTask();
  update();
})();
