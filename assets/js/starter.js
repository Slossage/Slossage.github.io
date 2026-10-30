// Shared starter engine. Pages opt in with markup only; nothing here is page-specific.
//
//   .q.q-mcq     multiple choice: .option buttons, mark the right one with data-correct.
//                Optional data-feedback on wrong options, and a hidden .q-explain shown
//                once the question is solved (or when the teacher shows answers).
//   .q.q-match   tap-to-match: .match-item buttons (in .match-items) and .match-target buttons
//                (in .match-targets) that pair up by data-key. Pupils drag an item onto its
//                target, or tap one then the other. A matched item moves into a slot above its
//                target. Give each .match-item a data-label for Show answers.
//   .q-feedback  empty element inside each .q where feedback is written (aria-live).
//   .hint        optional <details class="hint"><summary>Hint</summary><p>…</p></details> inside a .q.
//                Needs no script; Reset closes it again.
//   [data-show-answers]  button that toggles answers for the whole page (teacher control).
//   [data-reset]         button that clears every answer on the page.
//   [data-timer]         countdown: a <select> of minutes, .timer-display, [data-timer-toggle].
(function () {
  'use strict';

  const originals = new Map();

  function say(q, kind, title, html) {
    const box = q.querySelector('.q-feedback');
    if (!box) return;
    box.className = 'q-feedback is-' + kind;
    box.innerHTML = '<strong>' + title + '</strong> ' + (html || '');
  }

  function solve(q) {
    q.classList.add('is-solved');
    q.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  }

  function initMcq(q) {
    const explain = q.querySelector('.q-explain');
    q.querySelectorAll('.option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (btn.hasAttribute('data-correct')) {
          btn.classList.add('is-correct');
          solve(q);
          say(q, 'good', 'Correct!', explain ? explain.innerHTML : '');
        } else {
          btn.classList.add('is-wrong');
          btn.disabled = true;
          say(q, 'bad', 'Not quite.', btn.dataset.feedback || 'Have another go.');
        }
      });
    });
  }

  function initMatch(q) {
    let selected = null;
    const explain = q.querySelector('.q-explain');
    const items = q.querySelectorAll('.match-item');
    const pool = q.querySelector('.match-items');

    // Give every target an empty slot above it; a correctly matched item moves into that slot
    q.querySelectorAll('.match-target').forEach((target) => {
      const col = document.createElement('div');
      const slot = document.createElement('div');
      col.className = 'match-col';
      slot.className = 'match-slot';
      target.before(col);
      col.append(slot, target);
    });

    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Run a DOM change, then glide the item from where it was to where it ends up
    function glide(item, change) {
      const from = item.getBoundingClientRect();
      item.style.transform = '';
      change();
      if (reduceMotion()) return;
      const to = item.getBoundingClientRect();
      item.animate(
        [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }],
        { duration: 350, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
    }

    function select(btn) {
      if (selected) selected.classList.remove('is-selected');
      selected = btn;
      if (btn) btn.classList.add('is-selected');
    }

    function nudge(b) {
      b.classList.remove('is-wrong');
      void b.offsetWidth; // restart the nudge animation
      b.classList.add('is-wrong');
      setTimeout(() => b.classList.remove('is-wrong'), 600);
    }

    // Shared by tapping and dragging: true if the item belongs with the target
    function tryMatch(item, target) {
      if (item.dataset.key !== target.dataset.key) {
        say(q, 'bad', 'Not a match.', 'Try again.');
        return false;
      }
      [item, target].forEach((b) => { b.classList.add('is-matched'); b.disabled = true; });
      glide(item, () => {
        target.previousElementSibling.append(item);
        if (pool && !pool.querySelector('.match-item')) pool.hidden = true;
      });
      const left = [...items].filter((b) => !b.disabled).length;
      if (left === 0) {
        solve(q);
        say(q, 'good', 'All matched!', explain ? explain.innerHTML : '');
      } else {
        say(q, 'good', 'Match!', left + ' to go.');
      }
      return true;
    }

    // Tap one, then tap its partner
    let dragged = false;
    q.querySelectorAll('.match-item, .match-target').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (dragged) { dragged = false; return; } // the click that ends a drag
        if (btn.disabled) return;
        const isItem = btn.classList.contains('match-item');
        // Tapping the same side again just changes which one is picked
        if (!selected || selected === btn || selected.classList.contains('match-item') === isItem) {
          select(selected === btn ? null : btn);
          return;
        }
        const a = selected;
        select(null);
        const [item, target] = isItem ? [btn, a] : [a, btn];
        if (!tryMatch(item, target)) [item, target].forEach(nudge);
      });
    });

    // Or drag an item onto its name. A press only becomes a drag once the finger moves,
    // so a plain tap still works as above.
    items.forEach((item) => {
      let start = null;
      let over = null;

      // The column under the finger, looking past the dragged item itself
      const colAt = (x, y) => {
        const el = document.elementsFromPoint(x, y).find((n) => !item.contains(n));
        const col = el && el.closest('.match-col');
        return col && q.contains(col) && !col.querySelector('.match-target').disabled ? col : null;
      };
      const setOver = (col) => {
        if (over) over.classList.remove('is-over');
        over = col;
        if (col) col.classList.add('is-over');
      };

      item.addEventListener('pointerdown', (e) => {
        if (item.disabled || e.button > 0) return;
        start = { x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
        // Keep receiving this pointer's moves even after it leaves the item
        item.setPointerCapture(e.pointerId);
      });

      item.addEventListener('pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!start.moving) {
          if (Math.hypot(dx, dy) < 8) return;
          start.moving = true;
          select(null);
          item.classList.add('is-dragging');
        }
        item.style.transform = `translate(${dx}px, ${dy}px)`;
        setOver(colAt(e.clientX, e.clientY));
      });

      const end = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const wasMoving = start.moving;
        start = null;
        if (!wasMoving) return;
        dragged = true;
        setTimeout(() => { dragged = false; }, 0);
        item.classList.remove('is-dragging');
        const col = e.type === 'pointerup' ? over : null;
        setOver(null);
        const target = col && col.querySelector('.match-target');
        if (target && tryMatch(item, target)) return;
        // Not dropped on its name: slide back to where it came from
        glide(item, () => {});
        if (target) nudge(target);
      };
      item.addEventListener('pointerup', end);
      item.addEventListener('pointercancel', end);
    });
  }

  function init(q) {
    if (q.classList.contains('q-mcq')) initMcq(q);
    if (q.classList.contains('q-match')) initMatch(q);
  }

  function initTimer(el) {
    const select = el.querySelector('select');
    const display = el.querySelector('.timer-display');
    const toggle = el.querySelector('[data-timer-toggle]');
    let remaining = 0;
    let endAt = 0;
    let tick = null;

    const show = (ms) => {
      const s = Math.ceil(ms / 1000);
      display.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    const stop = () => { clearInterval(tick); tick = null; toggle.textContent = 'Start'; };
    const reset = () => {
      stop();
      remaining = Number(select.value) * 60000;
      el.classList.remove('is-done');
      show(remaining);
    };

    toggle.addEventListener('click', () => {
      if (tick) {
        remaining = endAt - Date.now();
        stop();
        return;
      }
      if (remaining <= 0) reset();
      endAt = Date.now() + remaining;
      toggle.textContent = 'Pause';
      tick = setInterval(() => {
        const left = endAt - Date.now();
        if (left <= 0) {
          stop();
          remaining = 0;
          display.textContent = "Time's up!";
          el.classList.add('is-done');
        } else {
          show(left);
        }
      }, 250);
    });
    select.addEventListener('change', reset);
    reset();
  }

  document.querySelectorAll('.q').forEach((q) => {
    originals.set(q, q.innerHTML);
    init(q);
  });

  document.querySelectorAll('[data-timer]').forEach(initTimer);

  const answersBtn = document.querySelector('[data-show-answers]');
  if (answersBtn) {
    answersBtn.addEventListener('click', () => {
      const on = document.body.classList.toggle('show-answers');
      answersBtn.setAttribute('aria-pressed', String(on));
      answersBtn.textContent = on ? 'Hide answers' : 'Show answers';
    });
  }

  const resetBtn = document.querySelector('[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      originals.forEach((html, q) => {
        q.innerHTML = html;
        q.classList.remove('is-solved');
        init(q);
      });
      document.body.classList.remove('show-answers');
      if (answersBtn) {
        answersBtn.setAttribute('aria-pressed', 'false');
        answersBtn.textContent = 'Show answers';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
