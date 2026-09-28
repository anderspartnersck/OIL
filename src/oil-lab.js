/* OiL! LAB — shared analysis library for THE DICINER + the TESTING SUITE.
   ============================================================================
   One source of truth for: the three-body shove enumeration, the green-die rate,
   the in-engine balance sweep, and the franchise-law report. Drives the REAL
   engine (src/oil-engine.js) — never re-implements the rules. Pure of any DOM, so
   it runs identically in the browser (diciner.html / test-lab.html) and in Node
   (scripts/oil-lab-check.js). Model A is LOCKED (CORE-002); the dice are dials. */
(function (global) {
  'use strict';
  const OilGame = global.OilGame;
  const BASE = global.OIL_DIALS || {};
  const EDD_OIL_REASON = /oil ran out/i;   // engine's two end_reason strings (oil vs price)

  // ---- enumerate the price-shove distribution for given faces + weights -------
  // The whole point of model A: read three sorted dice as ONE emergent number.
  // Mean must be ~0 (Charter E1, no house drift); this surfaces drift instantly.
  function enumerateShove(faces, weights) {
    const F = (faces && faces.length) ? faces.slice() : [1, 2, 3, 4, 5, 6];
    const W = (weights && weights.length === 3) ? weights.slice() : [1, -2, 1];
    const dist = {}; let sum = 0, sumsq = 0, n = 0, min = Infinity, max = -Infinity;
    for (const a of F) for (const b of F) for (const c of F) {
      const s = [a, b, c].sort((x, y) => x - y);
      const v = W[0] * s[0] + W[1] * s[1] + W[2] * s[2];
      dist[v] = (dist[v] || 0) + 1; sum += v; sumsq += v * v; n++;
      if (v < min) min = v; if (v > max) max = v;
    }
    const mean = sum / n, variance = sumsq / n - mean * mean, std = Math.sqrt(Math.max(0, variance));
    const chaosFrac = T => { let c = 0; for (const k in dist) if (Math.abs(+k) >= T) c += dist[k]; return c / n; };
    const symmetric = Object.keys(dist).every(k => (+k === 0) || dist[k] === (dist[-k] || 0));
    return { dist, mean, std, n, min, max, chaosFrac, symmetric, faces: F, weights: W };
  }

  // green die (a d6) intervenes when it rolls >= trigger -> fraction of the 6 faces
  function greenRate(trigger) { return Math.max(0, Math.min(6, 7 - trigger)) / 6; }

  // worst-case reachability of the oil clock under a dial set (Charter L2/E3):
  // slowest burn = price pinned at the minimum. If floor burn >= 1, oil is
  // strictly monotonic down and E.D.D. is provably reachable.
  function reachability(dials) {
    const D = Object.assign({}, BASE, dials || {});
    const minBurn = D.BURN_BASE + Math.floor(D.PRICE_MIN / D.BURN_PER_PRICE);
    return { minBurn, worstTurnsToDry: Math.ceil(D.OIL_START / Math.max(1, minBurn)), monotonic: minBurn >= 1 };
  }

  // yield to the event loop so the browser can repaint the progress bar between
  // chunks (setTimeout, not rAF — rAF is paused in headless/background tabs).
  const yieldUI = () => (typeof window !== 'undefined' ? new Promise(r => setTimeout(r, 0)) : Promise.resolve());

  // ---- run a batch of bot games and collect per-game summaries ----------------
  // opts: { count, dials, edition, expansion('mix'|bool), cards, asym, factions,
  //         deals, dealDials, map, mapDials, nPlayers('mix'|num), seed0, onProgress(done,total) }
  async function runBatch(opts) {
    opts = opts || {};
    const count = opts.count || 300, seed0 = opts.seed0 || 4000;
    const POL = ['random', 'greedy', 'stable'];
    const FCODES = opts.factions && opts.factions.length ? opts.factions.slice() : null;
    const games = [];
    const tick = Math.max(1, Math.floor(count / 60));
    for (let i = 0; i < count; i++) {
      const np = opts.nPlayers === 'mix' ? 2 + (i % 7) : Math.max(2, Math.min(8, opts.nPlayers || 5));
      const exp = opts.expansion === 'mix' ? (i % 2 === 0) : (opts.expansion !== false);
      const pol = Array.from({ length: np }, (_, k) => POL[(i + k) % POL.length]);
      const facs = (opts.asym && FCODES) ? Array.from({ length: np }, (_, k) => FCODES[(i + k) % FCODES.length]) : null;
      const g = new OilGame({
        seed: seed0 + i, n_players: np, expansion: exp, policies: pol,
        edition: opts.edition || 'classic', dials: opts.dials || {},
        cards: !!opts.cards, factions: facs, asym: !!(opts.asym && facs),
        deals: !!opts.deals, dealDials: opts.dealDials || {},
        map: !!opts.map, mapDials: opts.mapDials || {},
        crisis: !!opts.crisis, crisisDials: opts.crisisDials || {},
        path: opts.path || undefined,          // THE PATH (docs/THE-PATH.md); absent = baseline
      });
      facs && facs.forEach((c, k) => { if (g.players[k]) g.players[k].faction = g.players[k].faction || c; });
      await g.run();
      const w = g.winner;
      games.push({
        len: g.turn, rounds: g.round, finalPrice: g.price, oil: g.oil, edd: g.edd,
        reason: g.end_reason, eddPath: EDD_OIL_REASON.test(g.end_reason || '') ? 'oil' : 'price',
        maxTurnHit: g.turn >= g.maxTurns,
        winFaction: (w && w.faction) || null, winPolicy: (w && w.policy) || null,
        winExposure: w ? w.exposure : 0, winControl: w ? w.control : 0,
        leadGap: (() => { const c = g.players.map(p => p.control).sort((a, b) => b - a); return c[0] - (c[1] || 0); })(),
        np, exp, facs,
        deals: g.deals ? Object.assign({}, g.dealStats) : null,
        map: g.map ? Object.assign({}, g.mapStats) : null,
        crisis: g.crisis ? Object.assign({}, g.crisisStats) : null,
        endPath: /on fire/.test(g.end_reason || '') ? 'annihilation'
          : /oil ran out/.test(g.end_reason || '') ? 'oil' : 'price',
        oilAdded: g._oilAdded || 0, hqSplit: g._hqSplit || 0,
        winGrudges: (w && w.grudges) ? w.grudges.length : 0,
        ctrlTo: g.events.filter(e => e.type === 'control' && e.to).length,   // buyers/places taken (settle reads)
        path: g.path ? Object.assign({}, g.pathStats, {
          ctrlTo: g.events.filter(e => e.type === 'control' && e.to).length,
          raised: g.mapStats.structures, exp: g.expansion }) : null,
      });
      if (opts.onProgress && (i % tick === 0 || i === count - 1)) { opts.onProgress(i + 1, count); await yieldUI(); }
    }
    return games;
  }

  // ---- franchise-law report over a batch (mirrors scripts/oil-sweep.js) -------
  function lawReport(games, dials) {
    const N = games.length || 1;
    const eddAll = games.filter(g => g.edd).length;
    const oilDry = games.filter(g => g.oil <= 0).length;
    const maxHit = games.filter(g => g.maxTurnHit).length;
    const spike = games.filter(g => g.eddPath === 'price').length;
    const oilOut = games.filter(g => g.eddPath === 'oil').length;
    const lens = games.map(g => g.len).sort((a, b) => a - b);
    const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
    const avgWinExp = games.reduce((a, g) => a + g.winExposure, 0) / N;
    const avgLeadGap = games.reduce((a, g) => a + g.leadGap, 0) / N;
    const reach = reachability(dials);

    // win-rate by faction (wins / appearances) + by policy
    const appear = {}, fwins = {}, pwins = {};
    games.forEach(g => {
      (g.facs || []).forEach(c => { appear[c] = (appear[c] || 0) + 1; });
      if (g.winFaction) fwins[g.winFaction] = (fwins[g.winFaction] || 0) + 1;
      if (g.winPolicy) pwins[g.winPolicy] = (pwins[g.winPolicy] || 0) + 1;
    });
    const facRates = Object.keys(appear).map(c => ({ code: c, rate: fwins[c] ? fwins[c] / appear[c] : 0, wins: fwins[c] || 0, n: appear[c] }))
      .sort((a, b) => b.rate - a.rate);
    const hi = facRates[0], lo = facRates[facRates.length - 1];

    const laws = [
      { id: 'L1', name: 'defined terminus — E.D.D. always fires', pass: eddAll === N, detail: `${eddAll}/${N}` },
      { id: 'L2/E3', name: 'reachable clock — oil always hits 0', pass: oilDry === N, detail: `${oilDry}/${N}` },
      { id: 'safety', name: 'no game hits the maxTurns cap', pass: maxHit === 0, detail: `${maxHit}/${N}` },
      { id: 'E3', name: 'floor burn ≥ 1 (oil monotonic down)', pass: reach.monotonic, detail: `burn ${reach.minBurn}/turn → dry ≤ ${reach.worstTurnsToDry} turns worst case` },
      { id: 'trigger', name: 'both E.D.D. paths fire (no dead trigger)', pass: spike > 0 && oilOut > 0, detail: `spike ${spike} · oil-out ${oilOut}` },
    ];
    if (facRates.length) {
      laws.push({ id: 'no-dom', name: 'no dominant faction (top < 45%)', pass: hi.rate < 0.45, detail: `${hi.code} ${(100 * hi.rate).toFixed(0)}%` });
      laws.push({ id: 'no-dead', name: 'no dead faction (bottom > 5%)', pass: lo.rate > 0.05, detail: `${lo.code} ${(100 * lo.rate).toFixed(0)}%` });
    }
    const allPass = laws.every(l => l.pass);
    return {
      N, laws, allPass,
      stats: { eddAll, oilDry, maxHit, spike, oilOut, spikePct: spike / N, oilOutPct: oilOut / N,
        median, lenMin: lens[0] || 0, lenMax: lens[lens.length - 1] || 0, avgWinExp, avgLeadGap },
      facRates, pwins,
    };
  }

  // ---- COMPETITIVE-INCIDENCE analyzer (the "deck creates swings" proof) -------
  // The roadmap's card pass kills the "solitaire self-buff" (a card that only
  // touches the player who plays it). We classify each card by running its REAL
  // fx (src/oil-cards.js) on a neutral fixture and diffing the table:
  //   touchesRival  — any OPPONENT meter (control/barrels/value/exposure/pips) moved
  //   touchesPrice  — the SHARED price LEVEL moved (a market swing everyone revalues to)
  //   touchesEra    — era flipped (shared state, but not an inter-player swing)
  //   touchesClock  — oil burned (shared collapse pressure, not a swing)
  //   touchesSelf   — the active player's own meters moved
  // A card is COMPETITIVE iff it creates a swing: touchesRival || touchesPrice.
  // (era/clock/self alone do NOT make a card competitive — that's the whole point.)
  // The player meters we diff, in order:
  const _METERS = ['control', 'barrels', 'value', 'exposure', 'pips'];

  // a neutral mid-game fixture: 4 seats, the ACTIVE player (p0) is middle-of-pack
  // so leader/richest-targeting cards have a real victim (p1 leads AND is richest).
  function _fixture(OG, seed, shove) {
    const g = new OG({ n_players: 4, cards: true, seed: seed || 1, expansion: true });
    g.price = 50; g.era = 'STABLE'; g.oil = 40; g.lastShove = shove || 0;
    const seats = [
      { control: 2, barrels: 2, value: 20, exposure: 2, pips: 1 },  // p0 — active, middle
      { control: 5, barrels: 4, value: 60, exposure: 2, pips: 1 },  // p1 — leader + richest
      { control: 3, barrels: 2, value: 30, exposure: 2, pips: 1 },
      { control: 1, barrels: 1, value: 10, exposure: 2, pips: 1 },
    ];
    g.players.forEach((p, i) => Object.assign(p, seats[i]));
    return g;
  }
  function _snap(g) {
    return {
      players: g.players.map(p => _METERS.map(m => p[m])),
      price: g.price, era: g.era, oil: g.oil,
    };
  }
  // classify ONE card. Unions the touch-flags across sign-of-shove fixtures so a
  // price card whose sign tracks lastShove (Ocean of Monsters / Dog-Wagged) reads true.
  function analyzeCard(name, opts) {
    opts = opts || {};
    const OG = global.OilGame;
    const FX = (OG && OG.CARD_FX) || global.OIL_CARD_FX || {};
    const entry = FX[name];
    const flags = { touchesSelf: false, touchesRival: false, touchesPrice: false, touchesEra: false, touchesClock: false };
    if (!entry || !entry.fx) return Object.assign({ name, deck: '?', wired: false, competitive: false, noop: true }, flags);
    for (const shove of [2, -2]) {
      const g = _fixture(OG, 100 + (shove > 0 ? 1 : 2), shove);
      const before = _snap(g);
      try { g.playCard(name, g.players[0]); } catch (e) { /* a card that throws on the fixture is still classified by what it managed to change */ }
      const after = _snap(g);
      if (before.players[0].some((v, k) => v !== after.players[0][k])) flags.touchesSelf = true;
      for (let i = 1; i < before.players.length; i++)
        if (before.players[i].some((v, k) => v !== after.players[i][k])) flags.touchesRival = true;
      if (before.price !== after.price) flags.touchesPrice = true;
      if (before.era !== after.era) flags.touchesEra = true;
      if (before.oil !== after.oil) flags.touchesClock = true;
    }
    const competitive = flags.touchesRival || flags.touchesPrice;
    const noop = !flags.touchesSelf && !flags.touchesRival && !flags.touchesPrice && !flags.touchesEra && !flags.touchesClock;
    return Object.assign({ name, deck: entry.deck, wired: true, competitive, noop }, flags);
  }
  // classify a whole deck (or all cards if deck omitted) -> rows + summary.
  function deckIncidence(deck) {
    const FX = (global.OilGame && global.OilGame.CARD_FX) || global.OIL_CARD_FX || {};
    const names = Object.keys(FX).filter(n => !deck || FX[n].deck === deck);
    const rows = names.map(analyzeCard);
    const selfBuffs = rows.filter(r => !r.competitive && !r.noop).map(r => r.name);
    const noops = rows.filter(r => r.noop).map(r => r.name);
    return {
      deck: deck || 'ALL', total: rows.length,
      competitive: rows.filter(r => r.competitive).length,
      selfBuffs, noops, rows,
    };
  }


  // ---- THE TABLE analyzer (the "deals are clean AND competitive" proof) -------
  // The negotiation layer (src/oil-deals.js) is only allowed to move PEOPLE. It
  // may never move the shared price (the market has no house drift, Charter E1)
  // and it may never touch the oil clock (the collapse stays monotonic, L2/E3).
  // It must also create a SWING — the same grammar CORE-010 locked for cards.
  // We prove all three by running each deal type's REAL verbs (form -> tick ->
  // broke) on a neutral fixture and diffing the table at every stage.
  function _dealFixture(OG) {
    const g = new OG({ n_players: 4, seed: 77, expansion: true, deals: true });
    g.price = 50; g.era = 'STABLE'; g.oil = 40; g.lastShove = 0;
    const seats = [
      { control: 2, barrels: 2, value: 40, exposure: 4, pips: 2 },  // p0 — the offerer
      { control: 3, barrels: 2, value: 40, exposure: 4, pips: 2 },  // p1 — the counterparty
      { control: 5, barrels: 4, value: 60, exposure: 2, pips: 2 },  // p2 — the biggest operator (scapegoat)
      { control: 1, barrels: 1, value: 10, exposure: 2, pips: 2 },
    ];
    g.players.forEach((p, i) => Object.assign(p, seats[i]));
    return g;
  }
  // diff one stage: which side of the table moved?
  function _stageDiff(before, after) {
    const rival = before.players.some((row, i) => i > 0 && row.some((v, k) => v !== after.players[i][k]));
    return {
      self: before.players[0].some((v, k) => v !== after.players[0][k]),
      rival, price: before.price !== after.price, oil: before.oil !== after.oil, era: before.era !== after.era,
    };
  }
  function analyzeDeal(type) {
    const OG = global.OilGame, REG = global.OIL_DEALS_FX || {};
    const T = (REG.TYPES || {})[type];
    const base = { type, wired: false, standing: false, legal: false, stages: [], touchesRival: false, touchesPrice: false, touchesClock: false, competitive: false };
    if (!T) return base;
    const g = _dealFixture(OG), a = g.players[0], b = g.players[1];
    const out = Object.assign(base, { wired: true, standing: !!T.standing, legal: !!T.ok(g, a, b) });
    if (!out.legal) return out;
    const d = { uid: 1, type, a, b, ticks: g.dealDials.LIFE, paid: 0, carried: 0 };
    const stage = (label, fn) => {
      const before = _snap(g); try { fn(); } catch (e) { /* a stage that throws is still judged by what it moved */ }
      const df = _stageDiff(before, _snap(g));
      out.stages.push(Object.assign({ label }, df));
      out.touchesRival = out.touchesRival || df.rival;
      out.touchesPrice = out.touchesPrice || df.price;
      out.touchesClock = out.touchesClock || df.oil;
    };
    stage('form', () => { T.form && T.form(g, d); if (T.standing) g.standing.push(d); });
    if (T.standing) {
      stage('tick', () => T.tick && T.tick(g, d));
      stage('break', () => g._breakDeal(d, a));
    }
    out.competitive = out.touchesRival;      // a deal that moves nobody else is not a deal
    out.clean = !out.touchesPrice && !out.touchesClock;
    return out;
  }
  function dealIncidence() {
    const REG = global.OIL_DEALS_FX || {};
    const rows = Object.keys(REG.TYPES || {}).map(analyzeDeal);
    return {
      total: rows.length,
      competitive: rows.filter(r => r.competitive).length,
      clean: rows.filter(r => r.clean).length,
      dirty: rows.filter(r => !r.clean).map(r => r.type),
      solitaire: rows.filter(r => !r.competitive).map(r => r.type),
      rows,
    };
  }
  // aggregate THE TABLE's behaviour over a runBatch (proves nothing is a dead trigger)
  function dealReport(games) {
    const keys = ['offers', 'formed', 'declined', 'ticks', 'broken', 'lapsed', 'spared', 'revenge'];
    const tot = {}; keys.forEach(k => { tot[k] = 0; });
    let n = 0;
    games.forEach(g => { if (!g.deals) return; n++; keys.forEach(k => { tot[k] += g.deals[k] || 0; }); });
    const acceptRate = tot.offers ? tot.formed / tot.offers : 0;
    const betrayRate = tot.formed ? tot.broken / tot.formed : 0;
    return { n, tot, acceptRate, betrayRate, perGame: n ? tot.formed / n : 0 };
  }


  // ---- THE MAP auditor -------------------------------------------------------
  // A shipping board has one catastrophic failure mode: somebody gets STRANDED —
  // a seat that cannot reach the rest of the world, and therefore cannot play.
  // So the static audit proves the network is sound no matter what is shut, and
  // that every closure is finite. Everything else about the map is taste; this
  // is correctness.
  function mapAudit() {
    const MP = global.OIL_MAP;
    const out = { ok: false, checks: [] };
    if (!MP) { out.checks.push({ id: 'loaded', pass: false, detail: 'src/oil-map.js not loaded' }); return out; }
    const add = (id, pass, detail) => out.checks.push({ id, pass: !!pass, detail });

    // 1. well-formed
    const known = {}; MP.PLACES.forEach(p => { known[p.code] = 1; });
    const badRoute = MP.ROUTES.find(R => !known[R[0]] || !known[R[1]] || !(R[2] > 0));
    add('well-formed', !badRoute, badRoute ? 'bad route ' + JSON.stringify(badRoute)
      : `${MP.PLACES.length} places · ${MP.ROUTES.length} routes · all endpoints known, all costs > 0`);
    add('hq-set', MP.HQS.length === 8, `${MP.HQS.length} HQs (the designer's locked 8-HQ board)`);

    // 2. nobody is ever stranded — the load-bearing one
    add('connected-open', MP.hqsConnected({}), 'all 8 HQs mutually reachable with nothing shut');
    const allShut = { closed: {} }; MP.GATES.forEach(g => { allShut.closed[g] = 99; });
    add('connected-allshut', MP.hqsConnected(allShut),
      `all 8 HQs STILL mutually reachable with every one of the ${MP.GATES.length} gates shut — nobody can be stranded`);
    // and with every gate shut, each HQ still has at least one way out
    const orphan = MP.HQS.filter(h => MP.trafficAt(h, allShut).open === 0);
    add('no-orphan-hq', orphan.length === 0, orphan.length ? 'orphaned: ' + orphan.join(', ')
      : 'every HQ keeps at least one open route with all gates shut');

    // 3. the north and the sea city are shut until somebody builds them
    const arctics = MP.PLACES.filter(p => p.kind === 'arctic').map(p => p.code);
    add('arctic-iced', arctics.every(c => !MP.placeOpen(c, {})) && arctics.every(c => MP.placeOpen(c, { built: { ARCTIC_DEV: true } })),
      `${arctics.join(' / ')} closed until Arctic Development, open after`);
    const built = MP.PLACES.filter(p => p.kind === 'built').map(p => p.code);
    add('built-absent', built.every(c => !MP.placeOpen(c, {})), `${built.join(' / ')} absent until raised`);

    // 4. the megastructures must actually REDRAW the world (not just score)
    const dOf = (a, b, st) => MP.reach(a, 99, st || {}).dist[b];
    const arcticGain = dOf('MINA', 'BRIGHT', {}) - dOf('MINA', 'BRIGHT', { built: { ARCTIC_DEV: true } });
    add('arctic-redraws', arcticGain > 0, `Arctic Development shortens Volga→Mainland by ${arcticGain} (${dOf('MINA','BRIGHT',{})} → ${dOf('MINA','BRIGHT',{built:{ARCTIC_DEV:true}})})`);
    const seaGain = dOf('HARTSTARR', 'BRIGHT', {}) - dOf('HARTSTARR', 'BRIGHT', { built: { SEA_CITY: true } });
    add('seacity-redraws', seaGain > 0, `Sea City shortens Gulf Coast→Mainland by ${seaGain} — "changes shipping"`);

    // 5. shutting a gate must actually cost somebody distance (gates aren't decor)
    const bite = MP.GATES.map(gcode => {
      const st = { closed: { [gcode]: 99 } };
      let worst = 0;
      for (const a of MP.HQS) for (const b of MP.HQS) {
        if (a === b) continue;
        const o = dOf(a, b, {}), c = dOf(a, b, st);
        if (o !== undefined && c !== undefined && c - o > worst) worst = c - o;
      }
      return { gate: gcode, worst };
    });
    const decorative = bite.filter(b => b.worst === 0).map(b => b.gate);
    add('gates-bite', decorative.length === 0, decorative.length ? 'decorative gates: ' + decorative.join(', ')
      : 'every gate, shut alone, lengthens some HQ→HQ run: ' + bite.map(b => `${b.gate}+${b.worst}`).join(' '));

    out.bite = bite;
    out.ok = out.checks.every(c => c.pass);
    return out;
  }


  // ---- deterministic proof of the detour + freight premium -------------------
  // Frequency is a matter of how often bots happen to sail into a shut gate, and
  // that is tuning. Whether the MECHANIC works is not — so prove it directly:
  // shut Panama, sail the Gulf Coast to the Mainland, and check the engine both
  // flags the detour and pays for it. A rare event still has to be a real one.
  async function analyzeDetour() {
    const OG = global.OilGame, MP = global.OIL_MAP;
    const out = { ran: false, openCost: 0, shutCost: 0, flagged: false, pctOpen: 0, pctShut: 0, premium: 0 };
    if (!OG || !MP) return out;
    const g = new OG({ n_players: 3, seed: 4242, expansion: false, map: true });
    const p = g.players[0];
    p.at = 'HARTSTARR'; p.barrels = 4; g.price = 60; g.era = 'STABLE';

    out.openCost = MP.reach('HARTSTARR', 99, g.mapState).dist.BRIGHT;
    out.pctOpen = g._deliveryValue(p).pct;

    g.closeGate('PANAMA', 5);
    const r = MP.reach('HARTSTARR', 99, g.mapState);
    out.shutCost = r.dist.BRIGHT;

    // walk the detour exactly as the engine's move step does
    const path = MP.pathOf(r, 'BRIGHT');
    const openR = MP.reach('HARTSTARR', 99, { closed: {}, disabled: {}, built: g.mapState.built });
    p.longWay = (out.shutCost > openR.dist.BRIGHT);
    p.at = 'BRIGHT';
    out.flagged = !!p.longWay;
    const del = g._deliveryValue(p);
    out.pctShut = del.pct; out.premium = del.premium;
    out.path = path;
    out.ran = true;
    return out;
  }

  // aggregate the map's behaviour over a runBatch (the dead-trigger proof)
  function mapReport(games) {
    const keys = ['moves', 'steps', 'stayed', 'perils', 'barrelsLost', 'longWay', 'premiums',
      'incursions', 'squeezed', 'closures', 'atSea', 'structures'];
    const tot = {}; keys.forEach(k => { tot[k] = 0; });
    let n = 0, oilAdded = 0, hqSplit = 0;
    games.forEach(g => { if (!g.map) return; n++; keys.forEach(k => { tot[k] += g.map[k] || 0; }); oilAdded += g.oilAdded || 0; hqSplit += g.hqSplit || 0; });
    return { n, tot, oilAdded, hqSplit, avgSteps: tot.moves ? tot.steps / tot.moves : 0, perGame: k => (n ? tot[k] / n : 0) };
  }


  // ---- THE PATH reporter (docs/THE-PATH.md) ----------------------------------
  function pathReport(games) {
    const keys = ['landed', 'dumped', 'tolls', 'tollPaid', 'passages', 'passagePaid', 'contractPoints',
      'megaPoints', 'megaLandings', 'voyageTurns', 'detourTurns', 'ctrlTo', 'raised'];
    const tot = {}; keys.forEach(k => { tot[k] = 0; });
    let n = 0, ctrlGames = 0, raisedGames = 0;
    games.forEach(g => { if (!g.path) return; n++; keys.forEach(k => { tot[k] += g.path[k] || 0; });
      if (g.path.ctrlTo) ctrlGames++; if (g.path.raised) raisedGames++; });
    return { n, tot, ctrlGames, raisedGames,
      reachRate: (tot.landed + tot.dumped) ? tot.landed / (tot.landed + tot.dumped) : 0,
      ctrlRate: n ? ctrlGames / n : 0,
      detourRate: tot.voyageTurns ? tot.detourTurns / tot.voyageTurns : 0,
      perGame: k => (n ? tot[k] / n : 0) };
  }

  // THE TOLLBOOTH, proved on a fixture: a seat that HOLDS a buyer takes TOLL_PCT of a rival's
  // cargo landed there; the lander keeps the rest, and the contract refills.
  function analyzeToll() {
    const OG = global.OilGame, MP = global.OIL_MAP;
    const out = { ran: false };
    if (!OG || !MP) return out;
    const g = new OG({ n_players: 3, seed: 4343, expansion: false, map: true, path: 'path' });
    const [a, b] = g.players;
    g.market = ['HADDAD', 'BRIGHT', 'STOCK'];
    g.throughput.HADDAD = { [a.name]: 4 };                    // a holds the Gulf
    b.at = 'HADDAD'; b.barrels = 1; b.value = 0; a.value = 0; g.price = 50; g.era = 'STABLE';
    const pre = g.previewDelivery(b);
    const del = g._deliveryValue(b);
    b.barrels -= 1; b.value += del.value;
    const L = g._landContract(b, del);
    out.ran = true; out.owner = g.ownerOf('HADDAD'); out.value = del.value; out.toll = L.toll; out.tollTo = L.tollTo;
    out.aGot = a.value; out.bKept = b.value; out.preview = pre; out.points = L.points;
    out.refilled = g.market.length === 3 && g.market.indexOf('HADDAD') < 0;
    out.pct = g.mapDials.TOLL_PCT;
    return out;
  }

  // THE PATH's static promises: every structure that raises a place makes a place you can
  // SELL at, and raising ALL of them with every gate shut still strands nobody.
  function pathAudit() {
    const OG = global.OilGame, MP = global.OIL_MAP;
    const out = { checks: [] };
    const add = (id, pass, detail) => out.checks.push({ id, pass: !!pass, detail });
    const g = new OG({ n_players: 3, seed: 4444, expansion: true, map: true, path: 'path' });
    const raisers = Object.keys(MP.STRUCTURES).filter(k => (MP.STRUCTURES[k].raises || []).length);
    raisers.forEach(k => { g.mapState.built[k] = true; });
    const places = raisers.reduce((a, k) => a.concat(MP.STRUCTURES[k].raises), []);
    add('mega-destinations', places.every(c => g.sellableAt(c)),
      `raised structures become places you can sell at: ${places.map(c => MP.BY[c].name).join(' · ')}`);
    const off = new OG({ n_players: 3, seed: 4444, expansion: true, map: true });
    raisers.forEach(k => { off.mapState.built[k] = true; });
    add('mega-off-unchanged', places.every(c => !off.sellableAt(c) && !off.atHQ({ at: c })),
      'with the path OFF they stay what they were (no sale there — baseline unchanged)');
    const allShut = { closed: {}, built: Object.assign({ ARCTIC_DEV: true }, g.mapState.built) };
    MP.GATES.forEach(c => { allShut.closed[c] = 99; });
    add('mega-no-strand', MP.hqsConnected(allShut) && places.every(c => MP.reach(c, 99, allShut).places.length > 1),
      'every structure raised + every gate shut: the 8 HQs still connect and no new place is an island');
    // the detour, seen the way the human sees it: nearest buyer by the CURRENT map vs an open one
    const d = new OG({ n_players: 3, seed: 4545, expansion: false, map: true, path: 'path' });
    const p = d.players[0]; p.at = 'HARTSTARR'; p.barrels = 1; d.market = ['BRIGHT'];
    const open = d.nearestBuyer(p, p.at).dist;
    d.closeGate('PANAMA', 5);
    const shut = d.nearestBuyer(p, p.at).dist;
    add('path-detour', shut > open, `a shut gate lengthens the route to the buyer: Gulf Coast → Mainland ${open} → ${shut} with Panama shut`);
    out.ok = out.checks.every(c => c.pass);
    return out;
  }

  // ---- CRISIS reporter + the one-page BUDGET gate -----------------------------
  function crisisReport(games) {
    const keys = ['heated', 'cooled', 'gateShuts', 'blowouts', 'fireTurns', 'oilBurnedByFire',
      'callOuts', 'callOutSpend', 'retainers', 'retainerSaves', 'stateAbsorb', 'privateAbsorb', 'annihilation'];
    const tot = {}; keys.forEach(k => { tot[k] = 0; });
    let n = 0; const paths = { oil: 0, price: 0, annihilation: 0 };
    games.forEach(g => {
      paths[g.endPath] = (paths[g.endPath] || 0) + 1;
      if (!g.crisis) return; n++; keys.forEach(k => { tot[k] += g.crisis[k] || 0; });
    });
    return { n, tot, paths, N: games.length,
      avgBill: tot.callOuts ? tot.callOutSpend / tot.callOuts : 0,
      reactive: tot.callOuts > tot.retainers };
  }

  // THE BUDGET GATE. docs/THE-FOLDS.md cut the turn to ~3 decisions across 5 phases
  // so the whole game fits one page of rules. Any layer added after that has to ride
  // on the phases that already exist. This measures it instead of trusting it:
  // count every ask() with the layer off and on, and require that no NEW KIND of
  // decision appeared and the total did not meaningfully rise.
  async function decisionBudget(baseOpts, layerOpts, count) {
    const OG = global.OilGame;
    const tally = async extra => {
      const kinds = {}; let turns = 0;
      const orig = OG.prototype.ask;
      OG.prototype.ask = function (p, k, o, e) { kinds[k] = (kinds[k] || 0) + 1; return orig.call(this, p, k, o, e); };
      const origStep = OG.prototype.step;
      OG.prototype.step = async function () { turns++; return origStep.call(this); };
      try { await runBatch(Object.assign({ count: count || 200 }, baseOpts, extra)); }
      finally { OG.prototype.ask = orig; OG.prototype.step = origStep; }
      const total = Object.keys(kinds).reduce((a, k) => a + kinds[k], 0);
      return { kinds, turns, perTurn: turns ? total / turns : 0 };
    };
    const off = await tally({});
    const on = await tally(layerOpts || {});
    const newKinds = Object.keys(on.kinds).filter(k => !off.kinds[k]);
    return { off, on, newKinds, ratio: off.perTurn ? on.perTurn / off.perTurn : 1,
      ok: newKinds.length === 0 && on.perTurn <= off.perTurn * 1.05 };
  }

  const LAB = { enumerateShove, greenRate, reachability, runBatch, lawReport, analyzeCard, deckIncidence, analyzeDeal, dealIncidence, dealReport, mapAudit, mapReport, analyzeDetour, crisisReport, decisionBudget, pathReport, analyzeToll, pathAudit, BASE };
  global.OIL_LAB = LAB;
  if (typeof module !== 'undefined' && module.exports) module.exports = LAB;
})(typeof window !== 'undefined' ? window : globalThis);
