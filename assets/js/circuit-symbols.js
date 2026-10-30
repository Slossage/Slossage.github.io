// Circuit symbol library (UK / SQA style). Adds the symbols to the page once, so any SVG can
// draw a component with <use href="#sym-lamp" x=".." y=".." width="60" height="40"/>.
// Every symbol is 60 × 40 with its terminals at (0, 20) and (60, 20): place a symbol so those
// points sit on the ends of the wires. To draw one upright, add transform="rotate(90 cx cy)"
// about its centre. Don't rotate the lettered meters or the motor, or the letter turns too.
(function () {
  'use strict';

  const line = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"';
  const plate = 'fill="none" stroke="currentColor" stroke-width="5"';
  const dot = (x) => `<circle cx="${x}" cy="20" r="2.6" fill="currentColor"/>`;
  const letter = (ch) =>
    `<path d="M0 20H18M42 20H60" ${line}/><circle cx="30" cy="20" r="12" ${line}/>` +
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
    motor: letter('M'),
    ammeter: letter('A'),
    voltmeter: letter('V'),
  };

  const defs = Object.entries(symbols)
    .map(([id, body]) => `<symbol id="sym-${id}" viewBox="0 0 60 40">${body}</symbol>`)
    .join('');

  document.body.insertAdjacentHTML(
    'afterbegin',
    `<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${defs}</svg>`
  );
})();
