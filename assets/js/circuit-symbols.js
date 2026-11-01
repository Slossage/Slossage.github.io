// Circuit symbol library (UK / SQA style). Adds the symbols to the page once, so any SVG can
// draw a component with <use href="#sym-lamp" x=".." y=".." width="60" height="40"/>.
// Most symbols are 60 × 40 with their terminals at (0, 20) and (60, 20) (the transistors and the
// relay are bigger: see `sizes` below). Place a symbol so those
// points sit on the ends of the wires. To draw one upright, add transform="rotate(90 cx cy)"
// about its centre. Don't rotate the lettered meters or the motor, or the letter turns too.
(function () {
  'use strict';

  const line = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"';
  const plate = 'fill="none" stroke="currentColor" stroke-width="5"';
  const dot = (x) => `<circle cx="${x}" cy="20" r="2.6" fill="currentColor"/>`;
  const ring = `<path d="M0 20H18M42 20H60" ${line}/><circle cx="30" cy="20" r="12" ${line}/>`;
  const letter = (ch) =>
    ring +
    `<text x="30" y="25.5" text-anchor="middle" font-size="16" font-weight="700" ` +
    `font-family="-apple-system, Segoe UI, Roboto, Arial, sans-serif" fill="currentColor">${ch}</text>`;

  const symbols = {
    // Long thin plate is positive, short thick plate is negative
    cell: `<path d="M0 20H26M34 20H60M26 6V34" ${line}/><path d="M34 13V27" ${plate}/>`,
    battery:
      `<path d="M0 20H14M20 20H40M46 20H60M14 6V34M40 6V34" ${line}/>` +
      `<path d="M20 13V27M46 13V27" ${plate}/>`,
    lamp:
      `<path d="M0 20H18M42 20H60" ${line}/><circle cx="30" cy="20" r="12" ${line}/>` +
      `<path d="M21.5 11.5L38.5 28.5M38.5 11.5L21.5 28.5" ${line}/>`,
    'switch-open': `<path d="M0 20H16M44 20H60M16 20L42 6" ${line}/>${dot(16)}${dot(44)}`,
    'switch-closed': `<path d="M0 20H60" ${line}/>${dot(16)}${dot(44)}`,
    resistor: `<path d="M0 20H16M44 20H60" ${line}/><rect x="16" y="13" width="28" height="14" ${line}/>`,
    // Current flows left to right (the way the triangle points); arrows show light coming out
    led:
      `<path d="M0 20H24M35 20H60M35 12V28" ${line}/><circle cx="30" cy="20" r="13" ${line}/>` +
      `<path d="M24 12V28L35 20Z" fill="currentColor"/>` +
      `<path d="M35 6.5L40 1.5M37 1.5H40V4.5M41 10L46 5M43 5H46V8" fill="none" stroke="currentColor" ` +
      `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Circle with leads but no letter, for pages that draw the letter separately (so it stays upright)
    ring,
    motor: letter('M'),
    ammeter: letter('A'),
    voltmeter: letter('V'),
    'variable-resistor':
      `<path d="M0 20H16M44 20H60M12 34L46 7.5" ${line}/><rect x="16" y="13" width="28" height="14" ${line}/>` +
      `<path d="M48 6L44.6 13.1L40.3 7.5Z" fill="currentColor"/>`,
    // Resistor in a circle, with light arrows coming in
    ldr:
      `<path d="M0 20H19M41 20H60" ${line}/><rect x="19" y="15" width="22" height="10" ${line}/>` +
      `<circle cx="30" cy="20" r="14" ${line}/>` +
      `<path d="M3 1L9.5 6.7M10 0L16.5 5.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` +
      `<path d="M11 8L6.4 7.3L9.6 3.5ZM18 7L13.4 6.3L16.6 2.5Z" fill="currentColor"/>`,
    // Resistor with a line through it that has a short flat foot
    thermistor: `<path d="M0 20H16M44 20H60M6 34H13L47 6" ${line}/><rect x="16" y="13" width="28" height="14" ${line}/>`,
    diode: `<path d="M0 20H22M38 20H60M38 9V31" ${line}/><path d="M22 9V31L38 20Z" fill="currentColor"/>`,
    ohmmeter: letter('Ω'),
    // Rectangle with the fuse wire running through it; when blown the wire has a gap
    fuse: `<path d="M0 20H60" ${line}/><rect x="16" y="13" width="28" height="14" ${line}/>`,
    'fuse-blown':
      `<path d="M0 20H26M34 20H60" ${line}/><rect x="16" y="13" width="28" height="14" ${line}/>`,
    capacitor: `<path d="M0 20H25M35 20H60M25 7V33M35 7V33" ${line}/>`,
    // Cell inside a circle with light arrows coming in. Long plate is positive, as for the cell
    'solar-cell':
      `<path d="M0 20H26M34 20H60M26 9V31" ${line}/><path d="M34 14V26" ${plate}/>` +
      `<circle cx="30" cy="20" r="15" ${line}/>` +
      `<path d="M2 1L9 7.2M10 0L17 6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` +
      `<path d="M11.4 8.5L6.8 7.8L10 4ZM19.4 7.5L14.8 6.8L18 3Z" fill="currentColor"/>`,
    // Drawn facing up: the coil box sits on the wire and the cone opens upwards
    loudspeaker:
      `<path d="M0 20H22M38 20H60" ${line}/><rect x="22" y="14" width="16" height="12" ${line}/>` +
      `<path d="M22 14L14 2H46L38 14" ${line} stroke-linejoin="round"/>`,
    microphone: `<path d="M0 20H19M41 20H60M19 7V33" ${line}/><circle cx="30" cy="20" r="11" ${line}/>`,
    // Logic gates (American shapes, as SQA uses). Inputs at (0, 12) and (0, 28), output at (60, 20);
    // the NOT gate has its single input at (0, 20).
    'gate-and': `<path d="M0 12H14M0 28H14M44 20H60M14 6H30A14 14 0 0 1 30 34H14Z" ${line} stroke-linejoin="round"/>`,
    'gate-or':
      `<path d="M0 12H15M0 28H15M46 20H60" ${line}/>` +
      `<path d="M11 6Q20 20 11 34Q34 34 46 20Q34 6 11 6Z" ${line} stroke-linejoin="round"/>`,
    'gate-not': `<path d="M0 20H14M49 20H60M14 6L40 20L14 34Z" ${line} stroke-linejoin="round"/><circle cx="44.5" cy="20" r="4.5" ${line}/>`,
  };

  // Symbols that are not 60 × 40.
  // The transistors are 60 × 60. transistor-npn: base (0, 30), collector (40, 0), emitter (40, 60).
  // npn is the same symbol with its leads one grid step from the base, for the circuit builder:
  // base (0, 30), collector (30, 0), emitter (30, 60).
  // MOSFET (n-channel enhancement): gate (0, 30), drain (30, 0), source (30, 60).
  // The relay is drawn in "0 -15 60 90": switch contacts at (0, 0) and (60, 0), coil at (0, 60) and (60, 60).
  const sizes = {
    'transistor-npn': '0 0 60 60',
    npn: '0 0 60 60',
    mosfet: '0 0 60 60',
    'relay-open': '0 -15 60 90',
    'relay-closed': '0 -15 60 90',
  };
  symbols['transistor-npn'] =
    `<circle cx="32" cy="30" r="18" ${line}/>` +
    `<path d="M0 30H24M24 24L40 14V0M24 36L40 46V60" ${line} stroke-linejoin="round"/>` +
    `<path d="M24 18V42" ${plate}/>` +
    `<path d="M37 44L29.8 43.7L33.5 37.8Z" fill="currentColor"/>`;
  symbols.npn =
    `<circle cx="22" cy="30" r="19" ${line}/>` +
    `<path d="M0 30H15M15 24L30 14V0M15 36L30 46V60" ${line} stroke-linejoin="round"/>` +
    `<path d="M15 18V42" ${plate}/>` +
    `<path d="M28 44.7L21.1 44.3L24.9 38.5Z" fill="currentColor"/>`;
  // Gate plate, a broken (three-part) channel, and the arrow pointing in on the middle part
  symbols.mosfet =
    `<circle cx="22" cy="30" r="19" ${line}/>` +
    `<path d="M0 30H13M13 17V43M20 18H30V0M20 42H30V60M20 30H30V42" ${line} stroke-linejoin="round"/>` +
    `<path d="M20 14V22M20 26V34M20 38V46" fill="none" stroke="currentColor" stroke-width="3.5"/>` +
    `<path d="M21.5 30L28 26.5V33.5Z" fill="currentColor"/>`;
  const relay = (blade) =>
    `<path d="M0 0H16M44 0H60M0 60H18M42 60H60${blade}" ${line}/>` +
    `<circle cx="16" cy="0" r="2.6" fill="currentColor"/><circle cx="44" cy="0" r="2.6" fill="currentColor"/>` +
    `<rect x="18" y="51" width="24" height="18" ${line}/>` +
    `<path d="M30 6V51" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>`;
  symbols['relay-open'] = relay('M16 0L42 -12');
  symbols['relay-closed'] = relay('M16 0H44');

  const defs = Object.entries(symbols)
    .map(([id, body]) => `<symbol id="sym-${id}" viewBox="${sizes[id] || '0 0 60 40'}">${body}</symbol>`)
    .join('');

  document.body.insertAdjacentHTML(
    'afterbegin',
    `<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${defs}</svg>`
  );
})();
