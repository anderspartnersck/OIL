/* OiL! gateway — the PAUSE MENU + keys (UI-AUDIT 1110; house law: resume / how to play / settings / quit to title).
   Front-end only: it drives the page through the buttons gateway.html already wires (#runBtn #spd #viewBtn #quitBtn #bootGo
   #startGo #vAgain) and the rulebook (OIL_RULEBOOK). The engine is not touched. Off with #nomenu in the URL.
   Keys: ENTER = the screen's big button (FUEL UP / OPEN THE MARKET / PLAY AGAIN) · ESC or P in play = pause ·
   SPACE in play = RUN / PAUSE the table · ? = the rulebook. */
(function () {
  'use strict';
  if (location.hash.indexOf('nomenu') >= 0) return;
  const $ = s => document.querySelector(s);
  const on = id => { const s = document.getElementById(id); return s && s.classList.contains('on'); };
  const rbOpen = () => { const r = document.getElementById('rulebook'); return r && r.classList.contains('on'); };
  const running = () => /PAUSE/.test(($('#runBtn') || {}).textContent || '');
  const promptOpen = () => { const p = $('#nprompt'); return p && p.classList.contains('on'); };

  const css = document.createElement('style');
  css.textContent = `
  #pmenu{position:fixed;inset:0;z-index:900;display:none;align-items:center;justify-content:center;background:rgba(8,6,4,.78)}
  #pmenu.on{display:flex}
  #pmenu .box{background:linear-gradient(180deg,#241a0f,#15110c);border:1px solid #4a3413;border-radius:14px;padding:20px 26px;width:min(420px,calc(100% - 32px));
    max-height:86vh;overflow:auto;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.6)}
  #pmenu h2{margin:0 0 4px;font-family:Georgia,serif;color:var(--gold-lite);letter-spacing:.14em;font-size:22px}
  #pmenu .ss{color:#9a8f7c;font-size:12px;margin:0 0 12px;letter-spacing:.06em}
  #pmenu .col{display:flex;flex-direction:column;gap:10px;margin-top:8px}
  #pmenu .col button.sel{outline:2px solid var(--cream);outline-offset:2px}
  #pmenu label{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#1a140d;border:1px solid #4a3413;border-radius:10px;padding:8px 12px;font-size:14px;text-align:left}
  #pmenu select{font:inherit;background:#0c0a08;color:var(--cream);border:1px solid #4a3413;border-radius:6px;padding:4px 6px}
`;
  document.head.appendChild(css);

  const m = document.createElement('div'); m.id = 'pmenu'; m.innerHTML = '<div class="box"></div>'; document.body.appendChild(m);
  const box = m.querySelector('.box');
  let wasRunning = false, page = null;
  const FROM_KEEP = new URLSearchParams(location.search).get('from') === 'keep';   // Q259

  function render(html, wire) { box.innerHTML = html; wire(); const b = box.querySelector('.col button'); if (b) b.focus(); }
  function main() {
    page = 'main';
    render(`<h2>PAUSED</h2><div class="ss">THE MARKET HOLDS ITS BREATH</div><div class="col">
      <button data-a="resume">RESUME ▸</button>
      <button class="alt" data-a="rules">📖 HOW TO PLAY</button>
      <button class="alt" data-a="set">SETTINGS</button>
      <button class="alt" data-a="new">NEW GAME (setup)</button>
      <button class="alt" data-a="title">QUIT TO TITLE</button>${FROM_KEEP ? '<button class="alt" data-a="keep">QUIT TO ARCADE</button>' : ''}</div>`, () => {
      const kb = box.querySelector('[data-a=keep]'); if (kb) kb.onclick = () => confirmThen('QUIT TO ARCADE?', 'This table is dropped; back to COLEMAN\'S KEEP.', () => { location.href = "../../COLEMAN'S KEEP.html"; });
      box.querySelector('[data-a=resume]').onclick = resume;
      box.querySelector('[data-a=rules]').onclick = () => { window.OIL_RULEBOOK && OIL_RULEBOOK.open(); };
      box.querySelector('[data-a=set]').onclick = settings;
      box.querySelector('[data-a=new]').onclick = () => confirmThen('NEW GAME?', 'This table is dropped and you go back to the setup.', () => { close(); rawNew(); });
      box.querySelector('[data-a=title]').onclick = () => confirmThen('QUIT TO TITLE?', 'This table is dropped.', () => {
        close(); rawNew(); document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'boot')); });
    });
  }
  function confirmThen(t, sub, yes) {
    page = 'confirm';
    render(`<h2>${t}</h2><div class="ss">${sub}</div><div class="col"><button class="alt" data-a="no">NO, BACK</button><button data-a="yes">YES</button></div>`, () => {
      box.querySelector('[data-a=no]').onclick = main; box.querySelector('[data-a=yes]').onclick = yes; });
  }
  function settings() {
    page = 'settings';
    const spd = $('#spd'), view = /MAP/.test($('#viewBtn').textContent) ? 'map' : 'tape';
    render(`<h2>SETTINGS</h2><div class="ss">no sound in this build yet</div><div class="col">
      <label>Table speed <select id="pmSpd">${[...spd.options].map(o => `<option value="${o.value}"${o.selected ? ' selected' : ''}>${o.text}</option>`).join('')}</select></label>
      <label>Board view <select id="pmView"><option value="map"${view === 'map' ? ' selected' : ''}>◍ MAP</option><option value="tape"${view === 'tape' ? ' selected' : ''}>▤ TAPE (price chart)</option></select></label>
      <button data-a="back">BACK</button></div>`, () => {
      $('#pmSpd').onchange = () => { spd.value = $('#pmSpd').value; };
      $('#pmView').onchange = () => { const now = /MAP/.test($('#viewBtn').textContent) ? 'map' : 'tape'; if (now !== $('#pmView').value) $('#viewBtn').click(); };
      box.querySelector('[data-a=back]').onclick = main;
    });
  }
  function open() { if (m.classList.contains('on')) return; wasRunning = running(); if (wasRunning) $('#runBtn').click(); m.classList.add('on'); main(); }
  function close() { m.classList.remove('on'); page = null; }
  function resume() { close(); if (wasRunning && !running()) $('#runBtn').click(); }

  // the table's NEW button becomes ☰ MENU (it used to drop the game on one click; NEW GAME is inside, with a confirm)
  const q = $('#quitBtn'), rawNew = (q && q.onclick) || (() => {});
  if (q) { q.onclick = null; q.addEventListener('click', open); q.textContent = '☰ MENU'; q.title = 'ESC · menu  —  SPACE · run/pause  —  ? · rules'; }

  document.addEventListener('keydown', e => {
    if (rbOpen()) return;                                   // the rulebook owns Esc while it is open
    const k = e.key, inField = /INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '');
    if (m.classList.contains('on')) {
      if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); page === 'main' ? resume() : main(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp') {
        const bs = [...box.querySelectorAll('.col button')], i = bs.indexOf(document.activeElement);
        bs[(i + (k === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); e.preventDefault();
      }
      return;
    }
    if (inField) return;
    if (k === '?') { window.OIL_RULEBOOK && OIL_RULEBOOK.open(); return; }
    if (on('play')) {
      if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); open(); }
      else if (k === ' ' && !promptOpen()) { e.preventDefault(); $('#runBtn').click(); }
      return;
    }
    if (k === 'Enter') {
      const b = on('boot') ? $('#bootGo') : on('setup') ? $('#startGo') : on('verdict') ? $('#vAgain') : null;
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (k === 'Escape' && (on('setup') || on('verdict'))) {
      document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'boot'));
    }
  });
  window.OIL_MENU = { open, close, resume };
})();
