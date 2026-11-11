/* OiL! MOMENTUM — the ocean of oil carries you (docs/THE-MOMENTUM.md, CONCEPT, CORE-024).
   ============================================================================
   Designer, round 4: "add spaces on the board and change movement mechanics to give the players
   less control, as in they MUST move to not incur penalties as per the game's philosophy of the
   ocean of oil and the momentum… but like the game of life there should be things that might
   affect your game or perhaps gates or stop lines, etc. inspections… canal lines, players camping
   and incurring losses for strategy."

   PURE + DATA ONLY: the spaces on every route and the walk enumerator. The engine
   (src/oil-engine.js `_momentumPhase`) applies what a walk does. No new PLACES: every route on
   THE MAP is subdivided (SCALE spaces per move-cost), and the spaces between places get TYPES
   read off what the route already is. Every type, name and number here is a CONCEPT dial.

   THE SPACE TYPES (Game-of-Life style):
     STOP     every canal & strait (the 7 gates) + the two named straits that are not gates
              (the Turkish and Danish Straits): you must HALT on reaching one, movement left or not.
     INSPECT  the approach space into every port (HQ): customs / port-state control. Your record
              is read as you pass: clean sails through; dirty is HALTED there, fined, and — in a
              rival's home water — arrested (THE PRIVILEGE's admiralty arrest).
     EVENT    (CUT in round 8 — dial EVENTS, off: plain water; the draw is every turn, SEA_DRAW.)
              the middle of every open-water run: land on it and you draw — the
              ONLY draw at sea (folds into "draw where you land", fold 3; it adds no draws).
     CURRENT  the real ocean currents on routes that carry them (names CONCEPT placement): land on
              one and it pushes you on along your heading; the Weather body sets how hard.
     HAZARD   (CUT in round 7 — dial HAZARDS, off: rough water is plain water.) Rough water on every
              route touching a cape, the ice or the Southern Ocean: land on it and the Weather body
              decides — a high Weather is a STORM (cargo over the side), a 1 is the DOLDRUMS
              (becalmed: you sit out your next move, at no camping cost).
*/
(function (global) {
  'use strict';
  const MOM_DIALS = {
    SCALE: 2,                 // spaces per point of route cost (a cost-1 hop becomes a 2-space run)
    PACE: 2,                  // movement points per step the dice give (keeps the old pace on average)
    STOPS_EXTRA: ['BOSPHORUS', 'DANISH'],   // named straits that are stop lines without being gates
    INSPECT_FINE: 6,          // $ a dirty ship pays at inspection (to the house)
    INSPECT_HEAT: 1,          // + exposure: it is on the record that you were stopped
    DIRTY_GAP: 8,             // "dirty" = exposure this far over the cleanest seat (THE PRIVILEGE's step)
    CURRENT_PUSH: 1,          // spaces a current carries you on...
    CURRENT_STRONG: 4,        // ...+1 more when the Weather body is this high
    STORM_AT: 6,              // Weather body at/above this on a HAZARD space = a storm
    STORM_BARREL: 1,          // barrels a storm takes
    CALM_AT: 1,               // Weather body at/below this on a HAZARD space = the doldrums
    HAZARDS: false,           // ROUND 7 — THE CHISEL: HAZARD water (storm / doldrums) CUT. Measured in oil-crunch
                              // (200 paired games): 0.08 storms + 0.03 doldrums a game, no measurable effect on
                              // length, ending, balance or decisions — pure rules weight. With this off the HAZARD
                              // type is never assigned: rough water is plain water (no ⚠ on the board). true
                              // restores round 6 (the code below and in the engine is kept, dormant).
    EVENTS: false,            // ROUND 8 — EVENT spaces CUT (designer: "event spaces as well"). Measured 0.04–0.06
                              // a game in the round-7 crunch: the bots almost never end a move on one. Off: the
                              // EVENT type is never assigned (open water is plain water). true restores round 7.
    SEA_DRAW: 'always',       // the draw at sea. 'always' (round 8): you draw one card every turn, at sea from the
                              // FREEDOM-MARKET deck — the one sheet's "draw one card a turn", no exception.
                              // 'event' (rounds 4–7): at sea only an EVENT space dealt ("the only draw at sea").
    // CAMPING — DEMURRAGE. Staying put is allowed, and it is charged, escalating per turn camped.
    DEMURRAGE: [0, 3, 6, 10],     // $ by consecutive turn camped (1st, 2nd, 3rd+)
    DEMURRAGE_EXP: [0, 0, 1, 2],  // exposure by consecutive turn camped
    CAMP_HEAT: 1,             // CRISIS: heat on the place from the 2nd camped turn (a berth nobody can use)
    CAMP_CAP: 3,              // escalation stops here: camping is expensive, never a death spiral
    PIRATES: false,           // THE PRIVILEGE's PIRATES on? (the engine sets it) — marks ☠ PIRATE spaces
    // bot temperament (not rules)
    CAMP_BIAS: 3,             // how much a bot dislikes camping per turn already camped
  };

  // the real currents, by the route they run along (placement CONCEPT; names are the oceans' own)
  const CURRENTS = {
    'the North Atlantic run': 'the Gulf Stream', 'the Grand Banks': 'the Labrador Current',
    'the Pacific crossing': 'the Kuroshio', 'the southern Indian Ocean': 'the Agulhas',
    'into the Forties': 'the West Wind Drift', 'the Drake Passage approach': 'the West Wind Drift',
    'the southern Indian Ocean run': 'the West Wind Drift', 'the South Pacific': 'the West Wind Drift',
    'the West Africa run': 'the Canary Current', 'the Brazil run': 'the Brazil Current',
  };

  // where real piracy lives, by the routes already on THE MAP (designer round 5): the Gulf of Aden
  // and the Arabian Sea (off the Horn of Africa), the Red Sea (today's attacks on shipping), the Strait of
  // Malacca's approaches, the Gulf of Guinea, and the Caribbean off the Orinoco (today's armed robbery
  // at sea off Venezuela). CONCEPT placement.
  // WHO boards you there (designer 2026-10-23: "caribbean pirate might be dated, but we can perhaps make it as if its
  // piracy another way and put it in the same boat"). Same space, same house throw, same body held — only the flag
  // changes. The Caribbean run: THE EMBARGO (designer 2026-10-23: "call it an embargo, cuba style") — the sanctions
  // line around a country nobody may trade with; a tanker caught running it is stopped and held. Piracy with a flag.
  const PIRATE_WHO = { 'the Caribbean run': 'the embargo' };
  const PIRATE_WATERS = ['the Gulf of Aden', 'the Arabian Sea', 'the Red Sea', 'the Bay of Bengal', 'the South China Sea', 'the Gulf of Guinea run', 'the West Africa coast', 'the Caribbean run'];

  const MP = () => global.OIL_MAP || {};
  const _cache = {};
  // the spaces of one route, indexed from R[0] (k = 0 is R[0], k = N is R[1]); types for 1..N-1
  function spacesOf(rid, dials) {
    const D = Object.assign({}, MOM_DIALS, dials || {});
    const key = rid + ':' + D.SCALE + ':' + (D.PIRATES ? 1 : 0) + ':' + (D.HAZARDS ? 1 : 0) + ':' + (D.EVENTS ? 1 : 0);
    if (_cache[key]) return _cache[key];
    const M = MP(), R = M.ROUTES[rid] || (M.OPT_BY_ID && M.OPT_BY_ID[rid]) || (M.OPTIONAL_ROUTES && Object.values(M.OPTIONAL_ROUTES)[0]);
    const N = Math.max(1, R[2] * D.SCALE), types = new Array(N + 1).fill(null);
    const A = M.BY[R[0]] || {}, B = M.BY[R[1]] || {};
    const rough = [A.kind, B.kind].some(k => k === 'cape' || k === 'arctic');
    const current = CURRENTS[R[3]] || null;
    const land = k => k === 'hq' || k === 'onshore';
    const pipe = land(A.kind) && land(B.kind);
    for (let k = 1; k < N; k++) types[k] = current ? 'CURRENT' : (rough && D.HAZARDS) ? 'HAZARD' : null;
    if (!pipe) {                                       // a pipeline has no customs house and no weather
      if (!current && !rough && D.EVENTS) types[Math.ceil(N / 2)] = 'EVENT';     // the open sea's news, mid-run
      if (A.kind === 'hq' && N > 1) types[1] = 'INSPECT';
      if (B.kind === 'hq' && N > 1) types[N - 1] = 'INSPECT';
    }
    // ☠ PIRATE: pirate waters carry pirate spaces (only with THE PRIVILEGE's pirates on) — landing
    // on one, or halting there, is a house throw. They take the place of plain / event / hazard water.
    const pirate = D.PIRATES && PIRATE_WATERS.indexOf(R[3]) >= 0;
    if (pirate) for (let k = 1; k < N; k++) if (types[k] !== 'INSPECT' && types[k] !== 'CURRENT') types[k] = 'PIRATE';
    return (_cache[key] = { rid, N, types, a: R[0], b: R[1], label: R[3], current, pirate });
  }
  function isStop(code, dials) {
    const D = Object.assign({}, MOM_DIALS, dials || {});
    const pl = (MP().BY || {})[code]; if (!pl) return false;
    return pl.kind === 'gate' || D.STOPS_EXTRA.indexOf(code) >= 0;
  }

  // ---- every way this turn's momentum can carry you --------------------------------------
  // pos = { at } (at a place) or { under: { rid, k, dir } } (on a route; dir +1 = toward R[1]).
  // Walk EXACTLY `points` spaces; the only early ends are: a STOP line (must halt), a dirty ship
  // HALTED at an INSPECTION, or choosing to PUT IN at a port you reach. No turning back on the
  // route you just sailed (unless it is the only way on). Returns de-duplicated end states.
  // ctx = { state (mapState), dials, dirty: bool, canPutIn(code) -> bool }
  function walks(pos, points, ctx) {
    const M = MP(), D = Object.assign({}, MOM_DIALS, ctx.dials || {}), out = [], seen = {};
    const add = w => { const key = w.under ? `@${w.under.rid}:${w.under.k}:${w.under.dir}` : w.at;
      if (seen[key]) return; seen[key] = 1; w.key = key; out.push(w); };
    // walk along route `sp` from index k in direction dir with r points left
    const along = (sp, k, dir, r, trail, cameBy) => {
      const end = dir > 0 ? sp.N : 0;
      const endCode = dir > 0 ? sp.b : sp.a;
      while (r > 0) {
        if (k + dir === end && !M.placeOpen(endCode, ctx.state)) {        // the way ahead is SHUT: ride at anchor
          add({ under: { rid: sp.rid, k, dir }, at: endCode, trail, halted: 'closed', left: Math.abs(end - k) }); return; }
        k += dir; r--;
        if (k === end) { atNode(dir > 0 ? sp.b : sp.a, r, trail.concat([{ node: dir > 0 ? sp.b : sp.a }]), sp.rid); return; }
        const t = sp.types[k];
        const step = { rid: sp.rid, k, type: t };
        if (t === 'INSPECT' && ctx.dirty) { add({ under: { rid: sp.rid, k, dir }, at: dir > 0 ? sp.b : sp.a, trail: trail.concat([step]), halted: 'inspect', left: Math.abs(end - k) }); return; }
        trail = trail.concat([step]);
      }
      add({ under: { rid: sp.rid, k, dir }, at: dir > 0 ? sp.b : sp.a, trail, landed: sp.types[k], left: Math.abs(end - k) });
    };
    const atNode = (code, r, trail, cameBy) => {
      if (r <= 0) { add({ at: code, trail }); return; }
      if (trail.length && isStop(code, D)) { add({ at: code, trail, halted: 'stop' }); return; }
      if (trail.length && ctx.canPutIn && ctx.canPutIn(code)) add({ at: code, trail, putIn: true });
      const routes = (M.ADJ[code] || []).filter(rt => M.routeOpen(rt, code, ctx.state));
      const onward = routes.filter(rt => rt.id !== cameBy);
      const use = onward.length ? onward : routes;
      if (!use.length) { add({ at: code, trail, stuck: true }); return; }
      use.slice().sort((x, y) => String(x.id).localeCompare(String(y.id))).forEach(rt => {
        if (typeof rt.id !== 'number' && !(M.OPT_BY_ID && M.OPT_BY_ID[rt.id] && M.OPT_BY_ID[rt.id].sub)) return;   // optional routes: not subdivided here (WEST COAST ones are)
        const sp = spacesOf(rt.id, D), fwd = sp.a === code;
        along(sp, fwd ? 0 : sp.N, fwd ? 1 : -1, r, trail, rt.id);
      });
    };
    if (pos.under) {
      const sp = spacesOf(pos.under.rid, D);
      along(sp, pos.under.k, pos.under.dir, points, [], pos.under.rid);
    } else atNode(pos.at, points, [], null);
    return out;
  }

  const REG = { MOM_DIALS, CURRENTS, PIRATE_WATERS, PIRATE_WHO, spacesOf, isStop, walks };
  global.OIL_MOMENTUM = REG;
  if (typeof module !== 'undefined' && module.exports) module.exports = REG;
})(typeof window !== 'undefined' ? window : globalThis);
