/* OiL! — THE STATION (1119). The gateway as a gas station: BIG BOARDS, PYLONS and PUMP READOUTS, in CANDY PLASTIC.
   Joe 1119: "candy plastic is a big sort of art direction for oil ... its UI should be feeling like gas station big
   board/signs and we certainly have enough pricing and numbers to utilize digital gas pump renditions ... the oil the home
   game greaser image ... should fade into each of the covers, the retro the bombed and the explainer for the expansion
   suprexcore with its image and cover."

   RENDER-ONLY. Reads the live game (price, oil, turn, era, E.D.D., each company's value / exposure / pips); never writes it,
   draws no RNG, owns no selectable (every element here is pointer-events:none except the loading card and the attract,
   which only dismiss themselves) — the engine fingerprint and every hit area (tools/ui_rects.mjs) stay as they were.
     · THE PYLON      the price sign over the board: CRUDE $/bbl (red LED), OIL LEFT (amber, with a fuel gauge), TURN (LCD),
                      the era in changeable letters, the E.D.D. lamp. Prices roll like a pump counter when they move.
     · THE PUMPS      each company card's VAL / EXP / PIPS read out in seven-segment windows.
     · THE BEAUTY     each company's 3D beauty shot (3DP games/oil/renders/station1119) faded into its placard, its turn
                      banner (the seat on the clock) and the LOADING card when the market opens.
     · THE ATTRACT    the boot: the greaser forecourt fades into each cover — RETRO, BOMBED, the SuprexCore explainer, the
                      expansion cover — and back (CK boot standard: a press during the attract returns to the title).
   #station=0 turns all of it off (the before). #attract=0 holds the title; #e2e holds it too unless &attract=1. */
(function () {
  'use strict';
  const H = location.hash + location.search;
  const ON = !/station=0/.test(H);
  const E2E = /e2e/.test(H);
  const API = window.OIL_STATION = { on: ON };
  if (!ON) return;
  document.documentElement.classList.add('station');

  // the companies with a 3D beauty shot (assets/station/shots/<CODE>.jpg + <CODE>_s.jpg) — the rest keep the plain card
  const SHOTS = (window.OIL_STATION_SHOTS || ['STOCK', 'MINA']);
  // the setup placards: each company's forecourt behind its name (only the shots that exist: SHOTS is the one list)
  function facShots() { document.querySelectorAll('.fac[data-code]:not([data-shot])').forEach(d => { const sh = API.shot(d.dataset.code, true);
    d.dataset.shot = sh ? '1' : '0'; if (sh) d.style.setProperty('--shot', `url("${new URL(sh, location.href).href}")`); }); }
  API.shot = (code, small) => SHOTS.indexOf(code) >= 0 ? `assets/station/shots/${code}${small ? '_s' : ''}.jpg` : null;
  // the gateway hands over read-only handles (its script is a closure): OIL_STATION.attach({game, view, FAC, colorFor})
  let CTX = { game: () => null, view: () => 'map', FAC: [], colorFor: () => '#e0a32a' };
  API.attach = ctx => { CTX = Object.assign(CTX, ctx); };
  const getGame = () => { try { return CTX.game(); } catch (e) { return null; } };
  const codeOf = name => { const f = (CTX.FAC || []).find(f => f.brand === name); return f ? f.code : null; };
  const facOf = code => (CTX.FAC || []).find(f => f.code === code) || null;

  // ---------------------------------------------------------------- SEVEN SEGMENT (svg)
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  const W = 54, HH = 100, T = 10, G = 14, SK = Math.tan(6 * Math.PI / 180);
  const P = (x, y, ox) => `${(ox + x + (HH - y) * SK).toFixed(1)},${y}`;
  const POLY = {
    a: [[T, 0], [W - T, 0], [W - 1.5 * T, T], [1.5 * T, T]],
    g: [[T, 50], [1.5 * T, 50 - T / 2], [W - 1.5 * T, 50 - T / 2], [W - T, 50], [W - 1.5 * T, 50 + T / 2], [1.5 * T, 50 + T / 2]],
    d: [[1.5 * T, HH - T], [W - 1.5 * T, HH - T], [W - T, HH], [T, HH]],
    f: [[0, T], [T, 1.5 * T], [T, 50 - T / 2], [0, 50 - T / 4]], b: [[W, T], [W, 50 - T / 4], [W - T, 50 - T / 2], [W - T, 1.5 * T]],
    e: [[0, 50 + T / 4], [T, 50 + T / 2], [T, HH - 1.5 * T], [0, HH - T]], c: [[W, 50 + T / 4], [W, HH - T], [W - T, HH - 1.5 * T], [W - T, 50 + T / 2]] };
  /** seven-segment readout: text right-aligned in `cells` digit cells, unlit cells/segments drawn as ghosts */
  function seg(text, cells) {
    text = String(text); const digits = text.replace('.', '').length; cells = Math.max(cells || 0, digits);
    const pad = ' '.repeat(cells - digits) + text; let x = 4, body = '';
    for (const ch of pad) {
      if (ch === '.') { body += `<circle class="on" cx="${x - G * 0.45}" cy="${HH - 6}" r="6.5"/>`; x += 8; continue; }
      const lit = SEG[ch] || '';
      for (const k in POLY) body += `<polygon class="${lit.indexOf(k) >= 0 ? 'on' : 'off'}" points="${POLY[k].map(p => P(p[0], p[1], x)).join(' ')}"/>`;
      x += W + G;
    }
    return `<svg class="sg" viewBox="0 -4 ${x + 10} ${HH + 8}" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">${body}</svg>`;
  }
  API.seg = seg;
  const letters = (s, cls) => `<span class="cl ${cls || ''}">${[...String(s)].map(c => c === ' ' ? '<i class="sp"></i>' : `<i>${c}</i>`).join('')}</span>`;
  API.letters = letters;

  // ---------------------------------------------------------------- THE PYLON
  let py = null, shown = { price: null, oil: null, turn: null, era: null, edd: null }, roll = null;
  function buildPylon() {
    const st = document.getElementById('stage'); if (!st || py) return;
    py = document.createElement('div'); py.id = 'stPylon'; py.setAttribute('aria-hidden', 'true');
    py.innerHTML = `<div class="crown"><img src="assets/logo/oil_logo.png" alt=""></div>
      <div class="face">
        <div class="pr led"><b>CRUDE</b><span class="cur">$</span><span class="v" data-k="price"></span><small>/BBL</small></div>
        <div class="pr amb"><b>OIL LEFT</b><span class="v" data-k="oil"></span><small data-k="oilmax"></small></div>
        <div class="gauge"><i></i><em>E</em><em>F</em></div>
        <div class="pr lcd"><b>TURN</b><span class="v" data-k="turn"></span></div>
        <div class="era" data-k="era"></div>
        <div class="edd">E.D.D.</div>
      </div><div class="legs"><i></i><i></i></div>`;
    place();
  }
  // where the pylon stands: DESKTOP = at the head of the side panel, over the company pumps (the forecourt's road sign, off
  // the board so it never hides a place); TOUCH = a slim strip in the old tape's own footprint, top-left of the board
  function place() {
    if (!py) return; const touch = document.body.classList.contains('touch');
    const host = touch ? document.getElementById('stage') : document.querySelector('#play aside');
    if (!host) return; py.classList.toggle('strip', touch); py.classList.toggle('side', !touch);
    if (py.parentNode !== host) { if (touch) host.appendChild(py); else { const rh = host.querySelector('.rh'); host.insertBefore(py, rh ? rh.nextSibling : host.firstChild); } }
  }
  const set = (k, html) => { const e = py.querySelector(`[data-k="${k}"]`); if (e) e.innerHTML = html; };
  function tick() {
    const g = getGame();
    const playing = g && document.getElementById('play').classList.contains('on');
    let view = 'map'; try { view = CTX.view(); } catch (e) {}
    facShots();
    if (!py) buildPylon(); if (!py) return; place();
    py.classList.toggle('on', !!(playing && g.map && view !== 'chart'));
    if (!playing) return;
    const D = g.dials || {};
    // the pump counter: price rolls toward the new figure a dollar a frame-step, like the wheels on an old pump
    if (shown.price === null) shown.price = g.price;
    if (shown.price !== g.price) { const d = g.price - shown.price; shown.price += Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 4)); py.classList.add('rolling'); clearTimeout(roll); roll = setTimeout(() => py && py.classList.remove('rolling'), 420); }
    const pk = shown.price + '|' + g.oil + '|' + g.turn + '|' + g.era + '|' + (g.done ? 1 : 0);
    if (pk === shown.key) return; shown.key = pk;
    set('price', seg(shown.price, 3)); set('oil', seg(g.oil, 2)); set('oilmax', '/' + (D.OIL_START || 60)); set('turn', seg(g.turn, 3));
    set('era', letters(g.era === 'CHAOTIC' ? 'CHAOTIC' : 'STABLE', g.era === 'CHAOTIC' ? 'red' : ''));
    const gi = py.querySelector('.gauge i'); if (gi) gi.style.width = Math.max(0, Math.min(100, 100 * g.oil / (D.OIL_START || 60))) + '%';
    py.classList.toggle('chaos', g.era === 'CHAOTIC');
    let edd = false; try { edd = document.getElementById('edd').style.display !== 'none' && document.getElementById('edd').style.display !== ''; } catch (e) {}
    py.classList.toggle('eddon', !!(edd || g.eddFired || g.edd));
  }
  API.clearX = () => { if (!py || !py.classList.contains('on') || !py.classList.contains('strip')) return 10; const r = py.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return Math.round(r.right - s.left + 10); };
  API.covers = () => !!(py && py.classList.contains('on'));
  setInterval(tick, 90);

  // ---------------------------------------------------------------- THE PUMPS (company cards)
  function pumps() {
    const g = getGame(); if (!g) return;
    g.players.forEach((p, i) => {
      const d = document.getElementById('pl' + i); if (!d) return;
      const code = codeOf(p.name); if (code && d.dataset.code !== code) { d.dataset.code = code; const sh = API.shot(code, true); if (sh) d.style.setProperty("--shot", `url("${new URL(sh, location.href).href}")`); }
      const nv = d.querySelector('.nv'), ne = d.querySelector('.ne'), np = d.querySelector('.np');
      if (nv) nv.innerHTML = `<span class="w lcd">${seg(Math.max(0, p.holdings(g.price) | 0), 4)}</span>`;
      if (ne) ne.innerHTML = `<span class="w led">${seg(p.exposure, 2)}</span>`;
      if (np) np.innerHTML = `<span class="w amb">${seg(p.pips, 1)}</span>`;
    });
  }
  API.panels = () => { try { pumps(); } catch (e) { console.warn(e); } };   // gateway: end of updatePanels()

  // ---------------------------------------------------------------- THE LOADING CARD (the market opens on YOUR forecourt)
  function loading() {
    const g = getGame(); if (!g) return;
    if (E2E && !/load=1/.test(H)) return;
    const you = g.players.find(p => p._you) || g.players[0]; const code = codeOf(you.name); const f = facOf(code) || {};
    const shot = API.shot(code) || 'assets/station/covers/greaser.jpg';
    let el = document.getElementById('stLoad'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'stLoad';
    el.style.setProperty('--fc', (code && CTX.colorFor(code)) || '#e0a32a');
    el.innerHTML = `<div class="ph" style="background-image:url('${shot}')"></div><div class="vig"></div>
      <div class="board"><div class="now">NOW PUMPING</div><div class="nm">${letters((f.brand || you.name).split(' / ')[0].toUpperCase())}</div>
      <div class="rg">${(f.region || '').toUpperCase()}</div>
      <div class="rd"><div class="pr led"><b>OPENING</b><span class="cur">$</span>${seg(g.price, 3)}<small>/BBL</small></div>
      <div class="pr amb"><b>IN THE GROUND</b>${seg(g.oil, 2)}<small>/${(g.dials || {}).OIL_START || 60}</small></div></div></div>`;
    document.body.appendChild(el);
    const go = () => { el.classList.add('out'); setTimeout(() => el.remove(), 700); };
    el.addEventListener('pointerdown', go); setTimeout(go, 2600);
    requestAnimationFrame(() => el.classList.add('in'));
  }
  API.opened = () => { try { loading(); } catch (e) { console.warn(e); } };   // gateway: end of startGame()

  // ---------------------------------------------------------------- THE ATTRACT (boot): the greaser fades into every cover
  // time-driven (render(t)), so tools/cover_fade_frames.mjs can seek it frame by frame.
  const SEQ = [
    { k: 'greaser', d: 7.0, title: true },
    { k: 'retro', d: 5.5, cap: 'THE RETRO COVER' },
    { k: 'greaser', d: 4.0, title: true },
    { k: 'bombed', d: 5.5, cap: 'THE BOMBED COVER' },
    { k: 'greaser', d: 4.0, title: true },
    { k: 'explainer', d: 7.0 },
    { k: 'expansion', d: 5.5, cap: 'THE EXPANSION · NOW WITH SuprexCore PREMIUM' },
  ];
  const XF = 1.8; const TOTAL = SEQ.reduce((a, s) => a + s.d, 0);
  let at = null, t0 = 0, held = E2E && !/attract=1/.test(H) || /attract=0/.test(H), pauseUntil = 0;
  function buildAttract() {
    const boot = document.getElementById('boot'); if (!boot || at) return;
    at = document.createElement('div'); at.id = 'stAttract'; at.setAttribute('aria-hidden', 'true');
    at.innerHTML = SEQ.map((s, i) => {
      if (s.k === 'greaser') return `<div class="fr gr" data-i="${i}"><div class="img" style="background-image:url('assets/station/covers/greaser.jpg')"></div></div>`;
      if (s.k === 'explainer') return `<div class="fr ex" data-i="${i}"><div class="blur" style="background-image:url('assets/station/covers/modern.jpg')"></div>
        <div class="sx"><img class="badge" src="assets/station/covers/suprexcore_badge.png" alt="">
        <div class="hd">${letters('THE EXPANSION')}</div>
        <ul><li><b>3</b><span>WARS ON THE BOARD<small>THE GULF ON FIRE · RUSSIA / UKRAINE · VENEZUELA TO THE CALIFORNIA LANES</small></span></li>
        <li><b>44</b><span>NEW CARDS<small>SHUFFLED INTO THE THREE DECKS YOU ALREADY DRAW FROM</small></span></li>
        <li><b>📒</b><span>COOKED BOOKS<small>PAY NOW · THE AUDIT COMES DUE WHEN THE PROTOCOL ARMS</small></span></li>
        <li><b>⛨</b><span>FIREBREAKS<small>HELD FACE DOWN · THEY FIRE THEMSELVES</small></span></li>
        <li><b class="grn">4</b><span>THE GREEN ANDERS DIE<small>THE FOURTH DIE · THE FIRM INTERVENES</small></span></li></ul></div></div>`;
      return `<div class="fr cv" data-i="${i}"><div class="blur" style="background-image:url('assets/station/covers/${s.k}.jpg')"></div>
        <div class="lid"><img src="assets/station/covers/${s.k}.jpg" alt=""></div>${s.cap ? `<div class="cap">${letters(s.cap)}</div>` : ''}</div>`;
    }).join('');
    boot.insertBefore(at, boot.firstChild); boot.classList.add('st-boot');
    t0 = performance.now();
    const back = () => { if (boot.classList.contains('on')) { t0 = performance.now(); pauseUntil = t0 + 12000; render(0); } };
    let swallow = false;   // a press during the attract only brings the title back (CK boot standard) — it never also presses FUEL UP
    boot.addEventListener('pointerdown', e => { if (boot.classList.contains('attract')) { swallow = true; e.preventDefault(); e.stopPropagation(); back(); } }, true);
    boot.addEventListener('click', e => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    addEventListener('keydown', e => { if (boot.classList.contains('attract') && boot.classList.contains('on')) { e.preventDefault(); back(); } }, true);
  }
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  function render(t) {
    if (!at) return; t = ((t % TOTAL) + TOTAL) % TOTAL;
    let acc = 0, cur = 0; for (let i = 0; i < SEQ.length; i++) { if (t < acc + SEQ[i].d) { cur = i; break; } acc += SEQ[i].d; }
    const local = t - acc, nxt = (cur + 1) % SEQ.length, f = ease((local - (SEQ[cur].d - XF)) / XF);
    at.querySelectorAll('.fr').forEach(el => {
      const i = +el.dataset.i; let o = 0;
      if (i === cur) o = 1; if (i === nxt) o = f;
      // greaser frames are one image: carry its opacity across every greaser slot
      el.style.opacity = o.toFixed(3); el.style.zIndex = i === nxt ? 2 : 1;
      const life = i === cur ? local / (SEQ[i].d + XF) : i === nxt ? (local - (SEQ[cur].d - XF)) / (SEQ[i].d + XF) : 0;
      const k = 1 + 0.07 * Math.max(0, Math.min(1, life));
      const im = el.querySelector('.img,.lid,.sx'); if (im) im.style.transform = `scale(${k.toFixed(4)})`;
    });
    const titleW = SEQ[cur].title ? 1 - f * (SEQ[nxt].title ? 0 : 1) : f * (SEQ[nxt].title ? 1 : 0);
    const boot = document.getElementById('boot'); boot.style.setProperty('--title', titleW.toFixed(3)); boot.classList.toggle('attract', titleW < 0.5);
  }
  API.attract = { seek: s => { held = true; buildAttract(); render(s); }, total: TOTAL, seq: SEQ.map(s => s.k), xfade: XF };
  function loop(now) {
    if (at && !held && document.getElementById('boot').classList.contains('on') && now > pauseUntil) render((now - t0) / 1000);
    requestAnimationFrame(loop);
  }
  const init = () => { buildAttract(); render(0); requestAnimationFrame(loop); buildPylon(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
