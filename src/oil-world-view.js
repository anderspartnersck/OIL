/* OiL! ◉ WORLD (1117) — the living ocean of oil. RENDER-ONLY: reads the game, never writes it.
   Joe 1117: "the 3d ocean of oil where you can see you ship sailing around the world or trekking overland in
   pipeline mode … and also the use for the firefighting company in earnest".

   A pre-rendered plate (3D PIPELINE games/oil/blender/world_ee.py → tools/ee/post_world.py: crude sea, land, the
   world's pipelines with pump stations, refineries at the HQs, power lines, offshore rigs, the super-rig) under a
   light canvas layer, ~30 fps, phone-friendly (one plate + a quarter-res sheen buffer + a few dozen sprites):
     · the sheen       thin-film colour drifting on the crude, clipped to the sea (sea_mask)
     · the ships       each company's tanker (our pieces atlas, tinted by the company slot) SAILS its route between
                       turns — interpolated along the Equal Earth lanes (src/oil-geo.js), under way at k/N
     · the trek        PIPELINE MODE: cargo in a line is a copper capsule crawling the pipe; cut = a red collar
     · the fires       burning yards: fire + a heavy smoke column that grows with every turn it burns. Herzog's
                       Lessons in Darkness, not an explosion reel — slow, dark, no flash, a quiet caption
     · the crew        THE CREW (opts.iwsCrew): the Fire Cutters' rig travelling the lanes to the job
     · flares          a pilot flame at every refinery that is not burning
   The gateway's state lives in its own closure, so it ATTACHES: OIL_WORLD_VIEW.attach({ game:()=>game, cv, ctx, view:()=>S.view,
   dice:drawDiceRow }). */
(function () {
  'use strict';
  const IMG = {};
  const load = (k, src) => { const i = new Image(); i.onload = () => { IMG[k] = i; tinted = {}; }; i.src = src; };
  load('plate', 'assets/world/oil_world_ee.webp'); load('sea', 'assets/world/sea_mask.webp');
  load('atlas', 'assets/world/pieces_flat.webp'); load('mask', 'assets/world/mask_flat.webp');
  const PC = () => window.OIL_PIECES, GEO = () => window.OIL_GEO, MP = () => window.OIL_MAP;
  let tinted = {}, sheen = null, raf = 0, lastT = 0, H = null;
  const attach = h => { H = h; };
  const motion = {};            // seat id -> { key, pts:[[u,v,mode]], t0, dur }
  const DUR = 1800;

  // ---- geometry -----------------------------------------------------------------------------
  function rect(W, H) { const ar = 1.48; let bx = 0, by = 0, bw = W, bh = H; if (ar > W / H) { bh = W / ar; by = (H - bh) / 2; } else { bw = H * ar; bx = (W - bw) / 2; } return { bx, by, bw, bh }; }
  const at = c => GEO().at(c);
  function routeOf(rid) { const M = MP(); return M.ROUTES[rid] || (M.OPT_BY_ID || {})[rid] || null; }
  function isPipe(a, b) { const W = window.OIL_WORLD; return W ? W.isPipe(MP(), a, b) : false; }
  // a voyage as one uv polyline (lanes joined; a wrap at the Atlantic seam is a cut, not a smear)
  function voyage(codes) {
    const out = [];
    for (let i = 1; i < codes.length; i++) {
      const Ln = GEO().lane(codes[i - 1], codes[i]); if (!Ln) continue;
      const mode = isPipe(codes[i - 1], codes[i]) ? 'pipe' : 'sea';
      Ln.pieces.forEach((pc, j) => pc.forEach((q, k) => out.push([q[0], q[1], mode, j > 0 && k === 0])));
    }
    return out;
  }
  function seatPoint(q) {                    // where a seat IS (uv) and what it is doing
    const M = MP(), g = H.game();
    if (g.momentum && q.under) { const R = routeOf(q.under.rid); if (R) { const N = window.OIL_MOMENTUM.spacesOf(q.under.rid, g.momDials).N;
      const p = GEO().along(GEO().lane(R[0], R[1]), Math.max(0.05, Math.min(0.95, q.under.k / N))).at; return { uv: p, key: 'u' + q.under.rid + ':' + q.under.k }; } }
    if (q.trapped || q.inLine) { const L = q.trapped || q.inLine, from = L.from, to = L.to || L.at;
      const p = GEO().along(GEO().lane(from, to), 0.72).at; return { uv: p, key: 'l' + from + '>' + to, line: true }; }
    return { uv: at(q.at), key: 'a' + q.at };
  }
  function track(q, now) {
    const sp = seatPoint(q), m = motion[q.id];
    if (!m) { motion[q.id] = { key: sp.key, code: q.at, pts: [[sp.uv[0], sp.uv[1], 'sea']], t0: 0, dur: 1 }; return; }
    if (m.key === sp.key) return;
    let pts = null;
    if (m.code && q.at && m.code !== q.at && !(H.game().momentum && q.under)) {
      const r = MP().reach(m.code, 99, H.game().mapState), path = MP().pathOf(r, q.at);
      if (path.length > 1) pts = voyage(path);
    }
    const cur = pos(m, now);
    if (!pts || !pts.length) pts = [[cur[0], cur[1], cur[2] || 'sea'], [sp.uv[0], sp.uv[1], sp.line ? 'pipe' : 'sea']];
    else { pts.unshift([cur[0], cur[1], pts[0][2]]); if (sp.line) pts.push([sp.uv[0], sp.uv[1], 'pipe']); }
    Object.assign(m, { key: sp.key, code: q.at, pts, t0: now, dur: DUR });
  }
  function pos(m, now) {                     // [u, v, mode, heading] along the motion polyline (arc length, eased)
    const P = m.pts; if (P.length === 1) return [P[0][0], P[0][1], P[0][2], m.hd || 0];
    let t = Math.min(1, (now - m.t0) / m.dur); t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const segs = []; let L = 0;
    for (let i = 1; i < P.length; i++) { const l = P[i][3] ? 0 : Math.hypot((P[i][0] - P[i - 1][0]) * 1.48, P[i][1] - P[i - 1][1]); segs.push(l); L += l; }
    let want = L * t;
    for (let i = 1; i < P.length; i++) { const l = segs[i - 1];
      if (want <= l || i === P.length - 1) { const f = l ? Math.min(1, want / l) : 1, a = P[i - 1], b = P[i];
        if (l > 1e-6) m.hd = Math.atan2(-(b[1] - a[1]), (b[0] - a[0]) * 1.48);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[2], m.hd || 0]; }
      want -= l; }
    const e = P[P.length - 1]; return [e[0], e[1], e[2], m.hd || 0];
  }

  // ---- sprites ------------------------------------------------------------------------------
  function tintedAtlas(col) {                // the atlas with the company colour multiplied into the slot mask
    if (tinted[col]) return tinted[col];
    const A = IMG.atlas, Mk = IMG.mask; if (!A || !Mk) return null;
    const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = A.width; t.height = A.height; const y = t.getContext('2d');
    y.fillStyle = col; y.fillRect(0, 0, t.width, t.height); y.globalCompositeOperation = 'destination-in'; y.drawImage(Mk, 0, 0);
    x.drawImage(A, 0, 0); x.globalCompositeOperation = 'multiply'; x.drawImage(t, 0, 0);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(A, 0, 0);
    return (tinted[col] = c);
  }
  function spr(src, name, x, y, s, alpha) {
    const P = PC(); const cell = P && P.cells[name]; if (!cell || !src) return false;
    const [sx, sy, w, h, ax, ay] = cell; const k = s / P.ppu * 100;
    const c = H.ctx; c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.drawImage(src, sx, sy, w, h, x - ax * k, y - ay * k, w * k, h * k); c.globalAlpha = 1; return true;
  }

  // ---- the sheen ----------------------------------------------------------------------------
  const FILM = [[255, 70, 190], [40, 210, 200], [250, 200, 60], [120, 90, 255], [60, 230, 120], [255, 120, 60]];
  function drawSheen(c, r, t) {
    if (!IMG.sea) return;
    const w = Math.max(64, Math.round(r.bw / 4)), h = Math.max(44, Math.round(r.bh / 4));
    if (!sheen || sheen.width !== w || sheen.height !== h) { sheen = document.createElement('canvas'); sheen.width = w; sheen.height = h; }
    const x = sheen.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const ph = i * 1.7, cx = w * (0.5 + 0.45 * Math.sin(t * 0.00005 * (1 + i * 0.13) + ph)), cy = h * (0.42 + 0.36 * Math.cos(t * 0.00004 * (1 + i * 0.11) + ph * 1.3));
      const rad = w * (0.10 + 0.06 * Math.sin(t * 0.0002 + i)), [R, G, B] = FILM[i % FILM.length];
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, `rgba(${R},${G},${B},.55)`); gr.addColorStop(0.55, `rgba(${FILM[(i + 2) % 6].join(',')},.22)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, rad * 1.7, rad * 0.8, Math.sin(i + t * 0.00003), 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'destination-in'; x.drawImage(IMG.sea, 0, 0, w, h);
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.28; c.drawImage(sheen, r.bx, r.by, r.bw, r.bh); c.restore();
  }

  // ---- the frame ----------------------------------------------------------------------------
  function drawWorld(now) {
    if (!H) return; const g = H.game(), c = H.ctx, cvs = H.cv; if (!g || !GEO()) return;
    const dpr = devicePixelRatio, W = cvs.width = cvs.clientWidth * dpr, HH = cvs.height = cvs.clientHeight * dpr;
    c.fillStyle = '#0a0705'; c.fillRect(0, 0, W, HH);
    const r = rect(W, HH), X = p => r.bx + r.bw * p[0], Y = p => r.by + r.bh * p[1], k = r.bw / (1100 * dpr);
    if (IMG.plate) c.drawImage(IMG.plate, r.bx, r.by, r.bw, r.bh);
    drawSheen(c, r, now);
    const M = MP(), st = g.mapState;
    // shut straits: a red boom across the water
    Object.keys(st.closed || {}).forEach(code => { const p = at(code), x = X(p), y = Y(p);
      c.strokeStyle = 'rgba(226,60,42,.9)'; c.lineWidth = 2.2 * dpr; c.beginPath(); c.moveTo(x - 9 * dpr, y - 3 * dpr); c.lineTo(x + 9 * dpr, y + 3 * dpr); c.stroke(); });
    // refineries: a pilot flame where the yard is not burning
    M.PLACES.filter(p => p.kind === 'hq').forEach(pl => { if (g.crisis && g.burningAt(pl.code)) return;
      const p = at(pl.code), x = X(p), y = Y(p) - 7 * dpr * Math.max(0.7, k), f = 0.6 + 0.4 * Math.sin(now * 0.013 + x) * Math.sin(now * 0.007 + y);
      const gr = c.createRadialGradient(x, y, 0, x, y, 6 * dpr * Math.max(0.7, k)); gr.addColorStop(0, `rgba(255,190,90,${0.75 * f})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, 6 * dpr * Math.max(0.7, k), 0, 7); c.fill(); });
    // the fires — weight, not spectacle: the column grows with every turn burning; the caption is quiet
    const F = g.crisis ? Object.entries(g.fires) : [];
    const fireFrame = Math.floor(now / 110) % 12, smokeFrame = Math.floor(now / 160) % 12;
    const fireAt = (p, turns, label) => { const x = X(p), y = Y(p), s = Math.max(0.55, k) * dpr * (0.8 + 0.12 * Math.min(6, turns));
      spr(IMG.atlas, 'haze', x, y, s * 1.6, 0.55);
      for (let j = 0; j < Math.min(5, 1 + turns); j++) { const drift = ((now * 0.00002 + j * 0.23) % 1);
        spr(IMG.atlas, 'smoke_f' + String((smokeFrame + j * 3) % 12).padStart(2, '0'), x + drift * 26 * s, y - drift * 34 * s, s * (1 + drift * 0.9), 0.85 * (1 - drift * 0.7)); }
      spr(IMG.atlas, 'fire_f' + String(fireFrame).padStart(2, '0'), x, y, s, 0.95);
      c.font = `italic ${Math.max(9, 10.5 * Math.min(1, k)) * dpr}px Georgia, serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(214,170,120,.82)';
      c.fillText(label, x, y + 16 * dpr * Math.max(0.7, k)); };
    F.forEach(([code, turns]) => fireAt(at(code), turns, `${(M.BY[code] || {}).name || code} — burning, ${turns} turn${turns === 1 ? '' : 's'}`));
    // pump-station fires (PIPELINE MODE)
    if (g.pipeMode) Object.entries(g.pumpFires || {}).forEach(([rid, turns]) => { const R = routeOf(+rid) || routeOf(rid); if (!R) return;
      fireAt(GEO().along(GEO().lane(R[0], R[1]), 0.5).at, turns, 'a pump station burning'); });
    // THE CREW — the Fire Cutters' rig on the lanes
    if (g.crew) { const C = g.crew; let p = at(C.at), going = null;
      if (C.job && C.job.to && C.job.dist) { const path = M.pathOf(M.reach(C.at, 999, st), C.job.to), pts = voyage(path);
        if (pts.length > 1) { const f = Math.max(0, Math.min(1, 1 - C.left / C.job.dist)), m = { pts, t0: 0, dur: 1 }; const q = pos(m, f); p = [q[0], q[1]]; going = C.job; } }
      const x = X(p), y = Y(p), s = 6 * dpr * Math.max(0.75, k);
      c.fillStyle = '#f4f0e6'; c.strokeStyle = '#c62f22'; c.lineWidth = 1.6 * dpr;
      c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#c62f22'; c.font = `bold ${7 * dpr * Math.max(0.8, k)}px Trebuchet MS`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('IWS', x, y + 0.5 * dpr);
      c.font = `${9.5 * dpr}px Trebuchet MS`; c.fillStyle = 'rgba(244,240,230,.85)'; c.textBaseline = 'alphabetic';
      c.fillText(going ? `Box & Scooter → ${(M.BY[going.to] || {}).name || going.to}${C.queue.length ? ` · ${C.queue.length} waiting` : ''}` : 'Box & Scooter — on standby', x, y - s - 4 * dpr); }
    // the ships, and the cargo in the lines
    g.players.forEach((q, i) => {
      track(q, now); const m = motion[q.id], p = pos(m, now), x = X(p), y = Y(p), col = (g._colors && g._colors[i]) || '#f6c95a';
      const s = Math.max(0.6, k) * dpr * 1.15;
      if (p[2] === 'pipe' || q.inLine || q.trapped) {          // the trek: a copper capsule in the line
        const a = -p[3]; c.save(); c.translate(x, y); c.rotate(a);
        c.fillStyle = '#b8642a'; c.strokeStyle = 'rgba(10,6,3,.95)'; c.lineWidth = 1.4 * dpr;
        c.beginPath(); c.roundRect ? c.roundRect(-9 * s, -4 * s, 18 * s, 8 * s, 4 * s) : c.rect(-9 * s, -4 * s, 18 * s, 8 * s); c.fill(); c.stroke();
        c.fillStyle = col; c.fillRect(-2.5 * s, -4 * s, 5 * s, 8 * s); c.restore();
        if (q.trapped) { const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
          c.strokeStyle = `rgba(226,60,42,${0.5 + 0.4 * pulse})`; c.lineWidth = 2 * dpr; c.beginPath(); c.arc(x, y, 13 * s, 0, 7); c.stroke();
          c.font = `bold ${9 * dpr}px Trebuchet MS`; c.textAlign = 'center'; c.fillStyle = '#ff8a6a';
          c.fillText(`TRAPPED · ${q.trapped.why === 'fire' ? 'pump fire' : q.trapped.why === 'political' ? 'shut-off' : 'sabotage'} · ${q.trapped.left}`, x, y - 15 * s); }
        return;
      }
      const hd = ((Math.round(((p[3] * 180 / Math.PI) % 360 + 360) % 360 / 22.5)) % 16), atl = tintedAtlas(col);
      if (!spr(atl, 'tanker_h' + String(hd).padStart(2, '0'), x, y, s)) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 4 * dpr, 0, 7); c.fill(); }
      if (q.isHuman) { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.4 * dpr; c.beginPath(); c.arc(x, y, 12 * s, 0, 7); c.stroke(); }
    });
    // the tape, small: the world never hides the market
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold ' + 12 * dpr + 'px Trebuchet MS';
    c.fillStyle = g.era === 'CHAOTIC' ? '#e2632a' : '#f6c95a';
    c.fillText(`$${g.price}  ·  OIL ${g.oil}/${g.dials.OIL_START}  ·  ${g.era}  ·  ◉ THE WORLD`, 10 * dpr, 16 * dpr);
    if (H.dice) H.dice(W - 10 * dpr, 16 * dpr, dpr);
    c.font = `italic ${10 * dpr}px Georgia, serif`; c.fillStyle = 'rgba(202,161,94,.7)'; c.textAlign = 'center';
    c.fillText('the ships sail their routes · cargo treks the pipes · fires burn until someone pays', W / 2, HH - 10 * dpr);
  }
  function loop(t) {
    if (!H || !H.game() || H.view() !== 'world') { raf = 0; return; }
    if (t - lastT > 32) { lastT = t; drawWorld(t); }
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf) raf = requestAnimationFrame(loop); }
  window.OIL_WORLD_VIEW = { attach, start, drawWorld, motion };
})();
