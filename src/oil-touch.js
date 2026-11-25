/* OiL! gateway — PHONE TOUCH LAYOUTS (X7, 1119). A FRONT-END LAYER ONLY: it re-flows the page the gateway already
   builds and reads the live game through a read-only hook (attach()). It never calls the engine, never changes a rule,
   and the desktop (keyboard + mouse) page is untouched — nothing here runs unless the touch layout is on.

   ON:   a coarse pointer (a phone / tablet), or ?touch=1 / #touch=1.   OFF: ?touch=0 / #touch=0 (desktop look on a phone).
   PORTRAIT   — the BOARD stacks over YOUR HAND and the actions: board on top, then the hand strip, the TABLE / LOG tabs,
                and a big-button bar. A decision docks as a bottom sheet under the board (the board stays in view).
   LANDSCAPE  — the board on the left, a SIDE PANEL on the right (hand · tabs · buttons); a decision docks in the panel.
   SECRET HAND — the cards in a hand stay FACE DOWN. TAP TO PEEK shows them for a few seconds, then they turn back over.
                FIREBREAK block cards are flagged SECRET when peeked. The strip only ever shows the hand of the seat whose
                call it is (or the one human at the table); in PASS-AND-PLAY it shows nothing between calls, and a PASS
                THE PHONE curtain covers a new seat's call (and its hand) until that player taps in.
   Safe-area insets (the notch, the home bar) pad every edge.                                                          */
(function () {
  'use strict';
  const qs = location.search + '&' + location.hash;
  const force = /[?#&]touch=([01])/.exec(qs);
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const ON = force ? force[1] === '1' : coarse;
  const API = { on: ON, attach() {}, prompt() {}, state: () => ({ on: false }) };
  window.OIL_TOUCH = API;
  if (!ON) return;

  // safe-area insets need viewport-fit=cover (the page meta asks for it; make sure)
  { const m = document.querySelector('meta[name=viewport]'); if (m && !/viewport-fit/.test(m.content)) m.content += ', viewport-fit=cover'; }

  const css = document.createElement('style'); css.id = 'oilTouchCss';
  css.textContent = `
  body.touch{--sal:env(safe-area-inset-left,0px);--sar:env(safe-area-inset-right,0px);--sat:env(safe-area-inset-top,0px);--sab:env(safe-area-inset-bottom,0px);
    touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  body.touch button{min-height:44px}
  body.touch .chip{min-height:40px;display:inline-flex;align-items:center}
  body.touch #boot,body.touch #setup,body.touch #verdict{padding:calc(12px + var(--sat)) calc(12px + var(--sar)) calc(12px + var(--sab)) calc(12px + var(--sal))}
  body.touch #setup .card{padding:14px 14px}
  body.touch #setup .row .lbl{width:auto;flex-basis:100%}
  body.touch #setup .ss[style*="118px"]{margin-left:0!important}
  body.touch .facs{grid-template-columns:repeat(auto-fit,minmax(132px,1fr))}
  body.touch .fac{min-height:64px}

  /* ---- PLAY: one grid; the board, the side panel (aside) and the button bar are its cells ---- */
  body.touch #play{display:none}
  body.touch #play.on{display:grid}
  body.touch #ptop{display:contents}
  body.touch #ctrl .lede{display:none}
  body.touch #ctrl{flex-wrap:wrap;justify-content:center;gap:6px 8px;padding:6px 8px}
  body.touch #ctrl button{padding:8px 14px;font-size:14px;min-width:64px}
  body.touch #ctrl label.ss{font-size:12px}
  body.touch #ctrl select{min-height:36px;font-size:14px}
  body.touch aside{width:auto;flex:none;border-left:none;min-width:0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
  body.touch aside>*{flex-shrink:0}
  body.touch #players,body.touch #pathbar,body.touch #wars{flex:none;overflow:visible}
  /* the WARS ticker gets its own row under the tabs (it was the last thing in the column and could print over the seats) */
  body.touch aside{display:flex;flex-direction:column}
  body.touch #tpHand{order:1} body.touch #tpTabs{order:2} body.touch #wars{order:3} body.touch #pathbar{order:4} body.touch #players{order:5} body.touch #log{order:6}
  body.touch #wars{position:relative!important;margin:2px 8px 6px;padding:5px 8px!important;border:1px solid #3a2c18!important;border-radius:0;box-shadow:inset 3px 0 0 var(--die-supply,#c8321f);
    background:repeating-linear-gradient(90deg,rgba(242,193,78,.035) 0 1px,transparent 1px 6px),#120d08;line-height:1.45;white-space:normal;overflow-wrap:anywhere;z-index:0}
  /* portrait MAP: the board's empty control deck (THE KEY row) is cut off below the stage; ▾ THE KEY brings it back */
  body.touch.tp-por #stage{overflow:hidden}
  body.touch.tp-por.tp-deckcut #cv{height:var(--tp-cv,100%)}
  #tpKey{position:absolute;right:8px;bottom:6px;z-index:8;min-height:30px!important;padding:3px 12px!important;font-size:12px!important;display:none}
  body.touch.tp-por.tp-map #tpKey{display:block}
  body.touch aside .rh{display:none}
  body.touch #log{min-height:0;font-size:12px}
  body.touch #desk{bottom:8px;max-width:92%}
  body.touch #desk .b{font-size:12px}
  body.touch #edd{top:8px;padding:6px 14px;font-size:12px}

  /* portrait: board over hand/actions */
  body.touch.tp-por #play{grid-template-columns:1fr;grid-template-rows:var(--tp-board,44vh) minmax(0,1fr) auto;
    padding:var(--sat) var(--sar) 0 var(--sal)}
  body.touch.tp-por #stage{grid-row:1;grid-column:1;border-bottom:1px solid #3a2c18}
  body.touch.tp-por aside{grid-row:2;grid-column:1}
  body.touch.tp-por #ctrl{grid-row:3;grid-column:1;padding-bottom:calc(6px + var(--sab))}
  /* landscape: board left, side panel right */
  body.touch.tp-lan #play{grid-template-columns:minmax(0,1fr) var(--tp-side,min(42vw,380px));grid-template-rows:minmax(0,1fr) auto;
    padding:var(--sat) 0 0 var(--sal)}
  body.touch.tp-lan #stage{grid-row:1/3;grid-column:1;padding-bottom:var(--sab)}
  body.touch.tp-lan aside{grid-row:1;grid-column:2;border-left:1px solid #3a2c18;padding-right:var(--sar)}
  body.touch.tp-lan #ctrl{grid-row:2;grid-column:2;border-left:1px solid #3a2c18;padding:6px calc(6px + var(--sar)) calc(6px + var(--sab)) 6px;gap:5px 6px}
  body.touch.tp-lan #ctrl button{padding:6px 10px;font-size:12.5px;min-width:0}
  body.touch.tp-lan #ctrl label.ss{display:none}

  /* the tabs: TABLE (path · companies · wars) · LOG — the hand strip sits above them, always */
  #tpTabs{display:flex;gap:6px;padding:6px 8px 4px;flex:none}
  #tpTabs .chip{flex:1;justify-content:center;font-size:13px;padding:6px 8px;min-height:36px;border-radius:3px 3px 0 0!important}
  body.touch aside[data-tab=table] #log{display:none}
  body.touch aside[data-tab=log] #pathbar,body.touch aside[data-tab=log] #players,body.touch aside[data-tab=log] #wars{display:none!important}
  body.touch aside[data-tab=log] #log{flex:1 0 auto;border-top:none;overflow:visible}

  /* THE HAND — face down until you peek */
  #tpHand{flex:none;margin:6px 8px 0;padding:8px 10px;border-radius:2px;background:linear-gradient(180deg,#1f170d,#160f08);border:1px solid #4a3413;min-height:52px;
    box-shadow:inset 0 0 0 2px #160f08,inset 0 0 0 3px rgba(205,160,80,.22)}
  #tpHand .hh{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.1em;color:#8a7550}
  #tpHand .hh b{color:var(--gold-lite);letter-spacing:.04em;font-size:12.5px}
  #tpHand .hh .sp{flex:1}
  #tpHand button.peek{min-height:38px;padding:4px 14px;font-size:13px}
  #tpHand .backs{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}
  #tpHand .back{width:30px;height:42px;border-radius:2px;background:linear-gradient(180deg,transparent 0 72%,#f2c230 72% 84%,transparent 84%),linear-gradient(180deg,#f6eed8,#e2d2a8);
    border:1px solid #2a170a;box-shadow:inset 0 0 0 2px #f6eed8,inset 0 0 0 3px #c3261a,0 2px 0 #050302;display:flex;align-items:center;justify-content:center;color:transparent;font-size:16px;position:relative;overflow:hidden}
  #tpHand .back::after{content:'OiL!';position:absolute;left:0;right:0;top:9px;text-align:center;font:900 10px/1 'Arial Black','Trebuchet MS',sans-serif;color:#c3261a;letter-spacing:-.02em}
  #tpHand .cards{display:flex;flex-direction:column;gap:6px;margin-top:7px;max-height:var(--tp-handmax,34vh);overflow-y:auto}
  #tpHand .cd{border-radius:2px;padding:6px 9px;background:#2a1e10;border-left:4px solid var(--gold);box-shadow:inset 0 0 0 1px rgba(205,160,80,.2);font-size:11.5px;line-height:1.35;color:#cdbf9e}
  #tpHand .cd .n{font-weight:800;font-size:13px;color:var(--gold-lite)}
  #tpHand .cd.secret{border-left-color:#2f9e5b;background:#132016}
  #tpHand .cd .tag{float:right;font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#2f9e5b}
  #tpHand .none{font-size:11.5px;color:#7d6b4a;margin-top:4px}

  /* a DECISION docks under the board (portrait) / in the side panel (landscape) — the board stays in view */
  body.touch #nprompt{position:fixed;z-index:60;background:rgba(8,6,4,.35);align-items:stretch;justify-content:stretch}
  body.touch #nprompt .box{max-width:none;width:100%;max-height:none;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 14px calc(14px + var(--sab))}
  body.touch #nprompt .pt{font-size:17px} body.touch #nprompt .ps{font-size:12.5px}
  body.touch #nprompt .po button{min-height:46px;font-size:14.5px}
  body.touch #nprompt .po.grouped button{min-height:44px;padding:6px 14px;font-size:13.5px}
  body.touch #nprompt .grp{flex-direction:column;align-items:stretch;gap:4px}
  body.touch #nprompt .grp .gl{text-align:left;min-width:0;padding-top:2px}
  body.touch.tp-por #nprompt{left:0;right:0;bottom:0;top:var(--tp-board,44vh)}
  body.touch.tp-lan #nprompt{top:0;bottom:0;right:0;left:auto;width:var(--tp-side,min(42vw,380px))}

  /* PASS THE PHONE (pass-and-play): covers a new seat's call and its hand until they tap in */
  #tpPass{position:fixed;inset:0;z-index:950;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;
    background:radial-gradient(ellipse at center,rgba(242,194,48,.10) 0,transparent 45%),radial-gradient(ellipse at center,#241a0f 0,#0c0a08 70%);padding:calc(24px + var(--sat,0px)) 24px calc(24px + var(--sab,0px))}
  #tpPass.on{display:flex}
  #tpPass .k{font-size:12px;font-weight:800;letter-spacing:.2em;color:#c3261a;background:linear-gradient(180deg,#f6eed8,#e2d2a8);padding:4px 14px;box-shadow:inset 0 -3px 0 #f2c230,0 0 0 2px #2a170a,0 0 0 3px #8a5a22}
  #tpPass .nm{font-family:Georgia,serif;font-size:30px;color:var(--gold-lite)}
  #tpPass .ss{color:#9a8f7c;font-size:13px;max-width:320px;line-height:1.45}
  #tpPass button{font-size:17px;padding:14px 28px;min-height:56px}
  `;
  document.head.appendChild(css);

  let H = null;                 // the gateway's read-only hook: { game(), draw() }
  let peekOwner = null, peekT = 0, passWith = null, lastOwner = null, promptSeat = null;
  const $ = s => document.querySelector(s);
  const PEEK_MS = 6000;
  let keyOpen = false, lastView = '';

  function orient() {
    const por = innerHeight >= innerWidth;
    document.body.classList.add('touch');
    document.body.classList.toggle('tp-por', por); document.body.classList.toggle('tp-lan', !por);
    // portrait: the board takes ~44% of the height, never less than the width ÷ 1.6 allows a readable board
    let bh = Math.round(Math.max(200, Math.min(innerHeight * 0.46, innerWidth / 1.05)));
    // portrait on THE MAP: size the stage to the board itself (the plate is 1.48:1, fit to the width) plus the HUD headroom
    // the canvas draws above it; with THE KEY tucked the canvas runs past the stage so the deck row is clipped away
    const map = !!(H && H.view && H.view() === 'map');
    document.body.classList.toggle('tp-map', por && map);
    document.body.classList.toggle('tp-deckcut', por && map && !keyOpen);
    if (por && map) { const W = innerWidth, plate = W / 1.48, head = 72;
      bh = Math.round(keyOpen ? 2 * head + plate : head + 0.84 * plate);
      document.body.style.setProperty('--tp-cv', Math.round(2 * head + plate) + 'px'); }
    document.body.style.setProperty('--tp-board', bh + 'px');
    const side = Math.round(Math.min(Math.max(300, innerWidth * 0.40), 400));
    document.body.style.setProperty('--tp-side', side + 'px');
    document.body.style.setProperty('--tp-handmax', Math.round((por ? innerHeight - bh : innerHeight) * 0.42) + 'px');
    if (H) requestAnimationFrame(() => H.draw());
  }

  function cardInfo(n) {
    const SX = (window.OIL_SUPREX || {}).CARD || {}, c = SX[n];
    const txt = (window.OIL_CARDTEXT || {})[n] || (c ? (c.block ? c.text : c.text) : '') || '';
    return { name: n, secret: !!(c && c.block), family: c ? c.family : '', text: txt, hold: c && c.block ? c.block.text : '' };
  }
  function humans(g) { return g ? g.players.filter(q => q.isHuman) : []; }
  // whose hand may this screen show? the seat whose call it is; or the only human; never anyone else's
  function owner() {
    const g = H && H.game(); if (!g) return null;
    const hu = humans(g), open = $('#nprompt') && $('#nprompt').classList.contains('on');
    if (open && promptSeat && promptSeat.isHuman && !$('#tpPass').classList.contains('on')) return promptSeat;
    if (hu.length === 1) return hu[0];
    return null;
  }
  function renderHand() {
    const el = $('#tpHand'); if (!el) return;
    const g = H && H.game(); const o = owner();
    if (o !== lastOwner) { peekOwner = null; lastOwner = o; }
    if (peekOwner && performance.now() > peekT) peekOwner = null;
    if (!g) { el.innerHTML = ''; return; }
    const hu = humans(g);
    if (!o) {
      el.innerHTML = `<div class="hh"><span>YOUR HAND</span><span class="sp"></span></div><div class="none">${hu.length > 1
        ? 'PASS-AND-PLAY — every hand stays face down. Yours turns up on your call (tap to peek).' : 'No player seat at this table.'}</div>`;
      return;
    }
    const hand = Array.isArray(o.hand) ? o.hand : [];
    const peek = peekOwner === o;
    const head = `<div class="hh"><span>${hu.length > 1 ? '' : 'YOUR HAND · '}<b>${o.name}</b></span><span>${hand.length} card${hand.length === 1 ? '' : 's'}</span><span class="sp"></span>`
      + (hand.length ? `<button class="sm alt peek" data-tp="peek">${peek ? 'HIDE' : 'TAP TO PEEK'}</button>` : '') + '</div>';
    let body;
    if (!hand.length) body = '<div class="none">No cards in hand.</div>';
    else if (!peek) body = '<div class="backs">' + hand.map(() => '<div class="back">🂠</div>').join('') + '</div>';
    else body = '<div class="cards">' + hand.map(n => { const c = cardInfo(n);
      return `<div class="cd${c.secret ? ' secret' : ''}">${c.secret ? '<span class="tag">SECRET · FIREBREAK</span>' : ''}<div class="n">${n}</div>`
        + (c.secret ? `HELD: ${c.hold || ''}${c.text ? '<br><span style="opacity:.75">or play it: ' + c.text + '</span>' : ''}` : (c.text || '')) + '</div>'; }).join('') + '</div>';
    const sig = (o.name || '') + '|' + hand.join(',') + '|' + peek + '|' + hu.length;
    if (el._sig === sig) return; el._sig = sig;
    el.innerHTML = head + body;
  }
  function build() {
    const aside = document.querySelector('#play aside'); if (!aside || $('#tpHand')) return;
    const hand = document.createElement('div'); hand.id = 'tpHand';
    const tabs = document.createElement('div'); tabs.id = 'tpTabs';
    tabs.innerHTML = '<div class="chip on" data-t="table">TABLE</div><div class="chip" data-t="log">LOG</div>';
    const rh = aside.querySelector('.rh');
    aside.insertBefore(hand, rh ? rh.nextSibling : aside.firstChild); aside.insertBefore(tabs, hand.nextSibling);
    aside.dataset.tab = 'table';
    tabs.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return;
      aside.dataset.tab = t.dataset.t; tabs.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === t)); });
    hand.addEventListener('click', e => { if (!e.target.closest('[data-tp=peek]')) return;
      const o = owner(); if (!o) return;
      if (peekOwner === o) peekOwner = null; else { peekOwner = o; peekT = performance.now() + PEEK_MS; }
      hand._sig = ''; renderHand(); });
    const st = document.getElementById('stage');
    if (st && !$('#tpKey')) { const k = document.createElement('button'); k.id = 'tpKey'; k.className = 'alt sm'; k.textContent = '▾ THE KEY';
      k.addEventListener('click', () => { keyOpen = !keyOpen; k.textContent = keyOpen ? '▴ HIDE THE KEY' : '▾ THE KEY'; orient(); }); st.appendChild(k); }
    const pass = document.createElement('div'); pass.id = 'tpPass';
    pass.innerHTML = '<div class="k">PASS THE PHONE</div><div class="nm"></div><div class="ss">It is their call. Everyone else, look away — their hand is secret.</div><button id="tpPassGo">I\'M HERE — SHOW MY CALL</button>';
    document.body.appendChild(pass);
    pass.querySelector('#tpPassGo').addEventListener('click', () => { pass.classList.remove('on'); passWith = promptSeat; $('#tpHand')._sig = ''; renderHand(); });
  }

  API.state = () => ({ on: true, key: keyOpen, deckCut: document.body.classList.contains('tp-deckcut'), portrait: document.body.classList.contains('tp-por'), owner: (owner() || {}).name || null,
    peek: !!peekOwner, pass: !!($('#tpPass') && $('#tpPass').classList.contains('on')), with: (passWith || {}).name || null });
  API.attach = hook => {
    H = hook; build(); orient();
    addEventListener('resize', orient); addEventListener('orientationchange', () => setTimeout(orient, 120));
    setInterval(() => { renderHand(); const v = H.view ? H.view() : ''; if (v !== lastView) { lastView = v; orient(); } }, 250);     // presentation poll (the hand changes inside the engine; we only read it)
  };
  // presentPrompt calls this as a decision opens for seat p (before the sheet shows)
  API.prompt = p => {
    promptSeat = p; const g = H && H.game();
    if (g && humans(g).length > 1 && p && p.isHuman && passWith !== p) {
      const pass = $('#tpPass'); pass.querySelector('.nm').textContent = p.name;
      const i = g.players.indexOf(p); pass.querySelector('.nm').style.color = (g._colors || [])[i] || '';
      pass.classList.add('on'); peekOwner = null;
    }
    const el = $('#tpHand'); if (el) el._sig = ''; renderHand();
  };
  document.addEventListener('DOMContentLoaded', orient); orient();
})();
