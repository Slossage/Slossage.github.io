// Shared starter engine. Pages opt in with markup only; nothing here is page-specific.
//
//   .q.q-mcq     multiple choice: .option buttons, mark the right one with data-correct.
//                Optional data-feedback on wrong options, and a hidden .q-explain shown
//                once the question is solved (or when the teacher shows answers).
//   .q.q-match   tap-to-match: .match-item and .match-target buttons that pair up by data-key.
//                Give each .match-item a data-label: it appears under the item once matched.
//   .q-feedback  empty element inside each .q where feedback is written (aria-live).
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

    function select(btn) {
      if (selected) selected.classList.remove('is-selected');
      selected = btn;
      if (btn) btn.classList.add('is-selected');
    }

    q.querySelectorAll('.match-item, .match-target').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const isItem = btn.classList.contains('match-item');
        // Tapping the same side again just changes which one is picked
        if (!selected || selected === btn || selected.classList.contains('match-item') === isItem) {
          select(selected === btn ? null : btn);
          return;
        }
        const a = selected;
        select(null);
        if (a.dataset.key === btn.dataset.key) {
          [a, btn].forEach((b) => { b.classList.add('is-matched'); b.disabled = true; });
          const left = [...items].filter((b) => !b.disabled).length;
          if (left === 0) {
            solve(q);
            say(q, 'good', 'All matched!', explain ? explain.innerHTML : '');
          } else {
            say(q, 'good', 'Match!', left + ' to go.');
          }
        } else {
          [a, btn].forEach((b) => {
            b.classList.remove('is-wrong');
            void b.offsetWidth; // restart the nudge animation
            b.classList.add('is-wrong');
            setTimeout(() => b.classList.remove('is-wrong'), 600);
          });
          say(q, 'bad', 'Not a match.', 'Try again.');
        }
      });
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
