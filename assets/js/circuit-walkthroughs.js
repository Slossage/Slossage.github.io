// Circuit walkthroughs: step-by-step guides through the switching circuits pupils meet in the exam.
// Each walkthrough loads a ready-made circuit onto a locked circuit-builder board, picks out one
// part at a time, and gives pupils sliders, live readings and a "chain" that lights up link by link.
//
// Markup (see n5/circuit-builder.html):
//   [data-walkthroughs]          wrapper. Optional data-key="…" (localStorage key for finished walkthroughs).
//     a[href="#key"]             picker cards; the hash opens that walkthrough
//     .wt-player                 holds the board ([data-circuit-builder][data-guided]), .wt-tapinfo,
//                                .wt-panel, .wt-dots, .wt-back, .wt-next, .wt-count and .wt-title
//     .wt[data-wt="key"]         one per walkthrough, inside .wt-panel, with a .wt-name heading and
//                                its .wt-step elements. Each step may have:
//         data-circuit="name"    which of the walkthrough's circuits to show (default: main)
//         data-focus="id id"     parts to ring on the board (the rest fade back)
//         data-control="…"       sliders and buttons: temp, light, or a component id from `controls`
//         data-chain             show the live chain (or the readings, for the building blocks)
//         data-graph="id"        a resistance graph for an LDR or thermistor
//         data-taps="id id"      "tap each part" task
//         data-wide              full width, with the circuit above (for the longer questions)
//         .q.wt-predict          a question (starter.js) that must be answered before the controls work
//         [data-live]            where the live panel goes (default: the end of the step)
// The circuits, controls and chains for each key are defined in WALKS below.
// Needs circuit-builder.js (for the board) and starter.js (for the questions).
(function () {
  'use strict';

  const box = document.querySelector('[data-walkthroughs]');
  if (!box) return;
  const player = box.querySelector('.wt-player');
  const boardRoot = player.querySelector('[data-guided]');
  const api = boardRoot && boardRoot.cbApi;
  if (!api) return;

  // ---------- Building circuits ----------
  const pk = (x, y) => x + ',' + y;
  const ek = (x1, y1, x2, y2) =>
    x1 < x2 || (x1 === x2 && y1 < y2) ? pk(x1, y1) + '|' + pk(x2, y2) : pk(x2, y2) + '|' + pk(x1, y1);
  // Straight runs of wire through a list of grid points, as unit edges
  function W(...pts) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      let [x, y] = pts[i - 1];
      const [tx, ty] = pts[i];
      while (x !== tx || y !== ty) {
        const nx = x + Math.sign(tx - x), ny = y + Math.sign(ty - y);
        out.push(ek(x, y, nx, ny));
        x = nx; y = ny;
      }
    }
    return out;
  }
  const C = (id, type, x, y, extra) => Object.assign({ id, type, x, y, rot: 0 }, extra);
  const up = { rot: 1 };   // drawn upright, with pin 0 at the top

  // The exam layout: supply terminals on the left, a potential divider at x = 4 with its middle at
  // y = 6, the transistor at x = 10 with the output above it. `load` is 'led' (with its resistor),
  // or another output type; `relay` puts a relay coil there and a mains heater circuit to the right.
  function switching(top, bottom, tr, load, opts = {}) {
    const comps = [C('sup', 'rails', 1, 5, { value: 5 }), top, bottom, C('tr', tr, 10, 6)];
    const wires = [W([4, 1], [4, 2]), W([4, 4], [4, 6], [9, 6]), W([4, 8], [4, 9]), W([1, 9], [10, 9]), W([10, 7], [10, 9])];
    if (opts.sw) {
      comps.push(C('sw', 'switch', 3, 1));
      wires.push(W([1, 1], [2, 1]), W([4, 1], [10, 1]));
    } else {
      wires.push(W([1, 1], [10, 1]));
    }
    if (load === 'led') {
      comps.push(C('rled', 'resistor', 10, 2, { rot: 1, value: 220 }), C('out', 'led', 10, 4, up));
    } else if (load === 'relay') {
      comps.push(C('relay', 'relay', 11, 3, up), C('mains', 'ac-supply', 15, 2), C('out', 'heater', 15, 8));
      wires.push(W([10, 1], [10, 2]), W([10, 4], [10, 5]), W([12, 2], [14, 2]), W([16, 2], [17, 2], [17, 8], [16, 8]),
        W([14, 8], [13, 8], [13, 4], [12, 4]));
    } else {
      comps.push(C('out', load, 10, 4, up));
      wires.push(W([10, 1], [10, 3]));
    }
    return { comps, wires: wires.flat(), view: [-1, 0, load === 'relay' ? 18 : 13, 10] };
  }

  // A potential divider on its own: supply terminals and two parts in a column at x = 4
  function divider(top, bottom, volts) {
    return {
      comps: [C('sup', 'rails', 1, 5, { value: volts }), top, bottom],
      wires: [W([1, 1], [4, 1], [4, 2]), W([4, 4], [4, 6]), W([4, 8], [4, 9], [1, 9])].flat(),
      view: [-1, 0, 9, 10],
    };
  }

  // A part with an ohmmeter across it, and no supply
  function metered(part) {
    return {
      comps: [C(part.id, part.type, 5, 2), C('ohm', 'ohmmeter', 5, 6)],
      wires: [W([4, 2], [3, 2], [3, 6], [4, 6]), W([6, 2], [7, 2], [7, 6], [6, 6])].flat(),
      view: [0, 0, 10, 7],
    };
  }

  // ---------- Words and numbers ----------
  // Two significant figures (or one decimal place below 10)
  function sf2(v) {
    if (v < 10) return v.toFixed(1);
    const p = 10 ** (Math.floor(Math.log10(v)) - 1);
    return String(Math.round(v / p) * p);
  }
  const fmtR = (R) => (R >= 1000 ? sf2(R / 1000) + ' kΩ' : sf2(R) + ' Ω');
  const fmtV = (v) => v.toFixed(2) + ' V';
  const lightWord = (v) => (v < 20 ? 'Dark' : v < 50 ? 'Dim' : v < 80 ? 'Bright' : 'Very bright');
  const onOff = (on) => (on ? 'ON' : 'OFF');

  // Readings drawn on the board next to a part: lines of [label, text]
  const note = (x, y, text, cls, anchor) => ({ x, y, text, cls, anchor: anchor || 'start' });
  const pinNames = {
    npn: ['base', 'collector', 'emitter'],
    mosfet: ['gate', 'drain', 'source'],
  };
  function pins(type) {
    const [b, c, e] = pinNames[type];
    return [note(8.8, 5.45, b, 'is-pin', 'end'), note(10.7, 4.95, c, 'is-pin'), note(10.7, 7.05, e, 'is-pin')];
  }

  // ---------- What each part does (shown when it is tapped) ----------
  const INFO = {
    rails: 'The supply. The top terminal is kept at the supply voltage and the bottom one at 0 V.',
    resistor: 'Its resistance stays the same. With the part above or below it, it makes a potential divider.',
    'variable-resistor': 'Its resistance can be changed. In a switching circuit it sets the temperature or light level at which the circuit switches.',
    ldr: 'Light-dependent resistor. The brighter the light, the lower its resistance.',
    thermistor: 'Its resistance changes with temperature. The hotter it gets, the lower its resistance.',
    npn: 'An electronic switch with no moving parts. It switches on when the voltage across its base and emitter reaches 0.7 V.',
    mosfet: 'An electronic switch with no moving parts. It switches on when the voltage across its gate and source reaches its switching voltage (2.0 V in this circuit).',
    relay: 'A switch worked by an electromagnet. Current in the coil makes it magnetic, and that pulls the switch closed. A small current can switch on a separate circuit with a big current or a high voltage.',
    led: 'Light-emitting diode. It gives out light when current flows through it the right way.',
    motor: 'Changes electrical energy into kinetic energy. Here it turns a fan.',
    loudspeaker: 'Changes electrical energy into sound. Here it is the alarm.',
    heater: 'Changes electrical energy into heat. It runs from the 230 V mains, not from the 5.0 V supply.',
    'ac-supply': 'The mains: 230 V a.c. The current keeps changing direction (50 times a second in real life; slowed right down here).',
    switch: 'Tap it to open or close it.',
    capacitor: 'Stores charge. It takes time to charge up, so the voltage across it rises slowly.',
    ohmmeter: 'Measures resistance. It is used with no supply connected.',
  };

  // ---------- The walkthroughs ----------
  // circuits: name → circuit. start: slider settings. controls: component sliders and buttons.
  // notes(r): labels on the board. chain: rows of the live panel, each { label, value(r), num(r)
  // for the rising/falling tag, on(r) to light it, meter: { value(r), max, mark, markText } }.
  // arrows: show the chain as cause and effect. info: what particular parts do, by id.
  const resVol = (id, x, y, r, withR) =>
    (withR ? [note(x, y, 'R = ' + fmtR(r.R(id)), 'is-reading')] : [])
      .concat([note(x, y + (withR ? 0.6 : 0), 'V = ' + fmtV(r.V(id)), 'is-reading')]);

  const WALKS = {
    divider: {
      circuits: { main: divider(C('r1', 'resistor', 4, 3, { rot: 1, value: 10000 }), C('r2', 'variable-resistor', 4, 7, { rot: 1, value: 10000 }), 6) },
      controls: { r2: { label: 'R₂ (variable resistor)', min: 1000, max: 100000 } },
      notes: (r) => [note(3.4, 3, 'R₁', 'is-label', 'end'), note(3.4, 7, 'R₂', 'is-label', 'end'),
        note(4.85, 3.65, 'V₁ = ' + fmtV(r.V('r1')), 'is-reading'), note(4.85, 7.65, 'V₂ = ' + fmtV(r.V('r2')), 'is-reading'),
        note(4.5, 5.1, 'middle point', 'is-pin')],
      chain: [
        { label: 'R₂', value: (r) => fmtR(r.R('r2')), num: (r) => r.R('r2') },
        { label: 'V₂ (across R₂)', value: (r) => fmtV(r.V('r2')), num: (r) => r.V('r2'), meter: { value: (r) => r.V('r2'), max: 6 } },
        { label: 'V₁ (across R₁)', value: (r) => fmtV(r.V('r1')), num: (r) => r.V('r1'), meter: { value: (r) => r.V('r1'), max: 6 } },
        { label: 'V₁ + V₂', value: (r) => fmtV(r.V('r1') + r.V('r2')) },
      ],
    },

    ldr: {
      circuits: {
        main: metered({ id: 'ldr', type: 'ldr' }),
        divider: divider(C('r', 'resistor', 4, 3, { rot: 1, value: 10000 }), C('ldr', 'ldr', 4, 7, up), 5),
      },
      start: { light: 80 },
      notes: (r) => (r.has('r') ? resVol('ldr', 4.85, 7.1, r, true).concat(resVol('r', 4.85, 3.65, r)) : []),
      chain: [
        { label: 'Light level', value: (r) => lightWord(r.env.light), num: (r) => r.env.light },
        { label: 'Resistance of the LDR', value: (r) => fmtR(r.R('ldr')), num: (r) => r.R('ldr') },
        { label: 'Voltage across the LDR', value: (r) => fmtV(r.V('ldr')), num: (r) => r.V('ldr'), when: 'divider',
          meter: { value: (r) => r.V('ldr'), max: 5 } },
      ],
      arrows: true,
    },

    thermistor: {
      circuits: {
        main: metered({ id: 'th', type: 'thermistor' }),
        divider: divider(C('r', 'resistor', 4, 3, { rot: 1, value: 1000 }), C('th', 'thermistor', 4, 7, up), 5),
      },
      start: { temp: 20 },
      notes: (r) => (r.has('r') ? resVol('th', 4.85, 7.1, r, true).concat(resVol('r', 4.85, 3.65, r)) : []),
      chain: [
        { label: 'Temperature', value: (r) => r.env.temp + ' °C', num: (r) => r.env.temp },
        { label: 'Resistance of the thermistor', value: (r) => fmtR(r.R('th')), num: (r) => r.R('th') },
        { label: 'Voltage across the thermistor', value: (r) => fmtV(r.V('th')), num: (r) => r.V('th'), when: 'divider',
          meter: { value: (r) => r.V('th'), max: 5 } },
      ],
      arrows: true,
    },

    transistor: {
      circuits: {
        main: switching(C('r', 'resistor', 4, 3, { rot: 1, value: 10000 }), C('vr', 'variable-resistor', 4, 7, { rot: 1, value: 1000 }), 'npn', 'led'),
        mosfet: switching(C('r', 'resistor', 4, 3, { rot: 1, value: 10000 }), C('vr', 'variable-resistor', 4, 7, { rot: 1, value: 1000 }), 'mosfet', 'led'),
      },
      controls: { vr: { label: 'Variable resistor', min: 100, max: 10000 } },
      notes: (r) => pins(r.type('tr')).concat(resVol('vr', 4.85, 7.65, r)),
      chain: [
        { label: (r) => (r.type('tr') === 'npn' ? 'Voltage across base and emitter' : 'Voltage across gate and source'),
          value: (r) => fmtV(r.V('vr')), num: (r) => r.V('vr'), on: (r) => r.on('tr'),
          meter: { value: (r) => r.V('vr'), max: 3, mark: (r) => (r.type('tr') === 'npn' ? 0.7 : 2.0),
            markText: (r) => 'switches on at ' + (r.type('tr') === 'npn' ? '0.7 V' : '2.0 V') } },
        { label: (r) => (r.type('tr') === 'npn' ? 'Transistor' : 'MOSFET'), value: (r) => onOff(r.on('tr')), on: (r) => r.on('tr') },
        { label: 'LED', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
      info: { rled: 'This resistor limits the current through the LED, so the LED is not damaged.',
        vr: 'Change its resistance with the slider. It is between the base (or gate) and the 0 V line, so the voltage across it is the voltage the transistor responds to.' },
    },

    relay: {
      circuits: {
        main: {
          comps: [C('sup', 'rails', 1, 5, { value: 5 }), C('sw', 'switch', 4, 1), C('relay', 'relay', 7, 5, up),
            C('mains', 'ac-supply', 11, 2), C('out', 'heater', 13, 6, up)],
          wires: [W([1, 1], [3, 1]), W([5, 1], [6, 1], [6, 4]), W([6, 6], [6, 9], [1, 9]), W([8, 4], [8, 2], [10, 2]),
            W([12, 2], [13, 2], [13, 5]), W([13, 7], [13, 8], [8, 8], [8, 6])].flat(),
          view: [-1, 0, 14, 10],
        },
      },
      controls: { sw: { kind: 'switch', label: 'switch' } },
      notes: () => [note(5.2, 5.1, 'coil', 'is-pin', 'end'), note(8.8, 5.1, 'switch', 'is-pin'),
        note(11, 1.15, '230 V a.c.', 'is-label', 'middle'), note(12.4, 6.1, 'heater', 'is-label', 'end')],
      chain: [
        { label: 'Switch', value: (r) => (r.closed('sw') ? 'closed' : 'open'), on: (r) => r.closed('sw') },
        { label: 'Current in the coil', value: (r) => (r.I('relay') * 1000).toFixed(0) + ' mA', num: (r) => r.I('relay'), on: (r) => r.I('relay') > 0.02 },
        { label: 'Relay switch', value: (r) => (r.on('relay') ? 'closed' : 'open'), on: (r) => r.on('relay') },
        { label: 'Heater', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
    },

    dark: {
      circuits: { main: switching(C('r', 'resistor', 4, 3, { rot: 1, value: 10000 }), C('ldr', 'ldr', 4, 7, up), 'npn', 'led') },
      start: { light: 80 },
      notes: (r) => pins('npn').concat(resVol('ldr', 4.85, 7.1, r, true)),
      chain: [
        { label: 'Light level', value: (r) => lightWord(r.env.light), num: (r) => r.env.light },
        { label: 'Resistance of the LDR', value: (r) => fmtR(r.R('ldr')), num: (r) => r.R('ldr') },
        { label: 'Voltage across the LDR', value: (r) => fmtV(r.V('ldr')), num: (r) => r.V('ldr'), on: (r) => r.on('tr'),
          meter: { value: (r) => r.V('ldr'), max: 5, mark: 0.7, markText: 'transistor switches on at 0.7 V' } },
        { label: 'Transistor', value: (r) => onOff(r.on('tr')), on: (r) => r.on('tr') },
        { label: 'LED', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
      info: { rled: 'This resistor limits the current through the LED, so the LED is not damaged.',
        r: 'A fixed resistor. With the LDR it makes a potential divider. A different value would change how dark it has to get before the LED comes on.',
        ldr: 'Light-dependent resistor. It is between the base and the emitter (the 0 V line), so the transistor responds to the voltage across it.' },
    },

    fan: {
      circuits: { main: switching(C('th', 'thermistor', 4, 3, up), C('r', 'resistor', 4, 7, { rot: 1, value: 1000 }), 'mosfet', 'motor') },
      start: { temp: 20 },
      notes: (r) => pins('mosfet').concat(resVol('th', 4.85, 3.1, r, true), resVol('r', 4.85, 7.65, r)),
      chain: [
        { label: 'Temperature', value: (r) => r.env.temp + ' °C', num: (r) => r.env.temp },
        { label: 'Resistance of the thermistor', value: (r) => fmtR(r.R('th')), num: (r) => r.R('th') },
        { label: 'Voltage across the resistor', value: (r) => fmtV(r.V('r')), num: (r) => r.V('r'), on: (r) => r.on('tr'),
          meter: { value: (r) => r.V('r'), max: 5, mark: 2.0, markText: 'MOSFET switches on at 2.0 V' } },
        { label: 'MOSFET', value: (r) => onOff(r.on('tr')), on: (r) => r.on('tr') },
        { label: 'Fan (motor)', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
      info: { r: 'A fixed resistor. It is between the gate and the source (the 0 V line), so the MOSFET responds to the voltage across it.',
        th: 'Thermistor: the hotter it gets, the lower its resistance. Here it is at the top of the potential divider.' },
    },

    heater: {
      circuits: { main: switching(C('vr', 'variable-resistor', 4, 3, { rot: 1, value: 4700 }), C('th', 'thermistor', 4, 7, up), 'mosfet', 'relay') },
      start: { temp: 25 },
      controls: { vr: { label: 'Variable resistor', min: 2200, max: 10000 } },
      notes: (r) => pins('mosfet').concat(resVol('th', 4.85, 7.1, r, true), [note(11, 0.6, 'relay', 'is-label', 'middle'),
        note(15, 1.15, '230 V a.c.', 'is-label', 'middle'), note(15, 9.05, 'heating element', 'is-label', 'middle')]),
      chain: [
        { label: 'Temperature', value: (r) => r.env.temp + ' °C', num: (r) => r.env.temp },
        { label: 'Resistance of the thermistor', value: (r) => fmtR(r.R('th')), num: (r) => r.R('th') },
        { label: 'Voltage across the thermistor', value: (r) => fmtV(r.V('th')), num: (r) => r.V('th'), on: (r) => r.on('tr'),
          meter: { value: (r) => r.V('th'), max: 5, mark: 2.0, markText: 'MOSFET switches on at 2.0 V' } },
        { label: 'MOSFET', value: (r) => onOff(r.on('tr')), on: (r) => r.on('tr') },
        { label: 'Relay', value: (r) => (r.on('relay') ? 'closed' : 'open'), on: (r) => r.on('relay') },
        { label: 'Heating element', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
      // The temperature below which the heater comes on, for the variable resistor step
      // (worked out again only when the variable resistor changes)
      extra: (r, mem) => {
        if (mem.vr !== r.R('vr')) {
          mem.vr = r.R('vr');
          let t = -1;
          for (let temp = 0; temp <= 100; temp++) if (api.read({ temp }).on('out')) t = temp;
          mem.html = t < 0 ? 'With this setting the heater never comes on.' :
            'With this setting the heater comes on below about <strong>' + (t + 1) + ' °C</strong>.';
        }
        return mem.html;
      },
      extraOn: 'vr',
      info: { vr: 'Variable resistor. Changing its resistance changes the temperature at which the heater switches on.',
        th: 'Thermistor: the colder it gets, the higher its resistance. It is between the gate and the source (the 0 V line), so the MOSFET responds to the voltage across it.' },
    },

    alarm: {
      circuits: { main: switching(C('ldr', 'ldr', 4, 3, up), C('r', 'resistor', 4, 7, { rot: 1, value: 220 }), 'npn', 'loudspeaker') },
      start: { light: 5 },
      notes: (r) => pins('npn').concat(resVol('ldr', 4.85, 3.1, r, true), resVol('r', 4.85, 7.65, r)),
      chain: [
        { label: 'Light level', value: (r) => lightWord(r.env.light), num: (r) => r.env.light },
        { label: 'Resistance of the LDR', value: (r) => fmtR(r.R('ldr')), num: (r) => r.R('ldr') },
        { label: 'Voltage across the resistor', value: (r) => fmtV(r.V('r')), num: (r) => r.V('r'), on: (r) => r.on('tr'),
          meter: { value: (r) => r.V('r'), max: 5, mark: 0.7, markText: 'transistor switches on at 0.7 V' } },
        { label: 'Transistor', value: (r) => onOff(r.on('tr')), on: (r) => r.on('tr') },
        { label: 'Alarm (loudspeaker)', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
      info: { r: 'A fixed resistor. It is between the base and the emitter (the 0 V line), so the transistor responds to the voltage across it.',
        ldr: 'LDR: the brighter the light, the lower its resistance. Here it is at the top of the potential divider.' },
    },

    delay: {
      circuits: { main: switching(C('r', 'resistor', 4, 3, { rot: 1, value: 10000 }), C('cap', 'capacitor', 4, 7, { rot: 1, value: 2200 }), 'npn', 'led', { sw: true }) },
      controls: {
        sw: { kind: 'switch', label: 'switch' },
        cap: { kind: 'empty', label: 'Empty the capacitor' },
        r: { label: 'Resistor', min: 2200, max: 22000 },
      },
      notes: (r) => pins('npn').concat(resVol('cap', 4.85, 7.65, r)),
      chain: [
        { label: 'Switch', value: (r) => (r.closed('sw') ? 'closed' : 'open'), on: (r) => r.closed('sw') },
        { label: 'Voltage across the capacitor', value: (r) => fmtV(r.V('cap')), num: (r) => r.V('cap'), on: (r) => r.on('tr'),
          meter: { value: (r) => r.V('cap'), max: 5, mark: 0.7, markText: 'transistor switches on at 0.7 V' } },
        { label: 'Transistor', value: (r) => onOff(r.on('tr')), on: (r) => r.on('tr') },
        { label: 'LED', value: (r) => onOff(r.on('out')), on: (r) => r.on('out') },
      ],
      arrows: true,
      info: { rled: 'This resistor limits the current through the LED, so the LED is not damaged.',
        r: 'The capacitor charges through this resistor. The bigger the resistance, the more slowly it charges.',
        cap: 'Capacitor: it stores charge. It takes time to charge up, so the voltage across it rises slowly. It is between the base and the emitter.' },
      // A stopwatch from closing the switch to the LED coming on
      extra: (r, mem) => {
        if (!r.closed('sw')) { mem.t0 = null; mem.lit = null; return 'Close the switch and time how long the LED takes to come on.'; }
        if (mem.t0 == null) mem.t0 = performance.now();
        if (r.on('out')) {
          if (mem.lit == null) mem.lit = (performance.now() - mem.t0) / 1000;
          return mem.lit < 0.2 ? 'The LED came on straight away: the capacitor was already charged. Empty it, then try again.'
            : 'The LED came on <strong>' + mem.lit.toFixed(1) + ' s</strong> after the switch was closed.';
        }
        return 'Switch closed ' + ((performance.now() - mem.t0) / 1000).toFixed(1) + ' s ago. Waiting for the LED…';
      },
    },
  };

  // ---------- Player ----------
  const KEY = box.dataset.key || 'walkthroughs';
  let done = new Set();
  try { done = new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch (e) { /* storage blocked */ }
  const saveDone = () => { try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch (e) { /* ignore */ } };

  const sections = [...box.querySelectorAll('.wt[data-wt]')];
  const order = sections.map((s) => s.dataset.wt);
  const cards = [...box.querySelectorAll('a.wt-card')];
  const titleEl = player.querySelector('.wt-title');
  const dotsEl = player.querySelector('.wt-dots');
  const countEl = player.querySelector('.wt-count');
  const backBtn = player.querySelector('.wt-back');
  const nextBtn = player.querySelector('.wt-next');
  const tapInfo = player.querySelector('.wt-tapinfo');
  const picker = box.querySelector('.wt-picker');
  const TAP_MSG = 'Tap any part of the circuit to find out what it does.';

  let walk = null;        // the WALKS entry
  let key = null;
  let section = null;
  let steps = [];
  let index = 0;
  let circuitName = null;
  let live = null;        // the live panel for this step: { el, rows, … }
  let tapped = new Set();
  const mem = {};         // scratch space for a walkthrough's extra() between updates

  function showCards() {
    cards.forEach((a) => {
      const k = a.getAttribute('href').slice(1);
      a.classList.toggle('is-done', done.has(k));
      a.setAttribute('aria-label', a.textContent.replace(/\s+/g, ' ').trim() + (done.has(k) ? ', done' : ''));
    });
  }

  // The reader from the board, plus a few helpers the walkthroughs use
  function wrap(r) {
    const st = walk.circuits[circuitName];
    const comp = (id) => st.comps.find((c) => c.id === id);
    return Object.assign({}, r, {
      has: (id) => !!comp(id),
      type: (id) => comp(id) && comp(id).type,
    });
  }

  function open(k) {
    if (!WALKS[k]) return;
    key = k;
    walk = WALKS[k];
    section = sections.find((s) => s.dataset.wt === k);
    sections.forEach((s) => { s.hidden = s !== section; });
    steps = [...section.querySelectorAll('.wt-step')];
    titleEl.textContent = section.querySelector('.wt-name').textContent;
    section.querySelector('.wt-name').hidden = true;
    dotsEl.innerHTML = steps.map((s, i) =>
      `<li><button type="button" class="wt-dot" data-step="${i}" aria-label="Step ${i + 1}">${i + 1}</button></li>`).join('');
    circuitName = null;
    Object.keys(mem).forEach((m) => delete mem[m]);
    picker.hidden = true;
    player.hidden = false;
    go(0);
    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function close() {
    if (live) { live.el.remove(); live = null; }
    api.annotate(null);
    api.focus([]);
    key = null;
    walk = null;
    player.hidden = true;
    picker.hidden = false;
    showCards();
  }

  function loadCircuit(name) {
    if (name === circuitName) return;
    circuitName = name;
    const w = walk;
    api.load(w.circuits[name], Object.assign({ light: 80, temp: 20 }, w.start), w.notes ? (r) => w.notes(wrap(r)) : null);
  }

  function go(i) {
    index = Math.max(0, Math.min(steps.length - 1, i));
    const step = steps[index];
    steps.forEach((s) => { s.hidden = s !== step; });
    player.classList.toggle('is-wide', step.hasAttribute('data-wide'));
    // The old step's panel goes first, so it never tries to show readings from the new circuit
    if (live) { live.el.remove(); live = null; }
    loadCircuit(step.dataset.circuit || 'main');
    tapped = new Set();
    // On steps with sliders the rest of the circuit stays bright, so pupils can watch the output
    api.focus((step.dataset.focus || step.dataset.taps || '').split(/\s+/).filter(Boolean), !step.dataset.control);
    buildLive(step);
    tapInfo.innerHTML = TAP_MSG;
    dotsEl.querySelectorAll('.wt-dot').forEach((b, j) => {
      if (j === index) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    countEl.textContent = 'Step ' + (index + 1) + ' of ' + steps.length;
    backBtn.disabled = index === 0;
    const last = index === steps.length - 1;
    const nextKey = order[order.indexOf(key) + 1];
    nextBtn.textContent = last ? (nextKey ? 'Next walkthrough' : 'All walkthroughs') : 'Next';
    if (last) { done.add(key); saveDone(); }
    render(api.read());
  }

  // ---------- The live panel: controls, graph, chain ----------
  const ENVCTL = {
    temp: { label: 'Temperature', min: 0, max: 100, show: (v) => v + ' °C', ends: ['0 °C', '100 °C'] },
    light: { label: 'Light level', min: 0, max: 100, show: lightWord, ends: ['Dark', 'Very bright'] },
  };
  // Component sliders move on a log scale and land on two-figure values
  function logValue(spec, t) {
    const R = spec.min * Math.pow(spec.max / spec.min, t / 100);
    const p = 10 ** (Math.floor(Math.log10(R)) - 1);
    return Math.round(R / p) * p;
  }
  const fromR = (spec, R) => Math.round(100 * Math.log(R / spec.min) / Math.log(spec.max / spec.min));

  function buildLive(step) {
    const el = document.createElement('div');
    el.className = 'wt-live';
    live = { el, rows: [], step, locked: false };
    const st = walk.circuits[circuitName];
    const controls = (step.dataset.control || '').split(/\s+/).filter(Boolean);
    if (controls.length) {
      const ctl = document.createElement('div');
      ctl.className = 'wt-controls';
      controls.forEach((c) => {
        const spec = ENVCTL[c] || walk.controls[c];
        if (spec.kind === 'switch') {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tool wt-switch';
          // Kept in step with the board, where the switch can be tapped too
          const sync = (r) => {
            const closed = r.closed(c);
            setText(b, closed ? 'Open the switch' : 'Close the switch');
            b.setAttribute('aria-pressed', String(closed));
          };
          b.addEventListener('click', () => api.setClosed(c, !api.read().closed(c)));
          live.syncSwitch = live.syncSwitch || [];
          live.syncSwitch.push(sync);
          sync(api.read());
          ctl.append(b);
          return;
        }
        if (spec.kind === 'empty') {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tool';
          b.textContent = spec.label;
          b.addEventListener('click', () => { api.emptyCapacitors(); mem.t0 = null; mem.lit = null; });
          ctl.append(b);
          return;
        }
        const label = document.createElement('label');
        label.className = 'wt-slider';
        const env = !!ENVCTL[c];
        const comp = !env && st.comps.find((x) => x.id === c);
        const r0 = api.read();
        const value = env ? r0.env[c] : fromR(spec, comp.value);
        label.innerHTML = `<span class="wt-slider-name">${spec.label}</span>` +
          `<input type="range" min="0" max="100" step="1" value="${value}">` +
          `<output></output>` +
          (spec.ends ? `<span class="wt-slider-ends"><span>${spec.ends[0]}</span><span>${spec.ends[1]}</span></span>` : '');
        const input = label.querySelector('input');
        const out = label.querySelector('output');
        const show = () => {
          out.textContent = env ? spec.show(+input.value) : fmtR(logValue(spec, +input.value));
        };
        input.addEventListener('input', () => {
          show();
          if (env) api.setEnv(c, +input.value);
          else api.setValue(c, logValue(spec, +input.value));
        });
        show();
        ctl.append(label);
      });
      el.append(ctl);
      live.controls = ctl;
      if (step.querySelector('.wt-predict')) {
        const lock = document.createElement('p');
        lock.className = 'wt-lock';
        lock.textContent = 'Answer the question first, then try it.';
        el.append(lock);
        live.lockNote = lock;
      }
    }

    if (step.dataset.graph) {
      const g = document.createElement('div');
      g.className = 'wt-graph';
      el.append(g);
      live.graph = buildGraph(g, step.dataset.graph);
    }

    if (step.hasAttribute('data-chain')) {
      const list = document.createElement('ol');
      list.className = 'wt-chain' + (walk.arrows ? ' is-arrows' : '');
      walk.chain.forEach((row) => {
        if (row.when && row.when !== circuitName) return;
        const li = document.createElement('li');
        li.className = 'wt-link';
        li.innerHTML = '<span class="wt-link-label"><span class="wt-link-name"></span> <span class="wt-trend"></span></span><span class="wt-link-value"></span>' +
          (row.meter ? '<span class="wt-meter"><span class="wt-meter-fill"></span><span class="wt-meter-mark"></span>' +
            '<span class="wt-meter-text"></span></span>' : '');
        list.append(li);
        live.rows.push({ row, li, last: null, shown: {} });
      });
      el.append(list);
    }

    if (step.dataset.taps) {
      const p = document.createElement('p');
      p.className = 'q-feedback wt-taps';
      p.setAttribute('aria-live', 'polite');
      el.append(p);
      live.taps = p;
    }

    if (walk.extra && (!walk.extraOn || controls.includes(walk.extraOn))) {
      const p = document.createElement('p');
      p.className = 'wt-extra';
      p.setAttribute('aria-live', 'polite');
      el.append(p);
      live.extra = p;
    }

    const slot = step.querySelector('[data-live]');
    if (slot) slot.append(el); else step.append(el);
    refreshLock();
    showTaps();
  }

  // Resistance against light level or temperature, with a dot that follows the slider
  function buildGraph(holder, id) {
    const kind = key === 'ldr' ? 'light' : 'temp';
    const W0 = 300, H0 = 190, L = 54, B = 150, T = 14, R = 286;
    const pts = [];
    for (let v = 0; v <= 100; v += 2) pts.push([v, api.read({ [kind]: v }).R(id)]);
    const max = 10000;
    const X = (v) => L + (v / 100) * (R - L);
    const Y = (Rv) => B - (Math.min(Rv, max) / max) * (B - T);
    const path = pts.map(([v, Rv], i) => (i ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(Rv).toFixed(1)).join('');
    holder.innerHTML =
      `<svg viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Graph of resistance against ${kind === 'light' ? 'light level' : 'temperature'}">` +
      `<path class="wt-axis" d="M${L} ${T - 6}V${B}H${R + 6}"/>` +
      `<path class="wt-curve" d="${path}"/>` +
      `<text class="wt-axis-text" x="${L - 8}" y="${T + 6}" text-anchor="end">10 kΩ</text>` +
      `<text class="wt-axis-text" x="${L - 8}" y="${B + 5}" text-anchor="end">0</text>` +
      `<text class="wt-axis-text" x="${L}" y="${B + 22}">${kind === 'light' ? 'dark' : '0 °C'}</text>` +
      `<text class="wt-axis-text" x="${R}" y="${B + 22}" text-anchor="end">${kind === 'light' ? 'bright' : '100 °C'}</text>` +
      `<text class="wt-axis-title" x="${(L + R) / 2}" y="${B + 38}" text-anchor="middle">${kind === 'light' ? 'light level' : 'temperature'}</text>` +
      `<text class="wt-axis-title" transform="translate(16 ${(T + B) / 2}) rotate(-90)" text-anchor="middle">resistance</text>` +
      `<circle class="wt-dot-now" r="8"/></svg>`;
    const dot = holder.querySelector('.wt-dot-now');
    return (r) => {
      const v = r.env[kind];
      dot.setAttribute('cx', X(v).toFixed(1));
      dot.setAttribute('cy', Y(r.R(id)).toFixed(1));
    };
  }

  // Controls stay locked until the step's prediction question is answered (or answers are shown)
  function refreshLock() {
    if (!live || !live.controls) return;
    const q = live.step.querySelector('.wt-predict');
    const locked = !!q && !q.classList.contains('is-solved') && !document.body.classList.contains('show-answers');
    if (locked === live.locked) return;
    live.locked = locked;
    live.controls.querySelectorAll('input, button').forEach((c) => { c.disabled = locked; });
    live.controls.classList.toggle('is-locked', locked);
    if (live.lockNote) live.lockNote.hidden = !locked;
  }

  function showTaps() {
    if (!live || !live.taps) return;
    const want = live.step.dataset.taps.split(/\s+/);
    const found = want.filter((id) => tapped.has(id)).length;
    if (found === want.length) {
      live.taps.className = 'q-feedback wt-taps is-good';
      live.taps.innerHTML = '<strong>Well done!</strong> You have found out what every part does.';
    } else {
      live.taps.className = 'q-feedback wt-taps';
      live.taps.textContent = 'Parts tapped: ' + found + ' of ' + want.length + '.';
    }
  }

  const text = (v, r) => (typeof v === 'function' ? v(r) : v);
  function setText(el, s) { if (el.textContent !== s) el.textContent = s; }

  function render(raw) {
    if (!walk || !live) return;
    const r = wrap(raw);
    live.rows.forEach((x) => {
      const { row, li } = x;
      setText(li.querySelector('.wt-link-name'), text(row.label, r));
      setText(li.querySelector('.wt-link-value'), row.value(r));
      const on = row.on ? row.on(r) : false;
      li.classList.toggle('is-on', on);
      // Rising or falling, from the last change
      if (row.num) {
        const n = row.num(r);
        if (x.last != null && Math.abs(n - x.last) > Math.abs(x.last) * 1e-4 + 1e-9) {
          x.trend = n > x.last ? 'rising' : 'falling';
        }
        x.last = n;
        setText(li.querySelector('.wt-trend'), x.trend ? (x.trend === 'rising' ? 'going up' : 'going down') : '');
        li.dataset.trend = x.trend || '';
      }
      if (row.meter) {
        const m = row.meter;
        const v = m.value(r);
        li.querySelector('.wt-meter-fill').style.width = Math.min(100, (v / m.max) * 100).toFixed(1) + '%';
        const mark = li.querySelector('.wt-meter-mark');
        const mt = li.querySelector('.wt-meter-text');
        const at = m.mark == null ? null : text(m.mark, r);
        mark.hidden = at == null;
        mt.hidden = at == null;
        if (at != null) {
          const pc = (at / m.max) * 100;
          mark.style.left = pc.toFixed(1) + '%';
          mt.style.left = pc.toFixed(1) + '%';
          // Near either end, the label hangs inwards from the mark instead of centring on it
          mt.style.transform = pc < 35 ? 'translateX(-10px)' : pc > 65 ? 'translateX(calc(-100% + 10px))' : 'translateX(-50%)';
          setText(mt, text(m.markText, r));
        }
      }
    });
    if (live.graph) live.graph(r);
    if (live.extra) {
      const html = walk.extra(r, mem);
      if (live.extra.innerHTML !== html) live.extra.innerHTML = html;
    }
    if (live.syncSwitch) live.syncSwitch.forEach((f) => f(r));
  }

  api.onUpdate((r) => render(r));

  // A tap on the board: say what that part does
  boardRoot.addEventListener('cb:tap', (e) => {
    if (!walk) return;
    const id = e.detail.id;
    const st = walk.circuits[circuitName];
    const c = st.comps.find((x) => x.id === id);
    if (!c) return;
    const info = (walk.info && walk.info[id]) || INFO[c.type] || '';
    tapInfo.innerHTML = '<strong>' + api.name(c.type) + '</strong> ' + info;
    tapped.add(id);
    showTaps();
  });

  // ---------- Navigation ----------
  backBtn.addEventListener('click', () => go(index - 1));
  nextBtn.addEventListener('click', () => {
    if (index < steps.length - 1) { go(index + 1); scrollToPlayer(); return; }
    const nextKey = order[order.indexOf(key) + 1];
    location.hash = nextKey || 'walkthroughs';
  });
  dotsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.wt-dot');
    if (b) go(+b.dataset.step);
  });
  // Keep the top of the player in view when moving on, if it has scrolled away
  function scrollToPlayer() {
    const top = player.getBoundingClientRect().top;
    if (top < -10) player.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function route() {
    const k = location.hash.slice(1);
    if (WALKS[k] && sections.some((s) => s.dataset.wt === k)) open(k);
    else if (key) close();
  }
  window.addEventListener('hashchange', route);

  // Answering a question (or Show answers) unlocks the controls
  new MutationObserver(refreshLock).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });

  // Reset (starter.js clears the questions): forget finished walkthroughs and go back to the list
  const resetBtn = document.querySelector('[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      done = new Set();
      saveDone();
      if (key) history.replaceState(null, '', location.pathname + location.search);
      close();
    });
  }

  showCards();
  route();
})();
