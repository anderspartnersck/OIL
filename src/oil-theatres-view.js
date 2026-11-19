/* OiL! SUPREXCORE PREMIUM — THE THEATRES, drawn (1118). RENDER-ONLY: reads the game, never writes it.
   Joe 1118: "put the middle east on fire and war in russia/ukraine and also an active conflict in venezuela all the way up to
   the california shipping lanes with governmental seizing and piracy ... time to fill out the rest of this game in detail and
   3d modeling."

   The three standing theatres of the engine (docs/SUPREXCORE-1118.md, g.theatreState()), each 0..3, drawn on the ◉ WORLD
   view (animated) and on the Equal Earth BOARD (still, UNDER the dotted lanes so the lanes always read):
     gulf_fire          wells burning across Kuwait, Iraq, the Saudi fields: the Christmas tree, the oil lake, a small hard
                        fire and a BLACK column leaning south-east on the shamal. At PEAK the soot closes over the Gulf.
                        Herzog's Lessons in Darkness, Kuwait 1991: grim, slow, no flash, the captions small and quiet.
     ukraine_war        the front from Kharkiv to Kherson as a scorched seam with smoke rising along it; Druzhba cut and
                        burning in Volhynia (PEAK, or the engine's theatre_peak); the shadow fleet running dark out of
                        Novorossiysk through the Black Sea and out of Primorsk through the Baltic.
     venezuela_pacific  the contested corridor: the Venezuelan coast, Colón, the Canal, up the Pacific coast to the California
                        lanes. Cutters alongside tankers they have taken (the hull goes impound grey, the flag turns to the
                        seizing state's colour), pirate skiffs circling a merchant.
   Engine seizures / piracy / fires (any theatre) are drawn where the engine says, on top of the theatre's own flavour.
   Pieces: 3D PIPELINE games/oil/blender/theatres.py → tools/ee/pack_theatres.py → assets/world/theatres_*.webp + theatres.js.

   Flags:  ?theatre=gulf_fire:3,ukraine_war:2,venezuela_pacific:3 (or #theatre=…)  preview without the engine state
           &theatres=0                                                             off: the 1117 look exactly
   With neither the engine's SuprexCore nor the preview flag there is nothing to draw: core games are unchanged. */
(function () {
  'use strict';
  const IMG = {};
  const load = (k, src) => { if (typeof Image === 'undefined') return; const i = new Image(); i.onload = () => { IMG[k] = i; tint = {}; }; i.src = src; };
  load('atlas', 'assets/world/theatres_flat.webp'); load('mask', 'assets/world/theatres_mask.webp');
  const SP = () => window.OIL_THEATRE_SPRITES, PC = () => window.OIL_PIECES, GEO = () => window.OIL_GEO;
  let tint = {};
  const IDS = ['gulf_fire', 'ukraine_war', 'venezuela_pacific'];
  const q = () => (typeof location !== 'undefined' ? location.search + '&' + location.hash : '');
  const off = () => /[?&#]theatres=0\b/.test(q());

  // ---- state: the engine's snapshot, else the preview flag -------------------------------------------------
  function preview() {
    const m = q().match(/[?&#]theatre=([a-z_:0-9,]+)/); if (!m) return null;
    const out = {}; m[1].split(',').forEach(kv => { const [k, v] = kv.split(':'); if (IDS.includes(k)) out[k] = { id: k, intensity: Math.max(0, Math.min(3, +v || 0)), fires: [], seizures: [], piracy: [], preview: true }; });
    return out;
  }
  function state(g) {
    if (off()) return null;
    let S = null;
    try { if (g && g.suprex && typeof g.theatreState === 'function') S = g.theatreState(); } catch (e) { S = null; }
    const P = preview();
    if (P) { S = Object.assign({}, S || {}); Object.keys(P).forEach(k => { S[k] = Object.assign({ fires: [], seizures: [], piracy: [] }, S[k] || {}, { intensity: P[k].intensity, preview: true }); }); }
    if (!S) return null;
    // the peak's one-off blows the engine announced (Druzhba cut etc.) stay drawn while the theatre is still hot
    const peaks = {}; ((g && g.events) || []).forEach(e => { if (e.type === 'theatre_peak') peaks[e.id] = e; });
    IDS.forEach(k => { if (S[k]) S[k].peakEvent = peaks[k] || null; });
    return S;
  }
  const lvl = (S, k) => (S && S[k] ? S[k].intensity | 0 : 0);

  // ---- geography: real [lat, lon] → board uv (Equal Earth, oil-geo.js) ------------------------------------
  const W = {
    // the Gulf fields (Kuwait 1991 first): Burgan, Rumaila, Ras Tanura, Abqaiq, Kirkuk, Ahvaz, Ghawar, Kharg
    wells: [[29.05, 47.95], [30.40, 47.35], [26.64, 50.10], [25.94, 49.68], [35.47, 44.39], [31.30, 48.70], [25.30, 49.30], [29.75, 47.70]],
    slicks: [[28.6, 49.6], [27.3, 51.0], [26.4, 53.2]],
    front: [[50.35, 37.95], [49.70, 37.90], [49.00, 37.95], [48.55, 37.95], [48.05, 37.55], [47.70, 36.85], [47.50, 35.95], [47.30, 35.25], [46.85, 34.10], [46.60, 32.90]],
    druzhba: [[52.05, 29.25], [51.07, 27.20], [50.08, 25.15]],          // the southern branch through Ukraine; the cut at its middle
    blacksea: [[44.70, 37.80], [44.10, 36.20], [43.40, 34.30], [42.60, 32.20], [41.90, 30.20], [41.25, 29.10]],
    baltic: [[60.35, 28.60], [59.95, 26.20], [59.50, 23.30], [58.20, 20.60], [56.40, 19.40], [55.40, 15.60], [55.30, 13.00]],
    corridor: [[10.15, -64.70], [11.30, -67.20], [12.30, -70.60], [11.40, -75.40], [9.75, -79.25], [8.60, -79.65], [7.20, -80.60], [9.40, -86.30],
               [12.80, -91.40], [15.40, -96.40], [18.40, -103.80], [22.40, -109.20], [26.40, -113.70], [30.40, -116.70], [33.55, -118.35], [36.80, -122.20]],
  };
  const STATE_COL = { gulf_fire: '#3f8f52', ukraine_war: '#3b63b8', venezuela_pacific: '#c23a2c', venezuela_north: '#3b63b8' };
  const hashCol = s => { if (!s) return null; let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return ['#3b63b8', '#c23a2c', '#3f8f52', '#c8a03a', '#7a4fb0'][Math.abs(h) % 5]; };
  const uv = ll => GEO().uv(ll[0], ll[1]);
  const cache = {};
  function path(k) {                           // a polyline in uv, with its arc length (x scaled by the board aspect)
    if (cache[k]) return cache[k];
    const P = W[k].map(uv), L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot((P[i][0] - P[i - 1][0]) * 1.48, P[i][1] - P[i - 1][1]));
    return (cache[k] = { P, L, len: L[L.length - 1] });
  }
  function along(pt, f) {                      // [u, v, heading(rad, y-up)] at fraction f of the path
    f = Math.max(0, Math.min(1, f)); const want = pt.len * f, P = pt.P, L = pt.L;
    for (let i = 1; i < P.length; i++) if (want <= L[i] || i === P.length - 1) {
      const a = P[i - 1], b = P[i], t = L[i] > L[i - 1] ? (want - L[i - 1]) / (L[i] - L[i - 1]) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-(b[1] - a[1]), (b[0] - a[0]) * 1.48)];
    }
    return [P[0][0], P[0][1], 0];
  }

  // ---- sprites --------------------------------------------------------------------------------------------
  function tinted(col) {                       // the atlas with `col` multiplied into the SLOT (the flags, the cutter slash)
    if (tint[col]) return tint[col]; const A = IMG.atlas, M = IMG.mask; if (!A || !M) return null;
    const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = A.width; t.height = A.height; const y = t.getContext('2d');
    y.fillStyle = col; y.fillRect(0, 0, t.width, t.height); y.globalCompositeOperation = 'destination-in'; y.drawImage(M, 0, 0);
    x.drawImage(A, 0, 0); x.globalCompositeOperation = 'multiply'; x.drawImage(t, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(A, 0, 0);
    return (tint[col] = c);
  }
  function spr(c, src, reg, name, x, y, s, alpha) {
    const R = reg && reg.cells[name]; if (!R || !src) return false;
    const [sx, sy, w, h, ax, ay] = R, k = s / reg.ppu * 100; c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.drawImage(src, sx, sy, w, h, x - ax * k, y - ay * k, w * k, h * k); c.globalAlpha = 1; return true;
  }
  const hIdx = (hd, n) => { const d = ((hd * 180 / Math.PI) % 360 + 360) % 360; return Math.round(d / (360 / n)) % n; };
  const ship = (c, kind, col, x, y, hd, s, a) => spr(c, col ? tinted(col) : IMG.atlas, SP(), kind + '_h' + String(hIdx(hd, 16)).padStart(2, '0'), x, y, s, a);
  const fx = (c, name, f, x, y, s, a) => spr(c, IMG.atlas, SP(), name + '_f' + String(f % 12).padStart(2, '0'), x, y, s, a);
  const pfx = (c, name, f, x, y, s, a) => { const P = PC(); if (!P || !window.OIL_WORLD_VIEW) return false;   // the 1117 pieces atlas (fire/smoke)
    const img = window.OIL_WORLD_VIEW._img && window.OIL_WORLD_VIEW._img(); return spr(c, img, P, name + '_f' + String(f % 12).padStart(2, '0'), x, y, s, a); };
  function glow(c, x, y, r, rgb, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  let NOCAP = false;                           // the board's own place labels own the type there: no captions on the board
  function caption(c, txt, x, y, px, a) { if (NOCAP) return; c.font = `italic ${px}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = `rgba(214,170,120,${a || 0.8})`; c.fillText(txt, x, y); }
  function hardFire(c, x, y, s, now, i) {      // a small hard fire at the root (the pieces atlas fire, or a drawn one)
    glow(c, x, y, 14 * s, '255,110,40', 0.30);
    if (!pfx(c, 'fire', Math.floor(now / 110) + i * 5, x, y, s * 0.55, 0.95)) { glow(c, x, y - 2 * s, 5 * s, '255,190,90', 0.9); }
  }
  function blackColumn(c, x, y, s, now, i, puffs, k) {  // the black column: slow, heavy, leaning south-east (the shamal)
    for (let j = 0; j < puffs; j++) {
      const d = ((now * 0.000018 * (1 + 0.1 * (i % 3)) + j / puffs) % 1);
      const px = x + d * 34 * s * k, py = y - (8 + d * 54) * s * k + d * d * 20 * s * k;
      if (!fx(c, 'bsmoke', Math.floor(now / 170) + j * 3 + i, px, py, s * k * (0.42 + d * 0.75), 0.92 * (1 - d * 0.55))) {
        c.fillStyle = `rgba(8,6,5,${0.55 * (1 - d)})`; c.beginPath(); c.arc(px, py, (3 + 9 * d) * s * k, 0, 7); c.fill();
      }
    }
  }

  // ---- the WORLD view (animated) ---------------------------------------------------------------------------
  // r = the plate rect, X/Y uv→px, k = the world view's scale (as oil-world-view), board=true for the still board pass
  function draw(c, g, o) {
    const S = state(g); if (!S || !GEO()) return 0;
    const { X, Y, dpr, now, board } = o, k = Math.max(0.7, o.k), s = dpr * k, t = board ? 0 : now;
    let drawn = 0;
    // ===== THE GULF ON FIRE =====
    const G = lvl(S, 'gulf_fire');
    if (G > 0) {
      const nW = [0, 2, 5, 8][G];
      if (G >= 3 && !board) {                   // PEAK: the soot closes over the Gulf (multiply, so the plate goes dark under it)
        const p = uv([28.2, 49.4]), x = X(p), y = Y(p), R = 120 * s;
        c.save(); const gr = c.createRadialGradient(x + 18 * s, y + 10 * s, 0, x + 18 * s, y + 10 * s, R);   // soot, laid over (the gold goes brown under it)
        const br = 0.04 * Math.sin(t * 0.0004);
        gr.addColorStop(0, `rgba(12,9,7,${0.62 + br})`); gr.addColorStop(0.55, 'rgba(20,15,11,.38)'); gr.addColorStop(1, 'rgba(20,15,11,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(x + 18 * s, y + 10 * s, R, 0, 7); c.fill(); c.restore();
      }
      if (G >= 2) W.slicks.slice(0, G - 1).forEach((ll, i) => { const p = uv(ll), x = X(p), y = Y(p);   // burning slicks on the water
        glow(c, x, y, 12 * s, '255,100,30', board ? 0.25 : 0.32);
        if (!fx(c, 'slickfire', Math.floor(t / 120) + i * 4, x, y, s * 0.45, board ? 0.85 : 0.95)) glow(c, x, y, 5 * s, '255,160,60', 0.8);
        if (!board) blackColumn(c, x, y, s, t, 10 + i, 4, 0.8); drawn++; });
      W.wells.slice(0, nW).forEach((ll, i) => { const p = uv(ll), x = X(p) + (i % 2 ? 1.5 : -1.5) * s, y = Y(p);
        spr(c, IMG.atlas, SP(), 'wellhead', x, y, s * 0.35, 0.95);
        hardFire(c, x, y - 1 * s, s, t, i);
        blackColumn(c, x, y - 2 * s, s, t, i, board ? 4 : 6, board ? 0.75 : 1); drawn++; });
      const lab = uv([24.3, 47.6]);
      caption(c, ['', 'the Gulf — smouldering', 'the Gulf — the wells are burning', 'the Gulf — the wells are burning, the sky is gone'][G], X(lab), Y(lab) + 6 * s, Math.max(9, 10 * Math.min(1.1, k)) * dpr, board ? 0.7 : 0.82);
    }
    // ===== UKRAINE / RUSSIA =====
    const U = lvl(S, 'ukraine_war');
    if (U > 0) {
      const F = path('front');
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';                       // the seam of the front: scorched, not a border
      c.strokeStyle = `rgba(30,12,6,${0.55 + 0.1 * U})`; c.lineWidth = (2.6 + U) * s; c.beginPath(); F.P.forEach((p, i) => i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p))); c.stroke();
      c.strokeStyle = `rgba(190,70,30,${0.45 + 0.12 * U})`; c.lineWidth = 1.1 * s; c.setLineDash([2 * s, 3 * s]); c.stroke(); c.setLineDash([]); c.restore();
      const nP = [0, 3, 6, 10][U];
      for (let i = 0; i < nP; i++) { const a = along(F, (i + 0.5) / nP), x = X(a), y = Y(a);
        if (!board) { const fl = Math.max(0, Math.sin(t * 0.0021 * (1 + i * 0.13) + i * 7)); if (fl > 0.93) glow(c, x, y, 5 * s, '255,150,70', (fl - 0.93) * 8); }   // a far-off flash, rare and small
        if (!pfx(c, 'smoke', Math.floor(t / 160) + i * 3, x + 2 * s, y, s * (board ? 0.28 : 0.36), board ? 0.6 : 0.75)) glow(c, x, y - 4 * s, 6 * s, '60,55,50', 0.5);
        drawn++; }
      const cut = U >= 3 || (S.ukraine_war.peakEvent && U >= 2);
      if (cut) { const D = path('druzhba'), a = along(D, 0.5), x = X(a), y = Y(a), hd = a[2];
        glow(c, x, y, 13 * s, '226,60,42', board ? 0.25 : 0.25 + 0.12 * Math.sin(t * 0.005));
        spr(c, IMG.atlas, SP(), 'pipecut_h' + String(hIdx(hd, 16) % 8).padStart(2, '0'), x, y, s * 0.42, 1);
        hardFire(c, x, y - 1 * s, s * 0.8, t, 3); blackColumn(c, x, y - 2 * s, s, t, 21, board ? 2 : 4, board ? 0.45 : 0.75);
        caption(c, 'Druzhba — cut', x - 22 * s, y - 6 * s, Math.max(9, 10 * Math.min(1.1, k)) * dpr, 0.8); drawn++; }
      const nS = [0, 2, 4, 6][U];                                                 // the shadow fleet, running dark
      for (let i = 0; i < nS; i++) { const P = path(i % 2 ? 'baltic' : 'blacksea'), sp = board ? 0 : t * 0.0000075, f = ((i * 0.37 + sp) % 1);
        const a = along(P, f), x = X(a), y = Y(a);
        ship(c, 'tk_shadow', '#4d4a44', x, y, a[2], s * 0.62, board ? 0.85 : 0.9); drawn++; }
      const lab = uv([43.2, 35.0]); caption(c, ['', 'the front — quiet', 'the front — shelling', 'the front — the line is burning'][U], X(lab), Y(lab) + 8 * s, Math.max(9, 10 * Math.min(1.1, k)) * dpr, board ? 0.65 : 0.78);
    }
    // ===== VENEZUELA → THE CALIFORNIA LANES =====
    const V = lvl(S, 'venezuela_pacific');
    if (V > 0) {
      const C = path('corridor');
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';                         // the contested corridor: a red hairline under the lanes
      c.strokeStyle = `rgba(194,58,44,${0.12 + 0.07 * V})`; c.lineWidth = (5 + 2 * V) * s; c.beginPath(); C.P.forEach((p, i) => i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p))); c.stroke();
      c.strokeStyle = `rgba(226,90,70,${0.4 + 0.1 * V})`; c.lineWidth = 1 * s; c.setLineDash([4 * s, 4 * s]); c.lineDashOffset = board ? 0 : -t * 0.004; c.stroke(); c.setLineDash([]); c.restore();
      // seizures along the corridor: tanker sails → the cutter closes → boarded → the flag comes down, the state's goes up
      const nZ = [0, 1, 2, 4][V], CYC = 16000;
      for (let i = 0; i < nZ; i++) {
        const f0 = (i + 0.4) / (nZ + 0.3), ph = board ? 0.9 : (((t + i * 5300) % CYC) / CYC), a = along(C, f0), x = X(a), y = Y(a);
        const col = f0 > 0.42 ? STATE_COL.venezuela_north : STATE_COL.venezuela_pacific, hd = a[2];
        const nx = -Math.sin(hd), ny = -Math.cos(hd);                             // the cutter comes up on the starboard side
        const gap = (ph < 0.35 ? 1 - ph / 0.35 : 0) * 26 + 6.5, cx = x + nx * gap * s * 0.62, cy = y + ny * gap * s * 0.62;
        if (ph < 0.55) ship(c, 'tk_flag', '#c8a03a', x, y, hd, s * 0.62, 1);
        else { const m = Math.min(1, (ph - 0.55) / 0.12); ship(c, 'tk_flag', '#c8a03a', x, y, hd, s * 0.62, 1 - m); ship(c, 'tk_seized', col, x, y, hd, s * 0.62, m); }
        ship(c, 'cutter', col, cx, cy, hd, s * 0.62, 1);
        if (!board && ph > 0.35 && ph < 0.6) glow(c, cx, cy, 7 * s, '90,140,255', 0.35 + 0.35 * Math.max(0, Math.sin(t * 0.02)));   // the strobe while they board
        drawn += 2;
      }
      const nK = [0, 1, 2, 4][V];                                                   // pirates: skiffs circling a merchant
      for (let i = 0; i < nK; i++) { const a = along(C, (i + 0.85) / (nK + 0.6)), x = X(a) + 4 * s, y = Y(a) - 5 * s, hd = a[2] + Math.PI;
        ship(c, 'tk_flag', '#9a8a6a', x, y, hd, s * 0.62, 1);
        for (let j = 0; j < 2; j++) { const w = (board ? 0 : t * 0.0011) + j * Math.PI + i, R = 9 * s;
          const sx = x + Math.cos(w) * R, sy = y + Math.sin(w) * R * 0.7, shd = Math.atan2(-Math.cos(w) * 0.7, -Math.sin(w));
          if (!board) { c.strokeStyle = 'rgba(240,235,220,.35)'; c.lineWidth = 0.8 * dpr; c.beginPath(); c.arc(x, y, R, w - 0.5, w, false); c.stroke(); }
          ship(c, 'skiff', null, sx, sy, shd, s * 0.9, 1); }
        drawn += 3; }
      const lab = uv([16.8, -88.0]);
      caption(c, ['', 'the corridor — patrols', 'the corridor — seizures, piracy', 'the corridor — seized from Caracas to California'][V], X(lab), Y(lab) + 8 * s, Math.max(9, 10 * Math.min(1.1, k)) * dpr, board ? 0.65 : 0.78);
    }
    // ===== the engine's own events, wherever they are =====
    IDS.forEach(id => { const T = S[id]; if (!T) return;
      (T.seizures || []).forEach((z, i) => { const P = GEO().at(z.at); if (!P) return; const x = X(P) + (8 + 6 * i) * s, y = Y(P) + 7 * s, col = hashCol(z.by) || STATE_COL[id];
        ship(c, 'tk_seized', col, x, y, 0.3, s * 0.7, 1); ship(c, 'cutter', col, x + 5 * s, y + 6 * s, 0.3, s * 0.7, 1);
        caption(c, `${z.on || 'a tanker'} — seized${z.by ? ' by ' + z.by : ''}`, x, y + 15 * s, Math.max(8, 9 * Math.min(1, k)) * dpr, 0.85); drawn += 2; });
      (T.piracy || []).forEach((z, i) => { const P = GEO().at(z.at); if (!P) return; const x = X(P) - (10 + 6 * i) * s, y = Y(P) + 8 * s;
        ship(c, 'tk_flag', '#9a8a6a', x, y, 2.6, s * 0.7, 1);
        for (let j = 0; j < 2; j++) { const w = (board ? 0 : t * 0.0012) + j * Math.PI; ship(c, 'skiff', null, x + Math.cos(w) * 8 * s, y + Math.sin(w) * 6 * s, w + Math.PI / 2, s * 0.9, 1); }
        caption(c, `${z.on || 'a tanker'} — held for ransom${z.ransom ? ' ($' + z.ransom + ')' : ''}`, x, y + 15 * s, Math.max(8, 9 * Math.min(1, k)) * dpr, 0.85); drawn += 3; });
    });
    return drawn;
  }
  // the still board: under the lanes, smaller, no soot shroud (the dotted lanes must read through it)
  function drawBoard(c, g, o) { NOCAP = true; try { return draw(c, g, Object.assign({ board: true, now: (typeof performance !== 'undefined' ? performance.now() : 0) }, o, { k: (o.k || 1) * 0.8 })); } finally { NOCAP = false; } }
  window.OIL_THEATRES_VIEW = { state, draw, drawBoard, preview, off, W };
})();
