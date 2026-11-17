/* OiL! THE GEO LAYER — one lat/lon source for the whole world, projected Equal Earth (1117).
   ============================================================================
   Joe 2026-11-17: "lets make the map less mercator and more world perspective size. same
   orientation with russia and africa left justified on the board."

   WHAT THIS IS. Every place, HQ, route waypoint and real pipeline as a REAL [lat, lon], and the
   ONE projection that turns them into board coordinates. The 2D board (gateway ◍ MAP on the
   Equal Earth plate), the 3D board (3D PIPELINE games/oil, refs_ee/) and the WORLD view
   (◉ WORLD) all read this file, so all three agree to the pixel.

   WHAT THIS IS NOT. The game graph. Which routes exist, what they cost, what shuts — all of that
   stays in oil-map.js (ADJ / ROUTES / placeOpen). Nothing here is loaded by the engine, the sweep
   or the batteries, so the golden fingerprint (f421af5) cannot move because of it.
   scripts/oil-geo-check.js proves both: every place and route is covered, and the graph and the
   fingerprint are byte-identical with this file loaded or not.

   THE PROJECTION. Equal Earth (Šavrič, Patterson & Jenny 2018): equal-area, so Africa is the size
   of Africa again and Russia/Greenland stop being bloated — the "world perspective size" Joe asked
   for — while the continents keep a familiar, map-like shape (unlike Gall-Peters). Central
   meridian 150°E keeps the board PACIFIC-CENTRED exactly as before: Europe, Russia and Africa on
   the left, Asia centre-left, the Pacific in the middle, the Americas on the right. The seam runs
   down the mid-Atlantic at 30°W; the two Atlantic crossings (the North Atlantic run, the South
   Atlantic haul) leave one edge and come in at the other, as they did on the old board.

   FRAME. The board keeps its 1.48 aspect and its deck panels (THE KEY / THE DICE at y .852–.958),
   so gateway.html's letterbox and drawKey land unchanged. The world's oval spans 95% of the width.

   PROVENANCE. Place/waypoint lat/lons are real geography (coasts, straits, the actual pipelines);
   the HQ, port, onshore and rig coordinates come from oil-map.js `ll` when it carries them (the
   1117 labels pass) and from LL below otherwise. Waypoints are presentation (CONCEPT): they keep a
   lane in the water and off the coast; the lane's LENGTH on the board is never read by the rules.

   Runs in Node (globalThis) and the browser (window). Defines OIL_GEO. */
(function (global) {
  'use strict';

  // ---- Equal Earth -------------------------------------------------------------------------
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const RAD = Math.PI / 180;
  const CM = 150;                         // central meridian (°E) — Pacific-centred, seam at 30°W
  const XMAX = 2 * Math.sqrt(3) * Math.PI / (3 * A1);              // 2.70663 (x at the equator, ±180°)
  const YMAX = (() => { const t = Math.PI / 3; return A1 * t + A2 * t ** 3 + A3 * t ** 7 + A4 * t ** 9; })();   // 1.31731
  function ee(lat, lamRel) {               // lamRel = longitude relative to CM, degrees, -180..180
    const th = Math.asin(M * Math.sin(lat * RAD)), t2 = th * th, t6 = t2 * t2 * t2;
    const x = 2 * Math.sqrt(3) * (lamRel * RAD) * Math.cos(th) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1));
    const y = A4 * t6 * t2 * th + A3 * t6 * th + A2 * t2 * th + A1 * th;
    return [x, y];
  }
  function eeInv(x, y) {                   // Newton on theta; returns [lat, lamRel] or null outside the oval
    let th = y / A1;
    for (let i = 0; i < 12; i++) {
      const t2 = th * th, t6 = t2 * t2 * t2;
      const f = A4 * t6 * t2 * th + A3 * t6 * th + A2 * t2 * th + A1 * th - y;
      const fp = 9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1;
      th -= f / fp;
    }
    const t2 = th * th, t6 = t2 * t2 * t2;
    const lam = 3 * x * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1) / (2 * Math.sqrt(3) * Math.cos(th));
    const s = Math.sin(th) / M; if (Math.abs(s) > 1) return null;
    const lamDeg = lam / RAD; if (Math.abs(lamDeg) > 180) return null;
    return [Math.asin(s) / RAD, lamDeg];
  }

  // ---- the board frame ---------------------------------------------------------------------
  const ASPECT = 1.48;                     // oil_board.png and every plate since
  const FILL = 0.95;                       // the oval spans this much of the board's width
  const S = FILL * ASPECT / (2 * XMAX);    // EE units -> board heights
  const V0 = 0.395;                        // the equator's v (top of the oval .053, bottom .737)
  const rel = lon => ((lon - CM) % 360 + 540) % 360 - 180;   // longitude relative to CM, -180..180
  function uvRel(lat, lamRel) { const [x, y] = ee(lat, lamRel); return [0.5 + x * S / ASPECT, V0 - y * S]; }
  function uv(lat, lon) { return uvRel(lat, rel(lon)); }
  function llOfUV(u, v) { const r = eeInv((u - 0.5) * ASPECT / S, (V0 - v) / S); if (!r) return null; let lon = r[1] + CM; lon = ((lon + 540) % 360) - 180; return [r[0], lon]; }
  function outline(n) {                    // the oval's edge, clockwise from the north-west corner, in uv
    n = n || 90; const pts = [];
    for (let i = 0; i <= n; i++) pts.push(uvRel(90 - 180 * i / n, 180));
    for (let i = 0; i <= n; i++) pts.push(uvRel(-90 + 180 * i / n, -180));
    return pts;
  }

  // ---- WHERE EVERYTHING IS: real [lat, lon] -------------------------------------------------
  // oil-map.js `ll` wins when it has one (HQs, onshore, ports, the rig: the 1117 labels pass);
  // these are the rest (seas, straits, capes, the ice, the megastructures) plus a fallback for all.
  const LL = {
    // HQs (fallback — the same cities oil-map.js names in `full`)
    MILECASTLE: [57.15, -2.09], MINA: [55.76, 37.62], NIKOYL: [47.10, 51.90], HADDAD: [26.29, 50.11],
    BRIGHT: [39.90, 116.40], HARTSTARR: [29.76, -95.37], STOCK: [40.71, -74.00], PETRO_SUR: [10.48, -66.90],
    // the gates
    HORMUZ: [26.45, 56.55], SUEZ: [30.45, 32.35], BAB: [12.60, 43.40], MALACCA: [3.00, 100.60],
    PANAMA: [9.10, -79.70], GIBRALTAR: [35.95, -5.60], LAWRENCE: [48.30, -62.50],
    // open water
    NATLANTIC: [46.0, -38.0], BOSPHORUS: [41.10, 29.05], DANISH: [56.30, 11.60], INDIAN: [-8.0, 75.0], PACIFIC: [14.0, -165.0],
    // the long ways
    GOODHOPE: [-36.5, 19.5], HORN: [-57.0, -67.0], SOUTHERN: [-56.0, 150.0],
    // the ice
    NSR: [76.0, 122.0], NWP: [74.3, -90.0],
    // the ground (fallback)
    GENESEE: [43.02, -83.69], REFINERY_ROW: [29.90, -93.93], THE_DELTA: [4.85, 6.20],
    // the megastructures (CONCEPT sites — the Elevator must stand on the equator)
    SEACITY: [-12.0, -170.0], ANTARCTIC_BASE: [-67.8, 77.0], ELEVATOR: [0.0, 172.0],
    // the optional ports + the super-rig (fallback)
    LA: [33.74, -118.27], ALASKA: [61.13, -146.35], SIBERIA: [43.12, 131.89], JAPAN: [35.68, 139.77],
    AUSTRALIA: [-20.31, 118.58], RIG: [-25.40, -42.80],
  };

  // ---- THE LANES: intermediate waypoints for every route, keyed 'A>B' as written in oil-map.js ----
  // Real seaways: the Channel, the Sicily narrows, Messina, the Dardanelles, the Yucatán Channel, Cabot
  // and Belle Isle, Bab el-Mandeb, north of Socotra, the Singapore and Taiwan straits, Vilkitsky, Barrow…
  // A pipe follows the real line it models (Druzhba, CPC, Kazakhstan–China, ESPO, Colonial).
  const WAY = {
    // Europe & the Atlantic
    'MILECASTLE>DANISH': [[57.4, 3.5], [57.95, 8.5]],
    'DANISH>MINA': [[55.3, 14.5], [56.6, 19.0], [59.6, 23.5], [59.95, 28.8], [59.9, 30.3], [57.9, 33.5]],
    'MILECASTLE>MINA': [[56.3, 3.0], [54.3, 8.4], [53.06, 14.28], [52.55, 19.70], [52.05, 29.25], [52.85, 32.68]],
    'MILECASTLE>GIBRALTAR': [[54.5, 2.2], [51.1, 1.6], [50.0, -2.0], [49.4, -5.6], [45.0, -9.6], [38.5, -10.0], [36.4, -8.0]],
    'MILECASTLE>NATLANTIC': [[59.5, -1.5], [59.7, -8.0], [56.0, -20.0], [50.5, -30.0]],
    'NATLANTIC>LAWRENCE': [[45.2, -48.5], [46.2, -56.0], [47.5, -59.6]],
    'GIBRALTAR>SUEZ': [[36.6, -2.0], [37.4, 5.0], [37.25, 11.6], [34.6, 19.5], [32.3, 28.0], [31.35, 32.25]],
    'GIBRALTAR>BOSPHORUS': [[37.0, -0.5], [38.3, 7.0], [39.2, 12.5], [38.15, 15.62], [37.0, 18.5], [36.2, 22.6], [37.4, 24.8], [39.6, 25.5], [40.3, 26.4], [40.85, 28.2]],
    'GIBRALTAR>GOODHOPE': [[33.0, -11.5], [22.0, -20.5], [14.0, -21.0], [4.0, -14.0], [-6.0, -5.0], [-20.0, 3.5], [-31.5, 13.5]],
    'BOSPHORUS>MINA': [[42.6, 32.5], [44.3, 37.0], [46.4, 37.6], [47.1, 39.2], [51.5, 39.0]],
    // the Gulf, the Red Sea, the way east
    'SUEZ>BAB': [[27.6, 34.0], [20.5, 38.3], [15.5, 41.3]],
    'BAB>INDIAN': [[12.2, 46.5], [12.9, 50.5], [13.4, 54.5], [5.0, 64.0]],
    'HORMUZ>INDIAN': [[24.6, 58.6], [20.0, 62.5], [8.0, 70.0]],
    'HADDAD>HORMUZ': [[26.9, 51.2], [26.4, 53.8], [26.25, 55.9]],
    'INDIAN>MALACCA': [[5.0, 88.5], [6.2, 95.6], [5.6, 97.6], [4.2, 99.3]],
    'INDIAN>GOODHOPE': [[-18.0, 63.0], [-28.0, 52.0], [-35.0, 38.0], [-37.5, 26.0]],
    'MALACCA>BRIGHT': [[1.25, 104.0], [5.0, 107.0], [12.0, 111.5], [19.5, 115.0], [24.4, 119.5], [30.5, 123.3], [36.5, 123.0], [38.5, 120.6], [38.95, 117.9]],
    // overland: the pipelines (each follows the real line it models)
    'MINA>NIKOYL': [[52.0, 42.5], [48.7, 44.5], [47.3, 48.0]],
    'NIKOYL>HADDAD': [[44.2, 47.2], [40.40, 49.87], [38.1, 46.3], [33.3, 44.4], [30.5, 47.8]],
    'NIKOYL>BRIGHT': [[48.60, 57.10], [46.40, 65.30], [45.17, 82.57], [44.32, 84.85], [40.5, 96.5], [36.06, 103.8], [38.4, 111.0]],
    'MINA>BRIGHT': [[56.8, 60.6], [55.0, 73.4], [55.94, 98.00], [56.79, 105.76], [53.98, 123.90], [46.59, 125.10], [41.8, 123.4]],
    // the Americas
    'STOCK>HARTSTARR': [[39.9, -76.5], [36.07, -79.79], [33.75, -84.39], [31.5, -90.5]],
    'STOCK>LAWRENCE': [[42.7, -73.8], [45.3, -73.4], [46.8, -71.1], [48.3, -69.0], [49.35, -66.5], [49.3, -64.6]],
    'HARTSTARR>PETRO_SUR': [[28.6, -94.0], [25.0, -89.5], [21.9, -85.8], [17.2, -80.6], [13.6, -72.6], [11.4, -67.6]],
    'HARTSTARR>PANAMA': [[28.0, -95.5], [24.0, -91.0], [21.2, -86.6], [16.5, -83.4], [12.0, -80.6], [9.5, -79.9]],
    'PETRO_SUR>PANAMA': [[11.2, -68.6], [12.8, -71.4], [11.6, -76.0], [9.9, -79.0]],
    'PETRO_SUR>GOODHOPE': [[11.3, -64.5], [11.7, -60.2], [7.5, -51.0], [1.0, -38.0], [-8.0, -27.5], [-20.0, -11.0], [-30.0, 6.0]],
    'PETRO_SUR>HORN': [[11.0, -63.0], [10.9, -59.0], [6.0, -50.0], [0.0, -42.0], [-6.0, -33.6], [-15.0, -37.6], [-24.5, -42.5], [-35.0, -52.0], [-45.0, -62.5], [-52.0, -63.2], [-56.0, -64.6]],
    // the Pacific
    'PANAMA>PACIFIC': [[8.2, -79.5], [6.0, -85.0], [9.0, -120.0]],
    'HORN>PACIFIC': [[-55.6, -76.0], [-42.0, -80.5], [-22.0, -105.0], [-2.0, -140.0]],
    'PACIFIC>BRIGHT': [[23.0, 172.0], [30.2, 140.5], [31.4, 127.5], [36.0, 123.8], [38.4, 121.2], [39.0, 118.2]],
    'GOODHOPE>SOUTHERN': [[-44.0, 40.0], [-49.5, 90.0], [-53.5, 128.0]],
    'SOUTHERN>HORN': [[-58.0, -172.0], [-58.6, -125.0], [-58.2, -82.0]],
    'SOUTHERN>INDIAN': [[-46.0, 118.0], [-30.0, 96.0], [-16.0, 82.0]],
    'SOUTHERN>PACIFIC': [[-51.0, 172.0], [-31.0, -170.0], [-5.0, -164.0]],
    // the far south
    'SOUTHERN>ANTARCTIC_BASE': [[-61.5, 118.0], [-65.0, 92.0]],
    'ANTARCTIC_BASE>HORN': [[-65.5, 40.0], [-62.0, 0.0], [-60.0, -40.0], [-59.5, -58.0]],
    'ANTARCTIC_BASE>GOODHOPE': [[-60.0, 55.0], [-47.0, 32.0]],
    // onshore
    'STOCK>GENESEE': [[41.4, -78.0], [41.6, -81.0], [42.3, -83.05]],
    'HARTSTARR>REFINERY_ROW': [],
    'GIBRALTAR>THE_DELTA': [[33.5, -10.2], [21.5, -18.6], [12.5, -18.6], [3.9, -8.5], [3.6, 1.5]],
    'THE_DELTA>GOODHOPE': [[2.4, 6.0], [-5.0, 10.2], [-19.0, 10.4], [-31.0, 15.3]],
    // the tether
    'PACIFIC>ELEVATOR': [[8.0, -175.0]],
    // the north
    'MINA>NSR': [[61.0, 40.0], [64.6, 40.4], [66.3, 41.0], [68.9, 43.6], [70.6, 57.0], [74.6, 71.5], [77.0, 90.0], [77.95, 104.5]],
    'NSR>BRIGHT': [[73.2, 135.0], [71.2, 160.0], [69.6, -172.0], [65.9, -169.0], [60.0, -178.0], [51.5, 160.5], [43.0, 150.0], [34.0, 141.2], [31.2, 129.0], [36.4, 123.4], [38.6, 120.9], [39.0, 118.0]],
    'NSR>NWP': [[77.5, 150.0], [75.5, 175.0], [73.0, -160.0], [71.6, -140.0], [74.4, -120.0], [74.4, -105.0]],
    'NWP>LAWRENCE': [[74.2, -80.0], [72.0, -65.0], [64.0, -58.0], [55.0, -54.0], [52.5, -55.4], [51.3, -57.5], [49.9, -60.0]],
    // Sea City
    'PACIFIC>SEACITY': [],
    'SEACITY>BRIGHT': [[5.0, 150.0], [20.6, 121.6], [26.5, 122.4], [33.0, 123.6], [38.6, 120.9], [39.0, 118.0]],
    'SEACITY>HARTSTARR': [[2.0, -125.0], [12.0, -95.0], [16.8, -94.9], [19.0, -94.5], [25.5, -95.5]],
    // optional: BTC (THE PATH `geo` rule) — Baku, Tbilisi, then across Anatolia to the Straits
    'NIKOYL>BOSPHORUS': [[44.2, 47.2], [40.40, 49.87], [41.70, 44.80], [39.90, 41.30], [39.9, 32.9]],
    // optional: WEST COAST REACH + THE SUPER-RIG
    'HARTSTARR>LA': [[31.8, -106.4], [32.2, -111.0], [33.4, -116.0]],
    'LA>PACIFIC': [[31.0, -125.0], [22.0, -150.0]],
    'LA>ALASKA': [[38.0, -125.5], [48.5, -128.0], [57.5, -142.0]],
    'ALASKA>PACIFIC': [[55.0, -150.0], [35.0, -160.0]],
    'ALASKA>NWP': [[64.84, -147.70], [70.25, -148.34], [71.6, -140.0], [74.4, -120.0], [74.4, -105.0]],
    'ALASKA>SIBERIA': [[57.0, -155.0], [53.5, -170.0], [54.5, 168.0], [50.5, 157.5], [46.5, 145.5], [45.6, 141.9]],
    'SIBERIA>BRIGHT': [[38.0, 132.0], [34.6, 129.3], [33.2, 125.0], [36.4, 123.4], [38.6, 120.9], [39.0, 118.0]],
    'SIBERIA>MINA': [[48.48, 135.08], [53.98, 123.90], [56.79, 105.76], [55.94, 98.00], [55.0, 73.4], [56.8, 60.6]],
    'SIBERIA>NSR': [[45.6, 141.9], [51.5, 158.5], [60.0, -178.0], [65.9, -169.0], [69.6, -172.0], [71.2, 160.0], [73.2, 135.0]],
    'JAPAN>BRIGHT': [[34.9, 139.8], [33.4, 136.2], [32.4, 132.6], [30.6, 129.6], [33.0, 125.0], [36.4, 123.4], [38.6, 120.9], [39.0, 118.0]],
    'JAPAN>PACIFIC': [[34.0, 141.5], [30.0, 160.0], [20.0, -175.0]],
    'AUSTRALIA>MALACCA': [[-18.6, 117.6], [-12.0, 116.0], [-8.75, 115.75], [-6.4, 113.2], [-5.4, 108.0], [-2.2, 107.6], [1.0, 104.8]],
    'AUSTRALIA>PACIFIC': [[-13.0, 125.0], [-10.6, 138.0], [-10.2, 142.6], [-12.0, 155.0], [-10.0, 175.0], [0.0, -170.0]],
    'AUSTRALIA>SOUTHERN': [[-19.6, 115.6], [-22.4, 112.6], [-29.0, 112.6], [-35.6, 114.4], [-38.5, 125.0], [-45.0, 138.0]],
    'RIG>PETRO_SUR': [[-15.0, -36.5], [-6.0, -33.6], [0.0, -42.0], [6.0, -50.0], [10.9, -59.0], [11.0, -63.0]],
    'RIG>GOODHOPE': [[-28.0, -30.0], [-33.0, -5.0]],
    'RIG>HORN': [[-35.0, -51.0], [-45.0, -61.5], [-52.0, -63.0], [-56.0, -64.6]],
  };

  // ---- resolution ----------------------------------------------------------------------------
  const MAP = () => global.OIL_MAP || null;
  function llOf(code) {
    const MP = MAP();
    const p = MP && (MP.BY[code] || (MP.OPTIONAL_PLACES || []).find(q => q.code === code));
    if (p && Array.isArray(p.ll)) return p.ll;
    return LL[code] || null;
  }
  // DISPLAY NUDGES (presentation, in board uv). On a true-scale board two places can sit closer than their tokens:
  // Houston and Port Arthur are 140 km apart, which is under one HQ token. The place keeps its real ll; only the
  // token (and the ends of its lanes) shift, by the smallest amount that keeps them apart. Q1213.
  const NUDGE = { REFINERY_ROW: [0.02, -0.004], HORMUZ: [0.0075, 0.0025] };
  function at(code) { const ll = llOf(code); if (!ll) return null; const p = uv(ll[0], ll[1]), n = NUDGE[code]; return n ? [p[0] + n[0], p[1] + n[1]] : p; }
  function waysOf(a, b) {
    if (WAY[a + '>' + b]) return WAY[a + '>' + b].slice();
    if (WAY[b + '>' + a]) return WAY[b + '>' + a].slice().reverse();
    return null;
  }
  // densify a lat/lon polyline (≤ STEP° per piece, the short way round in longitude), project it,
  // and cut it at the Atlantic seam. Returns pieces of [u,v] (normalized board coords).
  const STEP = 1.5;
  function project(lls) {
    // walk an UNWRAPPED relative longitude (so a lane going the short way round never jumps), and cut
    // the line wherever it passes ±180° (the Atlantic seam): one piece ends at the right edge, the next
    // starts at the left (or the other way).
    const pts = [];
    let r = rel(lls[0][1]); pts.push([lls[0][0], r]);
    for (let i = 1; i < lls.length; i++) {
      const [pla, plo] = lls[i - 1], [la, lo] = lls[i];
      const d = ((lo - plo) % 360 + 540) % 360 - 180;          // the short way round
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(d), Math.abs(la - pla)) / STEP));
      const r0 = r;
      for (let k = 1; k <= n; k++) pts.push([pla + (la - pla) * k / n, r0 + d * k / n]);
      r = r0 + d;
    }
    const band = x => Math.floor((x + 180) / 360);
    const wrapR = (x, b) => x - 360 * b;
    const pieces = []; let cur = [uvRel(pts[0][0], wrapR(pts[0][1], band(pts[0][1])))];
    for (let i = 1; i < pts.length; i++) {
      const [la0, r0] = pts[i - 1], [la1, r1] = pts[i], b0 = band(r0), b1 = band(r1);
      if (b0 !== b1) {
        const edge = b1 > b0 ? 360 * b1 - 180 : 360 * b0 - 180, f = (edge - r0) / (r1 - r0), le = la0 + (la1 - la0) * f;
        cur.push(uvRel(le, b1 > b0 ? 180 : -180)); pieces.push(cur);
        cur = [uvRel(le, b1 > b0 ? -180 : 180)];
      }
      cur.push(uvRel(la1, wrapR(r1, b1)));
    }
    pieces.push(cur);
    return pieces;
  }
  const segLen = (a, b) => Math.hypot((b[0] - a[0]) * ASPECT, b[1] - a[1]);
  // a lane: the route A→B as drawn pieces + its arc length (in board heights)
  const _lanes = {};
  function lane(a, b) {
    const key = a + '>' + b; if (_lanes[key]) return _lanes[key];
    const A = llOf(a), B = llOf(b); if (!A || !B) return null;
    const w = waysOf(a, b);
    const pieces = project([A].concat(w || []).concat([B]));
    if (NUDGE[a]) pieces[0][0] = at(a);
    if (NUDGE[b]) { const l = pieces[pieces.length - 1]; l[l.length - 1] = at(b); }
    let L = 0; pieces.forEach(p => { for (let i = 1; i < p.length; i++) L += segLen(p[i - 1], p[i]); });
    return (_lanes[key] = { a, b, pieces, length: L, wraps: pieces.length > 1, authored: !!w });
  }
  // the point at fraction f (0..1) of a lane's arc length — where a ship under way sits
  function along(Ln, f) {
    f = Math.max(0, Math.min(1, f)); let want = Ln.length * f;
    for (const p of Ln.pieces) for (let i = 1; i < p.length; i++) {
      const l = segLen(p[i - 1], p[i]);
      if (want <= l || (p === Ln.pieces[Ln.pieces.length - 1] && i === p.length - 1)) {
        const t = l ? Math.min(1, want / l) : 0;
        return { at: [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t],
          heading: Math.atan2(p[i][1] - p[i - 1][1], (p[i][0] - p[i - 1][0]) * ASPECT) };
      }
      want -= l;
    }
    const last = Ln.pieces[Ln.pieces.length - 1]; return { at: last[last.length - 1], heading: 0 };
  }
  // the spaces of a route (k = 1..N-1) laid at equal arc length along the FREE part of the lane — the stretch
  // outside each end place's token (trimA/trimB, in board heights), so on a true-scale board a short route's
  // counters never sit on top of its ports. The 2D and 3D boards and the WORLD view all call this.
  function spaces(a, b, N, trimA, trimB) {
    const Ln = lane(a, b); if (!Ln) return [];
    let tA = trimA || 0, tB = trimB || 0;
    if (tA + tB > Ln.length * 0.8) { const k = Ln.length * 0.8 / (tA + tB); tA *= k; tB *= k; }
    const free = Ln.length - tA - tB, out = [];
    for (let k = 1; k < N; k++) { const pt = along(Ln, (tA + free * k / N) / Ln.length); out.push({ k, at: pt.at, heading: pt.heading }); }
    return out;
  }
  // the world's real pipelines (oil-map.js WORLD_PIPELINES, 1117) — each line + branch, projected
  function pipelines() {
    const MP = MAP(); if (!MP || !MP.WORLD_PIPELINES) return [];
    return MP.WORLD_PIPELINES.filter(P => Array.isArray(P.ll)).map(P => ({
      id: P.id, name: P.name, what: P.what, plays: P.plays || null, kind: P.kind || 'crude',
      pieces: project(P.ll).concat(Array.isArray(P.bll) ? project(P.bll) : []),
      ll: P.ll, bll: P.bll || null }));
  }

  const REG = { NUDGE, CM, ASPECT, FILL, V0, S, XMAX, YMAX, LL, WAY, ee, eeInv, uv, uvRel, llOfUV, outline,
    llOf, at, waysOf, project, lane, along, spaces, pipelines, segLen,
    // the deck panels the gateway draws THE KEY / THE DICE into (unchanged from the old board)
    DECK: { key: [0.135, 0.852, 0.685, 0.958], key2: [0.700, 0.852, 0.865, 0.958] } };
  global.OIL_GEO = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
