/* OiL! NATIVE ENGINE — the game's OWN rules, not the ER$N substrate.
   ============================================================================
   Implements the architecture locked in docs/DESIGN-DIRECTION.md + the dice review
   (Candidate 3, "Unified 3-Die"):

     • ONE 3-die roll per active turn (Red, Black, + a third "fate" die). Expansion
       adds the Green Anders die as a trigger-only override (no new meter).
     • The roll is read on TWO layers off the SAME dice:
         - shared MARKET: the three-body "price shove" (sorted a-2b+c, from
           three_body.py) moves the shared OIL PRICE. Mean 0 -> no house drift.
         - personal FATE: the third die + a one-pip "slingshot" the active player
           may spend to flip the shove's sign (the lever three_body.py describes).
     • Collapse clock = OIL REMAINING, monotonic (Charter G2). Every turn burns oil,
       so the clock PROVABLY reaches 0 -> E.D.D. is always reachable (Charter L2/E3).
     • Endgame = E.D.D. PROTOCOL (Eat / Divide / Destroy), fired by price+instability
       OR by oil running out.

   EVERY NUMBER BELOW IS A DIAL (strawman), exactly like three_body.py — none is
   declared canon. The validator (scripts/oil-sweep.js) sweeps + proves the laws.
   No faction/card/lore content is invented here; faction asymmetry is OFF
   (symmetric) pending CORE-014. Pure + seedable (Charter E1): seed -> outcome is
   byte-stable; no decoration touches this RNG.

   Runs in Node (globalThis) and the browser (window). */
(function (global) {
  'use strict';

  // ---- seedable RNG (mulberry32) — same surface as the ER$N engine ----------
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return {
      random: next, d6: () => 1 + Math.floor(next() * 6), pick: arr => arr[Math.floor(next() * arr.length)],
      shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    };
  }

  // ============================================================================
  // DIALS — single source of truth for every tunable. Strawman values; the sweep
  // validates them. Change here, re-run scripts/oil-sweep.js. (Charter E4.)
  // ============================================================================
  const DIALS = {
    // --- the DICE themselves (model A, LOCKED — designable in THE DICINER) -------
    // The three core bodies (canonically Supply/Weather/World) are INTERCHANGEABLE:
    // each rolls the same faces, read as one emergent shove. Defaults = standard d6
    // + the three_body.py weights, so the classic edition stays byte-identical.
    DIE_FACES: [1, 2, 3, 4, 5, 6],   // faces shared by the 3 bodies (design them here)
    SHOVE_W: [1, -2, 1],             // weights on the SORTED dice (a<=b<=c): a - 2b + c
    GREEN_TRIGGER: 5,                // expansion green die intervenes when it rolls >= this
    // ---- THE ANDERS DIE, PUNITIVE (docs/THE-CONTROL-LAYER.md §5) -------------
    // The three bodies are nature and markets: symmetric, untargeted, and they do not know your
    // name. Anders does. This is the one roll that can reach across the table and TAKE something
    // from a named company — which is the game admitting the house is a participant, and why it
    // belongs in the expansion, breaking a rule the core needs.
    //
    // It is AIMED AT THE LEADER on purpose. Random cruelty is just noise; leaning on whoever is
    // winning is a hand on the scale, which is the point. And it fires only on the top face of a
    // die that is already gated to CHAOTIC expansion turns — roughly a sixth of a third — because
    // punitive AND frequent is just misery.
    GREEN_PUNITIVE_AT: 6,            // only the top face punishes; 5 stays the old price shove
    GREEN_SEIZE_HEAT: 3,             // 'assign the blame' — heat dumped on ground the leader holds
    GREEN_LEVY: 6,                   // 'call the loan' — value taken from the leader
    // --- price (the shared market) ---
    PRICE_START: 50, PRICE_MIN: 5, PRICE_MAX: 120,
    // three-body era threshold: CHAOTIC when |shove| >= T_CHAOS (three_body.py sweep)
    T_CHAOS: 3,
    // --- oil remaining (the monotonic collapse clock) ---
    OIL_START: 60,
    BURN_BASE: 1,            // floor burn every turn -> guarantees reachability (>=1)
    BURN_PER_PRICE: 40,      // +1 burn for each full PRICE/40 (higher price = faster extraction)
    // --- scarcity premium: as the oil runs out, PRICE CLIMBS (the oil-market truth).
    //     Explicit + visible (not a hidden drift) — it makes the price+instability
    //     E.D.D. path reachable instead of decorative, and models the scarcity spike.
    SCARCITY_BAND: 30,       // premium kicks in once oil drops to/below this
    SCARCITY_DIV: 2,         // premium this turn = ceil((BAND - oil) / DIV)
    // --- E.D.D. trigger ---
    EDD_PRICE: 88,           // price at/above this + CHAOTIC era arms E.D.D. (the spike path)...
    EDD_OIL: 6,              // ...and E.D.D. also arms when oil drops to/below this (the backstop)
    EDD_ROLL: { 1: 'EAT', 2: 'EAT', 3: 'DIVIDE', 4: 'DIVIDE', 5: 'DESTROY', 6: 'DESTROY' },
    // --- player layer (MINIMAL strawman; the G3/G5 slots are still open) ---
    BARRELS_START: 2, PIPS_START: 3, PIP_REGEN_EVERY: 3,
    HOLD_PENALTY: 4,         // "always move or take a penalty": skip your action -> price-points of value lost
    CLAIM_COST: 1,           // barrels spent to claim/produce

    // ---- CONTROL (docs/THE-CONTROL-LAYER.md §2) -----------------------------
    // Territory measured in the only unit this game already trusts: barrels moved
    // through a place. Read off the claim/sell action that already exists — it adds
    // NO decision (LAB 11's one-page budget), which is the whole constraint.
    // ---- THE RATCHET — BUILT, MEASURED, AND REMOVED (docs/THE-CONTROL-LAYER.md §3) --------
    // The brief asked for player action to "ratchet up or down" the price. It was built here and
    // taken back out, because the measurement said it cannot work in THIS economy:
    //
    //   · Charter E1 rejected it immediately — oil-rich drift went to -0.43/turn against a 0.15
    //     tolerance. A lean that only points one way IS a house drift; that is what E1 is for.
    //   · The reason it only points one way is the barrel economy. Players start with 2 barrels
    //     and spend them one at a time. Measured over 60 games: 6,845 seat-turns holding ZERO
    //     barrels, 1,475 holding one, 600 holding two, and NOT ONE holding four.
    //   · So §3's two sides do not exist here. "Sell a large lot" is impossible — every sale is
    //     one barrel. "Withhold and stockpile" is impossible — there is nothing to withhold.
    //     Only the down-lean can ever fire, so only drift can result.
    //
    // A LEGAL ratchet needs a two-sided pressure source that this economy actually has. The
    // candidates are on the board already and are NOT barrel-flow: CONTROL of a place (§2), a
    // gate shut by somebody who holds it, and fire destroying supply. Those can push both ways
    // and fire independently of sales. That is the next attempt, and it is a design decision
    // about what "pressure" means — not a threshold to tune until E1 stops complaining.
    //
    // Dials kept, unused, so the attempt is legible rather than silently lost.
    THROUGHPUT_DECAY: 0.85,  // control ROTS without trade. You hold ground by working it.
    CONTROL_MARGIN: 1.25,    // you must beat second place by this to hold it outright...
    CONTROL_MIN: 2,          // ...and clear this floor, so one stray barrel owns nothing.
                             // Below either bar the place is CONTESTED — a state, not a tie-break.
  };

  // ---- EDITIONS (matches the ER$N pattern) -----------------------------------
  // 'classic'   = the frozen, validated baseline. Reference. Do not tune.
  // 'benchmark' = the TUNABLE balance lane for reversible experiments. Currently:
  //   (1) LEADER RUBBER BAND (Charter L3) — the control leader takes +1 exposure
  //       each turn, so leading carries danger BY RULE (the design's "#1 risk").
  //   (2) HOTTER MARKET — scarcity bites sooner + E.D.D. arms earlier, so the
  //       price-spike collapse path fires more often (cranks the intensity, G11).
  // Both are validated by scripts/oil-sweep.js to still pass every franchise law.
  const EDITIONS = {
    classic:   { rubberBand: false, dials: {} },
    benchmark: { rubberBand: true,  dials: { SCARCITY_BAND: 36, EDD_OIL: 4, EDD_PRICE: 84 } },
  };

  // ---- three-body price shove (THE market function) --------------------------
  // sort the dice; shove = w0*a + w1*b + w2*c (weights on the SORTED dice).
  // Default weights [1,-2,1] => a - 2b + c (the three_body.py read). instability = |shove|.
  function shoveOf(dice, w) {
    const s = dice.slice().sort((x, y) => x - y);
    const W = w || [1, -2, 1];
    let v = 0; for (let i = 0; i < s.length; i++) v += (W[i] != null ? W[i] : 0) * s[i];
    return v;
  }
  // roll one body from a faces table (defaults to a d6 -> identical RNG draw)
  function rollFace(rng, faces) {
    const F = (faces && faces.length) ? faces : [1, 2, 3, 4, 5, 6];
    return F[Math.floor(rng.random() * F.length)];
  }

  class Speculator {
    constructor(id, name, color) {
      this.id = id; this.name = name; this.color = color || '#d6a93f';
      this.barrels = DIALS.BARRELS_START;   // production/holdings (value = barrels * price)
      this.pips = DIALS.PIPS_START;          // slingshot resource
      this.control = 0;                      // territory/HQ claims (score proxy)
      this.value = 0;                        // realized value banked
      this.exposure = 0;                     // how hurt you are at collapse (lower = cleaner exit)
      this.isHuman = false;
      this.policy = 'greedy';
      this.agent = null;                     // input seam (Charter E6); same API for human/bot
      this.faction = null;                   // faction code (CORE-014 asymmetry; null = symmetric)
      this.grudges = [];                     // ids of players who broke a deal with you (THE TABLE)
      this.at = null;                        // where you stand on THE MAP (place code)
      this.longWay = false;                  // you came the long way round past a shut gate
      this.consignedTo = null;               // CONSIGNED CARGO (model): the buyer you owe
    }
    holdings(price) { return this.value + this.barrels * price; }
  }

  // THE TABLE — bots negotiate through src/oil-deals.js (seed-stable; uses g.rng).
  // Falls back to 'pass' if the deal layer isn't loaded, so the engine never
  // silently accepts a deal it has no rules for.
  function dealPick(g, p, ctx) { const R = OilGame._dealsFX(); return (R && R.policy) ? R.policy(g, p, ctx) : 'pass'; }
  const DEAL_KINDS = { table: 1, dealoffer: 1 };

  // THE MAP — where a bot sails. Seed-stable (g.rng only). The read: get to an HQ
  // so you can actually sell; prefer a rival's yard (the incursion pays more);
  // and in a chaotic season the steady hand stays out of the deep water.
  // CONSIGNED CARGO (model): should this seat sell HERE, or carry it to the buyer?
  // Without this the seat sold wherever it stood and 70% of cargo was dumped — the contract
  // existed on paper and changed nobody's behaviour. Hold if the buyer is close enough to be
  // worth the wait; dump if it is far, because a cargo you can never land is worth what the
  // spot market gives you today.
  function shouldLandIt(g, p) {
    if (!g.consign) return true;                            // no contracts: sell as before
    const buyers = g.buyersFor(p);
    if (!buyers.length) return true;
    if (buyers.indexOf(p.at) >= 0) return true;             // you are there. land it.
    const MP = OilGame._mapFX();
    const d = g.nearestBuyer(p, p.at).dist;
    return !(d !== undefined && d <= (g.mapDials.LAND_WITHIN || 4));   // within reach soon -> carry it
  }
  function movePick(g, p, ctx) {
    const MP = OilGame._mapFX(), opts = ctx.options;
    if (!MP.BY || !opts.length) return p.at;
    if (p.policy === 'random') return g.rng.pick(opts);
    const risky = c => { const k = (MP.BY[c] || {}).kind; return k === 'cape' || k === 'arctic' || k === 'ocean'; };
    const score = c => {
      const pl = MP.BY[c]; if (!pl) return -99;
      // An HQ is still the best sale; ONSHORE ground is the tempting second — it pays a premium
      // and no strait can close on it. Scored just under an HQ so it is a real option rather than
      // a curiosity: at 0 the AI treated Genesee County as open ocean and the ground was never
      // worked in 300 games, which left the whole onshore mechanic dead on the board.
      let v = pl.kind === 'hq' ? 10 : pl.kind === 'onshore' ? 7 : 0;
      // CONSIGNED CARGO (model): the buyer outranks everything — and, crucially, so does GETTING
      // CLOSER TO IT. Scoring only the arrival was not enough: a turn moves you a few steps, so if
      // the buyer is six steps away it is never in the option list and the bonus never applies.
      // The seat just picked the best node in reach, exactly as before, and 73% of cargo was
      // dumped. Rewarding PROGRESS is what turns a move into a voyage — and a voyage is the only
      // thing a shut strait can actually lengthen.
      const P = g.path;
      const buyers = g.consign ? g.buyersFor(p) : [];
      // THE PATH: an empty hold has no buyer. (Plain consign keeps its original read.)
      if (buyers.length && !(P && P.v2 && p.barrels <= 0)) {
        if (buyers.indexOf(c) >= 0) {
          v += 30;
          // the TOLL makes WHO HOLDS the buyer matter: tend your own station, avoid paying a rival's
          if (P && P.toll) { const own = g.ownerOf(c); if (own === p.name) v += 4; else if (own) v -= 6; }
        } else {
          const onward = g.nearestBuyer(p, c).dist;
          if (onward !== undefined) v += Math.max(0, 14 - onward * 2);   // closer is better
        }
      }
      // a built megastructure is somewhere you can SELL once the path is on — score it like ground
      if (P && P.mega && pl.kind === 'built' && g.sellableAt(c)) v += 7;
      if (pl.kind === 'hq' && c !== g.hqOf(p)) v += 3;         // somebody else's yard pays more
      if (c === p.at) v -= 4;                                  // always move or suffer
      v -= MP.trafficAt(c, g.mapState).blocked * 2;            // don't sail into a squeeze
      if (g.era === 'CHAOTIC' && risky(c)) v -= (p.policy === 'stable' ? 8 : 3);
      return v;
    };
    let best = opts[0], bv = -1e9;
    for (const c of opts) { const v = score(c); if (v > bv) { bv = v; best = c; } }
    return best;
  }

  // ---- default bot policies (the automa; humans plug the same seam) ----------
  const POLICIES = {
    random(g, p, ctx) { return g.rng.pick(ctx.options); },
    // greedy: push price toward your barrels' benefit, claim when cheap
    greedy(g, p, ctx) {
      if (DEAL_KINDS[ctx.kind]) return dealPick(g, p, ctx);
      if (ctx.kind === 'move') return movePick(g, p, ctx);
      if (ctx.kind === 'structure') return ctx.options[0];
      if (ctx.kind === 'action' && ctx.options.indexOf('iws') >= 0) return 'iws';
      if (ctx.kind === 'action' && ctx.options.indexOf('retainer') >= 0 && g.rng.random() < 0.15) return 'retainer';
      if (ctx.kind === 'action' && ctx.options.indexOf('build') >= 0) return 'build';
      if (ctx.kind === 'slingshot') {
        // spend a pip to flip the shove if it currently hurts your holdings
        const helps = (g.lastShove >= 0) === (p.barrels > 0);
        return (!helps && p.pips > 0 && Math.abs(g.lastShove) >= 1) ? 'flip' : 'keep';
      }
      if (ctx.kind === 'action') return (p.barrels >= DIALS.CLAIM_COST && shouldLandIt(g, p)) ? 'claim' : 'hold';
      if (ctx.kind === 'edd') return ctx.options.includes('EAT') ? 'EAT' : ctx.options[0];
      return ctx.options[0];
    },
    // stabilizer: never flip, always act (the Haddad "steady them" read — symmetric for now)
    stable(g, p, ctx) {
      if (DEAL_KINDS[ctx.kind]) return dealPick(g, p, ctx);
      if (ctx.kind === 'move') return movePick(g, p, ctx);
      if (ctx.kind === 'structure') return ctx.options[ctx.options.length - 1];
      if (ctx.kind === 'action' && ctx.options.indexOf('iws') >= 0) return 'iws';
      // the steward is the one temperament that ever buys cover before the fire
      if (ctx.kind === 'action' && ctx.options.indexOf('retainer') >= 0 && g.rng.random() < 0.35) return 'retainer';
      if (ctx.kind === 'action' && ctx.options.indexOf('build') >= 0) return 'build';
      if (ctx.kind === 'slingshot') return 'keep';
      if (ctx.kind === 'action') return shouldLandIt(g, p) ? 'claim' : 'hold';
      if (ctx.kind === 'edd') return ctx.options.includes('DIVIDE') ? 'DIVIDE' : ctx.options[0];
      return ctx.options[0];
    },
  };

  class OilGame {
    constructor(opts = {}) {
      opts = opts || {};
      this.rng = makeRng(opts.seed || 1);
      this.expansion = opts.expansion !== false;   // Green Anders die present
      this.edition = EDITIONS[opts.edition] ? opts.edition : 'classic';
      const ed = EDITIONS[this.edition];
      this.rubberBand = ed.rubberBand;
      // dial precedence: base DIALS <- edition overrides <- explicit opts.dials
      this.dials = Object.assign({}, DIALS, ed.dials, opts.dials || {});
      const D = this.dials;
      const n = Math.max(2, Math.min(8, opts.n_players || 5));
      const names = opts.names || Array.from({ length: n }, (_, i) => 'SPEC ' + (i + 1));
      this.players = names.slice(0, n).map((nm, i) => new Speculator(i, nm));
      if (opts.policies) this.players.forEach((p, i) => p.policy = opts.policies[i] || p.policy);

      this.price = D.PRICE_START;
      this.oil = D.OIL_START;
      this.era = 'STABLE';
      this.lastShove = 0; this.lastDice = [0, 0, 0];
      this.edd = false; this.eddLog = [];
      this.turn = 0; this.round = 0; this.idx = 0;
      this.pressure = 0;                     // THE RATCHET: player lean on next turn's price
      this.throughput = {};                  // place -> { playerName: barrels }, decayed each round
      this.controlOwner = {};                // place -> playerName | null (null = CONTESTED/none)
      this.done = false; this.winner = null; this.end_reason = null;
      this.log = []; this.events = [];
      this.maxTurns = opts.maxTurns || 400;   // safety only; oil depletion ends it far sooner
      this.cards = !!opts.cards;              // optional card layer (src/oil-cards.js)
      // MODEL: consigned cargo (see the CONSIGN_* dials). opts.path (docs/THE-PATH.md) is the
      // consign model grown into the game path; either flag turns contracts on. Both OFF by
      // default -> no new branch, no extra RNG, the frozen baseline stays byte-identical.
      this.consign = !!(opts.consign || opts.path);
      this.path = opts.path ? OilGame.pathRules(opts.path) : null;
      this.market = [];                      // THE PATH: the face-up contracts (buyer place codes)
      this.structureOwner = {};              // THE PATH: STRUCT -> the seat that raised it
      this.pathStats = { landed: 0, dumped: 0, tolls: 0, tollPaid: 0, passages: 0, passagePaid: 0,
        contractPoints: 0, megaPoints: 0, megaLandings: 0, domestic: 0, voyageTurns: 0, detourTurns: 0, detourSteps: 0,
        bypass: 0 };
      if (this.cards) this._buildDecks();

      // ---- optional THE TABLE (negotiation layer; src/oil-deals.js) ----------
      // Off by default -> the engine takes NO new branch and draws NO extra RNG,
      // so every frozen sweep number stays byte-identical.
      this.deals = !!opts.deals;
      this.dealDials = Object.assign({}, (OilGame._dealsFX().DEAL_DIALS || {}), opts.dealDials || {});
      this.standing = [];        // live deals: {uid,type,a,b,ticks,paid,carried}
      this.dealFreeze = 0;       // turns during which no NEW deal may be offered
      this._dealUid = 0;
      this.dealStats = { offers: 0, formed: 0, declined: 0, ticks: 0, broken: 0, lapsed: 0, spared: 0, revenge: 0 };

      // ---- optional THE MAP (shipping world; src/oil-map.js) ----------------
      // Off by default -> no new branch, no extra RNG, baseline byte-identical.
      const MP = OilGame._mapFX();
      this.map = !!(opts.map && MP.PLACES);
      this.mapDials = Object.assign({}, MP.MAP_DIALS || {}, opts.mapDials || {});
      this.mapState = { closed: {}, disabled: {}, built: Object.assign({}, opts.built || {}) };
      this.mapStats = { moves: 0, steps: 0, stayed: 0, perils: 0, barrelsLost: 0, longWay: 0,
        premiums: 0, incursions: 0, squeezed: 0, closures: 0, atSea: 0, structures: 0 };
      if (this.map) {
        // you start at your faction's HQ; symmetric games spread round the 8 HQs.
        // (Seats are placed BEFORE factions are assigned below, so q.faction is still null here and
        // everyone lands on HQS[i]. That is the frozen baseline. THE PATH's `home` rule reads the
        // roster directly, so a company really does start in its own yard.)
        const homeOf = (q, i) => q.faction || (this.path && this.path.home && Array.isArray(opts.factions) ? this._hqCode(opts.factions[i]) : null);
        this.players.forEach((q, i) => { const f = homeOf(q, i); q.at = (f && MP.BY[f]) ? f : MP.HQS[i % MP.HQS.length]; });
        // CONSIGNED CARGO (model): everybody starts holding a contract, or the first sale has
        // nowhere to be and the whole experiment starts a turn late.
        if (this.consign) {
          if (this.path && this.path.mode === 'market') this._fillMarket();
          else this.players.forEach(q => this._consign(q));
        }
      }

      // ---- optional CRISIS (flashpoints / blowouts / IWS; src/oil-crisis.js) ----
      // Needs the map (heat lives on places). Off by default -> no new branch, no
      // extra RNG, and no new decision on the turn (docs/THE-FOLDS.md budget).
      const CR = OilGame._crisisFX();
      this.crisis = !!(opts.crisis && this.map && CR.CRISIS_DIALS);
      this.crisisDials = Object.assign({}, CR.CRISIS_DIALS || {}, opts.crisisDials || {});
      this.heat = {};            // place code -> stress
      this.fires = {};           // place code -> turns burning
      this.retainer = {};        // player id -> turns of IWS cover remaining
      this.crisisStats = { heated: 0, cooled: 0, gateShuts: 0, blowouts: 0, fireTurns: 0,
        oilBurnedByFire: 0, callOuts: 0, callOutSpend: 0, retainers: 0, retainerSaves: 0,
        stateAbsorb: 0, privateAbsorb: 0, annihilation: 0 };

      // ---- optional FACTION ASYMMETRY (CORE-014; src/oil-factions.js) --------
      // opts.factions = [code,...] aligned to seats; opts.asym defaults ON when
      // present. Off (no factions) -> path is byte-identical to the symmetric
      // baseline, so the frozen sweep is untouched.
      this.factions = opts.factions || null;
      this.asym = this.factions ? (opts.asym !== false) : false;
      if (this.factions) {
        const FX = OilGame._factionFX();
        this.players.forEach((p, i) => { p.faction = this.factions[i] || null; });
        if (this.asym) this.players.forEach(p => { const f = p.faction && FX[p.faction]; if (f && f.setup) f.setup(this, p); });
      }
    }

    // a seat's home yard as a PLACE code. Baseline: the raw faction code (so MC/NIK never match
    // their HQ — frozen). THE PATH `home` rule: MC -> MILECASTLE, NIK -> NIKOYL (MP.FACTION_HQ).
    _hqCode(f) {
      if (!f || !(this.path && this.path.home)) return f || null;
      return (OilGame._mapFX().FACTION_HQ || {})[f] || f;
    }
    hqOf(p) { return p ? this._hqCode(p.faction) : null; }
    seatAtHQ(code, except) { return this.players.find(q => q !== except && this.hqOf(q) === code) || null; }

    // the crisis registry (src/oil-crisis.js); {} when the layer isn't loaded
    static _crisisFX() { return (typeof global !== 'undefined' && global.OIL_CRISIS) || OilGame.CRISIS_FX || {}; }

    // the map registry (src/oil-map.js); {} when the layer isn't loaded
    static _mapFX() { return (typeof global !== 'undefined' && global.OIL_MAP) || OilGame.MAP_FX || {}; }

    // the deal-layer registry (src/oil-deals.js); {} when the layer isn't loaded
    static _dealsFX() {
      return (typeof global !== 'undefined' && global.OIL_DEALS_FX) || OilGame.DEALS_FX || {};
    }

    static _factionFX() {
      const reg = OilGame.FACTION_FX || (typeof global !== 'undefined' && global.OIL_FACTIONS_FX) || null;
      return (reg && reg.FACTIONS) || reg || {};
    }
    // a faction player's once-per-turn power (law-safe: never adds oil)
    _factionPassive(p) {
      if (!this.asym || !p.faction) return;
      const f = OilGame._factionFX()[p.faction];
      if (f && f.passive) { f.passive(this, p); this.emit('faction', { player: p.name, code: p.faction, power: f.power }); }
    }

    emit(t, d) { this.events.push(Object.assign({ type: t, turn: this.turn }, d)); }
    _log(s) { this.log.push(s); }

    ask(p, kind, options, extra) {
      const ctx = Object.assign({ kind, options }, extra || {});
      if (p.agent && p.agent.decide) return p.agent.decide(this, p, ctx);   // human seat
      return (POLICIES[p.policy] || POLICIES.greedy)(this, p, ctx);
    }

    // ---- card-effect helpers (used by src/oil-cards.js; never ADD oil) --------
    bumpPrice(n) { this.price = Math.max(this.dials.PRICE_MIN, Math.min(this.dials.PRICE_MAX, this.price + n)); }
    burnOil(n) { this.oil = Math.max(0, this.oil - Math.max(0, n)); }
    forceEra(e) { this.era = e; }
    richestOpp(p) { const o = this.players.filter(q => q !== p); return o.length ? o.reduce((a, b) => a.holdings(this.price) >= b.holdings(this.price) ? a : b) : null; }
    leaderOpp(p) { const o = this.players.filter(q => q !== p); return o.length ? o.reduce((a, b) => a.control >= b.control ? a : b) : null; }

    // ---- card deck system (optional; opts.cards) ------------------------------
    _buildDecks() {
      const FX = OilGame.CARD_FX || (typeof global !== 'undefined' && global.OIL_CARD_FX) || {};
      const ALL = (typeof global !== 'undefined' && global.OIL && global.OIL.CARDS) || [];
      this.decks = {}; this.discards = {};
      for (const dk of ['DEEDS', 'FREEDOM-MARKET', 'COMPETITION']) {
        this.decks[dk] = this.rng.shuffle(ALL.filter(c => c.deck === dk && FX[c.name]).map(c => c.name));
        this.discards[dk] = [];
      }
      this.players.forEach(p => { p.hand = []; });
    }
    drawCard(dk) {
      if (!this.decks[dk] || !this.decks[dk].length) {
        if (this.discards[dk] && this.discards[dk].length) { this.decks[dk] = this.rng.shuffle(this.discards[dk]); this.discards[dk] = []; }
        else return null;
      }
      return this.decks[dk].pop();
    }
    playCard(name, p) {
      const FX = OilGame.CARD_FX || (typeof global !== 'undefined' && global.OIL_CARD_FX) || {};
      const e = FX[name]; if (!e || !e.fx) return;
      e.fx(this, p);
      // war-and-government cards land WHERE THE SEAT IS STANDING (src/oil-crisis.js
      // CARD_HEAT); the quiet-imposing ones cool it. The cards are the designer's —
      // crisis only gives them somewhere to land.
      if (this.crisis && p.at) {
        const CH = (OilGame._crisisFX().CARD_HEAT || {})[name];
        if (CH) this.addHeat(p.at, CH > 0 ? Math.min(CH, this.crisisDials.HEAT_CARD) : CH, name);
      }
      this.discards[e.deck] && this.discards[e.deck].push(name);
      this.emit('card', { player: p.name, card: name, deck: e.deck });
    }




    // ========================================================================
    // CRISIS — flashpoints, blowouts, IWS (optional; opts.crisis, needs the map).
    // Shapes and dials in src/oil-crisis.js; the RULES are here. Adds NO phase and
    // NO decision: heat accrues in upkeep off events that already happen, a blowout
    // is a consequence rather than a choice, and IWS is a third option on the
    // deliver step that already exists. See docs/CRISIS-AND-IWS.md.
    // ========================================================================

    // Heat lands on a PLACE. When it lands on somebody's HQ, the world acts on the
    // company — and the state and the private firm shed the same heat in different
    // currencies. The state pays in legitimacy; the board pays cash and books it
    // as a cost of doing business.
    addHeat(place, n, cause) {
      if (!this.crisis || !place || !n) return 0;
      const CR = OilGame._crisisFX(), D = this.crisisDials, MP = OilGame._mapFX();
      const pl = MP.BY[place]; if (!pl) return 0;
      let amount = n;
      if (amount >= D.ABSORB_MIN && pl.kind === 'hq') {
        const align = CR.alignmentOf ? CR.alignmentOf(place) : null;
        const seat = this.seatAtHQ(place);
        if (seat && align === 'state') {
          amount -= D.STATE_ABSORB; seat.exposure += D.STATE_EXPOSURE;
          this.crisisStats.stateAbsorb++;
          this.emit('absorb', { how: 'state', at: place, player: seat.name });
        } else if (seat && align === 'private' && seat.value >= D.PRIVATE_FEE) {
          amount -= D.PRIVATE_ABSORB; seat.value -= D.PRIVATE_FEE;
          this.crisisStats.privateAbsorb++;
          this.emit('absorb', { how: 'private', at: place, player: seat.name, fee: D.PRIVATE_FEE });
        }
      }
      const before = this.heat[place] || 0;
      const after = Math.max(0, Math.min(D.HEAT_MAX, before + amount));
      this.heat[place] = after;
      if (after > before) this.crisisStats.heated++; else if (after < before) this.crisisStats.cooled++;
      if (amount !== 0) this.emit('heat', { at: place, by: amount, now: after, cause: cause || '' });
      return after;
    }
    totalHeat() { let t = 0; for (const k in this.heat) t += this.heat[k]; return t; }
    burningAt(place) { return (this.fires[place] || 0) > 0; }

    // upkeep, folded into the gate tick that already runs each turn
    _crisisTick(p) {
      const D = this.crisisDials, MP = OilGame._mapFX();
      // 1. the world's stress bleeds off — slowly. Heat is pressure, not a ratchet,
      //    but a crisis that evaporates faster than the world makes it is no crisis.
      if (this.turn % D.HEAT_DECAY_EVERY === 0) {
        for (const k in this.heat) {
          const v = Math.max(0, this.heat[k] - D.HEAT_DECAY);
          if (v === 0) delete this.heat[k]; else { this.heat[k] = v; this.crisisStats.cooled++; }
        }
      }
      for (const id in this.retainer) { if (--this.retainer[id] <= 0) delete this.retainer[id]; }

      // 2. a CHAOTIC season is the world's instability, and the world's instability
      //    lands on the chokepoints — every one of them at once. This is what makes
      //    a strait shut because of events rather than because a card said so.
      if (this.era === 'CHAOTIC') {
        MP.GATES.forEach(gc => { if (!this.mapState.closed[gc]) this.addHeat(gc, D.HEAT_CHAOS_GATES, 'a chaotic season'); });
        if (p.at) this.addHeat(p.at, D.HEAT_CHAOS_LOCAL, 'a chaotic season');
      }

      // 2b. THE ARROW THAT CLOSES THE LOOP: a shut strait bleeds stress into the
      //     ground beside it. The gate shuts, and the field next to it catches.
      for (const gc in this.mapState.closed) {
        (MP.ADJ[gc] || []).forEach(r => { if ((MP.BY[r.to] || {}).kind === 'hq') this.addHeat(r.to, D.HEAT_SPREAD, 'the strait is shut'); });
      }

      // 3. heat does its work: straits shut, wells blow
      for (const code in this.heat) {
        const pl = MP.BY[code]; if (!pl) continue;
        const h = this.heat[code];
        if (pl.kind === 'gate' && h >= D.GATE_SHUT_AT && !this.mapState.closed[code]) {
          if (this.closeGate(code, this.mapDials.CLOSE_TURNS)) {
            this.crisisStats.gateShuts++;
            this.emit('flashpoint', { at: code, name: pl.name, heat: h });
          }
        }
        if (pl.kind === 'hq' && !this.burningAt(code)) {
          const seat = this.seatAtHQ(code);
          const cover = seat && this.retainer[seat.id] ? D.RETAINER_SHIELD : 0;
          if (h >= D.BLOWOUT_AT + cover) {
            this.fires[code] = 1; this.crisisStats.blowouts++;
            this.emit('blowout', { at: code, name: pl.name, player: seat && seat.name });
          } else if (cover && h >= D.BLOWOUT_AT) {
            this.crisisStats.retainerSaves++;
            this.emit('retainer_save', { at: code, player: seat && seat.name });
          }
        }
      }

      // 4. what is alight goes on burning. Fires do not go out on their own.
      for (const code in this.fires) {
        this.fires[code]++;
        this.crisisStats.fireTurns++;
        const seat = this.seatAtHQ(code);
        if (seat) seat.exposure += D.FIRE_HEAT;
      }
    }

    // the fire's share of the turn's burn — oil only ever goes DOWN, so the
    // collapse clock stays monotonic and E.D.D. stays reachable (L2/E3).
    _fireBurn() {
      if (!this.crisis) return 0;
      const n = Object.keys(this.fires).length;
      if (!n) return 0;
      const burn = n * this.crisisDials.FIRE_BURN;
      this.crisisStats.oilBurnedByFire += Math.min(burn, this.oil);
      return burn;
    }

    // ---- IWS: what the deliver step may offer instead of a sale ---------------
    iwsPrice(place) {
      const D = this.crisisDials;
      return D.IWS_BASE + D.IWS_PER_TURN * Math.max(0, (this.fires[place] || 1) - 1);
    }
    canCallIWS(p) { return !!(this.crisis && this.burningAt(p.at) && p.value >= this.iwsPrice(p.at)); }
    canRetain(p) {
      // Only once the trouble is VISIBLE at your own ground. The brief's whole point
      // is that the money is always needed now, so cover you cannot yet justify is
      // cover nobody buys — and the sweep has to show that, not assume it.
      return !!(this.crisis && this.atHQ(p) && p.at === this.hqOf(p) && !this.burningAt(p.at)
        && !this.retainer[p.id] && p.value >= this.crisisDials.RETAINER_COST
        && (this.heat[p.at] || 0) >= this.crisisDials.RETAINER_AT);
    }
    callIWS(p) {
      if (!this.canCallIWS(p)) return false;
      const D = this.crisisDials, cost = this.iwsPrice(p.at), turns = this.fires[p.at] || 1;
      p.value -= cost; p.exposure += D.IWS_EXPOSURE;
      delete this.fires[p.at];
      this.heat[p.at] = Math.max(0, (this.heat[p.at] || 0) - D.BLOWOUT_AT);
      this.crisisStats.callOuts++; this.crisisStats.callOutSpend += cost;
      this.emit('iws', { player: p.name, at: p.at, cost, burned: turns });
      return true;
    }
    buyRetainer(p) {
      if (!this.canRetain(p)) return false;
      const D = this.crisisDials;
      p.value -= D.RETAINER_COST;
      this.retainer[p.id] = D.RETAINER_TURNS;
      this.crisisStats.retainers++;
      this.emit('retainer', { player: p.name, at: p.at, cost: D.RETAINER_COST });
      return true;
    }


    // ========================================================================
    // THE MAP — the shipping world (optional; opts.map). Places/routes/dials in
    // src/oil-map.js; the RULES are here: how far a roll carries you, what the
    // sea does to you in a chaotic season, and what a delivery is worth from
    // where you're standing.
    // INVARIANTS (gated in LAB 8 / sweep PART 7): the map NEVER adds oil, every
    // gate closure is FINITE, and the 8 HQs stay mutually reachable no matter
    // what is shut — nobody is ever stranded off the board.
    // ========================================================================
    mapGateTick() {
      const st = this.mapState;
      for (const k in st.closed) { if (st.closed[k] > 0 && --st.closed[k] <= 0) { delete st.closed[k]; this.emit('gate_open', { gate: k }); } }
      for (const k in st.disabled) { if (st.disabled[k] > 0 && --st.disabled[k] <= 0) delete st.disabled[k]; }
    }
    // THE ONE RULE OF THE BOARD: the world can always be made LONGER, but it can
    // never be BROKEN. Any closure that would leave an HQ unable to reach the rest
    // of the table is refused — you can strangle a rival, you cannot delete them.
    // (Gate closures alone can never split the board — LAB 8 proves that statically —
    // but a closure stacked on a DISABLED route can, so every change is checked.)
    _wouldSplit(apply, undo) {
      const MP = OilGame._mapFX();
      apply();
      const ok = !MP.hqsConnected || MP.hqsConnected(this.mapState);
      if (!ok) undo();
      return !ok;
    }
    // close a named gate for n turns (cards / E.D.D. DESTROY / faction powers)
    closeGate(code, turns) {
      const MP = OilGame._mapFX();
      if (!this.map || !MP.BY || !MP.BY[code] || MP.BY[code].kind !== 'gate') return false;
      const n = (this.path && this.path.rounds) ? Math.max(1, this.pathDial('CLOSE_ROUNDS'))
        : Math.max(1, turns || this.mapDials.CLOSE_TURNS);
      const prev = this.mapState.closed[code];
      if (this._wouldSplit(() => { this.mapState.closed[code] = Math.max(prev || 0, n); },
                           () => { if (prev === undefined) delete this.mapState.closed[code]; else this.mapState.closed[code] = prev; })) {
        this.emit('gate_refused', { gate: code, why: 'would strand a seat' });
        return false;
      }
      this.mapStats.closures++;
      this.emit('gate_close', { gate: code, name: MP.BY[code].name, turns: n });
      return true;
    }
    // raise a megastructure — the late-game move that redraws the world
    build(structure) {
      const MP = OilGame._mapFX();
      if (!this.map || !(MP.STRUCTURES || {})[structure] || this.mapState.built[structure]) return false;
      this.mapState.built[structure] = true; this.mapStats.structures++;
      this.emit('structure', { structure, name: MP.STRUCTURES[structure].name, effect: MP.STRUCTURES[structure].effect });
      return true;
    }
    // take one of this player's own routes out of service for a while ("disable route")
    disableRouteNear(victim) {
      const MP = OilGame._mapFX();
      if (!this.map || !victim.at || !MP.ADJ) return false;
      const live = (MP.ADJ[victim.at] || []).filter(r => MP.routeOpen(r, victim.at, this.mapState));
      // take the first route that can be spared without breaking the board
      for (const r of live) {
        const dn = (this.path && this.path.rounds) ? Math.max(1, this.pathDial('CLOSE_ROUNDS')) : this.mapDials.CLOSE_TURNS;
        if (!this._wouldSplit(() => { this.mapState.disabled[r.id] = dn; },
                              () => { delete this.mapState.disabled[r.id]; })) {
          this.emit('route_disabled', { at: victim.at, label: r.label, to: r.to });
          return true;
        }
      }
      return false;
    }
    // ---- megastructures: the late-game move that redraws the world -----------
    // Expansion only (the Green Anders register). You must already hold real ground
    // — this is what regional success BUYS: the power to change everyone's map.
    buildable() {
      const MP = OilGame._mapFX();
      return Object.keys(MP.STRUCTURES || {}).filter(k => !this.mapState.built[k]);
    }
    canBuild(p) {
      return !!(this.map && this.expansion && this.atHQ(p) && p.control >= this.mapDials.BUILD_CONTROL
        && this.buildable().length);
    }
    placeOf(p) { const MP = OilGame._mapFX(); return (MP.BY && MP.BY[p.at]) || null; }
    atHQ(p) { const pl = this.placeOf(p); return !!(pl && pl.kind === 'hq'); }

    // the movement PHASE: a THIRD read of the same three bodies carries you, the
    // era decides what the sea does, and where you end decides what you can sell.
    async _mapPhase(p) {
      const MP = OilGame._mapFX(), D = this.mapDials;
      // THE PATH 'rounds': a closure's clock runs in ROUNDS, not seat-turns. Ticked on every
      // seat's turn, CLOSE_TURNS 3 never outlasted one round at 5 seats — the strait was open
      // again before most of the table had sailed. (docs/THE-PATH.md, finding 3)
      if (!(this.path && this.path.rounds) || this.idx === 0) this.mapGateTick();
      if (this.crisis) this._crisisTick(p);      // no new phase — upkeep, not a decision
      const steps = MP.stepsFor(this.lastDice, D);
      const from = p.at;
      const r = MP.reach(from, steps, this.mapState);
      const options = r.places.slice().sort();
      p.longWay = false; p.stayed = false; p.moved = false;
      if (this.path) this._voyageProbe(p);       // THE PATH: measured, never asked
      if (options.length > 1) {
        const pick = await this.ask(p, 'move', options);
        const to = (options.indexOf(pick) >= 0) ? pick : from;
        const path = MP.pathOf(r, to);
        if (to !== from && path.length > 1) {
          // THE SEA. Every risky place you enter in a CHAOTIC season can take
          // something off you. Peril never touches the oil clock — only cargo.
          let lost = 0, hitCape = false;
          for (let i = 1; i < path.length; i++) {
            const kind = (MP.BY[path[i]] || {}).kind;
            if (kind === 'cape' || kind === 'arctic') hitCape = true;
            const risk = MP.perilOf(path[i], this.era, D);
            if (risk > 0 && this.rng.random() < risk) {
              const n = Math.min(p.barrels, D.PERIL_BARREL);
              p.barrels -= n; lost += n; p.exposure += D.PERIL_HEAT;
              this.mapStats.perils++; this.mapStats.barrelsLost += n;
              this.emit('peril', { player: p.name, place: path[i], name: (MP.BY[path[i]] || {}).name, lost: n });
            }
          }
          // THE LONG WAY ROUND. Not "did you touch a Cape" — did the world's shut
          // gates actually make this trip longer than it should have been? If the
          // same journey would have been cheaper with everything open, you were
          // detoured, and the cargo you land is worth more for it.
          if (Object.keys(this.mapState.closed).length || Object.keys(this.mapState.disabled).length) {
            const openState = { closed: {}, disabled: {}, built: this.mapState.built };
            const openR = MP.reach(from, 99, openState);
            const wouldBe = openR.dist[to];
            if (hitCape || (wouldBe !== undefined && (r.dist[to] || 0) > wouldBe)) {
              p.longWay = true; this.mapStats.longWay++;
              this.emit('longway', { player: p.name, from, to, cost: r.dist[to] || 0, normally: wouldBe });
            }
          }
          if (this.path) this._passageToll(p, path);
          p.at = to; p.moved = true;
          this.mapStats.moves++; this.mapStats.steps += (r.dist[to] || 0);
          this.emit('move', { player: p.name, from, to, cost: r.dist[to] || 0, steps, path, lost, longWay: p.longWay });
        } else {
          // You had somewhere to be and you stayed. The penalty for that is no longer
          // charged here — see FOLD 1 at the action step: ONE idleness rule, "move or
          // sell", so a seat is never billed twice for a single act of doing nothing.
          p.stayed = true; this.mapStats.stayed++;
          this.emit('stay', { player: p.name, at: from });
        }
      }
    }

    // what one barrel fetches from where this player is standing.
    // A claim is a DELIVERY: blocked routes out of your node cut what you can move,
    // the long way past a shut gate pays a premium, and selling out of a rival's
    // yard pays more and costs you both.
    // ---- CONTROL: throughput in, control out ---------------------------------
    // A station is EVIDENCE OF THROUGHPUT, not a purchase — you get one by selling at a
    // place, so you cannot buy into a region you do not actually supply.
    _addThroughput(p, place, barrels) {
      if (!place || !barrels) return;
      const t = (this.throughput[place] || (this.throughput[place] = {}));
      t[p.name] = (t[p.name] || 0) + barrels;
    }
    // Who holds a place: the leader, if it clears the floor AND beats second by the margin.
    // Anything else is CONTESTED — which is where the deal layer and the flashpoints work.
    controlOf(place) {
      const t = this.throughput[place]; if (!t) return null;
      const D = this.dials;
      const rank = Object.keys(t).map(n => [n, t[n]]).sort((a, b) => b[1] - a[1]);
      if (!rank.length || rank[0][1] < D.CONTROL_MIN) return null;
      const second = rank[1] ? rank[1][1] : 0;
      if (second > 0 && rank[0][1] < second * D.CONTROL_MARGIN) return null;
      return rank[0][0];
    }
    controlTable() {
      const out = {};
      Object.keys(this.throughput).forEach(pl => { const o = this.controlOf(pl); if (o) out[pl] = o; });
      return out;
    }
    controlCount(name) {
      const t = this.controlTable();
      return Object.keys(t).filter(k => t[k] === name).length;
    }
    // Once per round: trade rots, then control is re-read. Emitting only on CHANGE keeps the
    // event stream honest about when ground actually moved.
    _settleControl() {
      const D = this.dials;
      Object.keys(this.throughput).forEach(pl => {
        const t = this.throughput[pl];
        Object.keys(t).forEach(n => {
          t[n] *= D.THROUGHPUT_DECAY;
          if (t[n] < 0.05) delete t[n];
        });
        if (!Object.keys(t).length) delete this.throughput[pl];
      });
      Object.keys(this.throughput).forEach(pl => {
        const now = this.controlOf(pl), was = this.controlOwner[pl] || null;
        if (now !== was) {
          this.controlOwner[pl] = now;
          this.emit('control', { place: pl, from: was, to: now, turn: this.turn });
        }
      });
    }

    // THE PUNITIVE STROKE. One seat, one effect, survivable — the guardrail from §5 is that this
    // must never become misery, so it takes a bite and never a leg. Which of the three lands is
    // deterministic on the turn, so a replay is a replay.
    _andersPunish() {
      const D = this.dials;
      const lead = this.players.slice().sort((a, b) => b.holdings(this.price) - a.holdings(this.price))[0];
      if (!lead) return;
      const held = Object.keys(this.controlTable()).filter(k => this.controlTable()[k] === lead.name);
      const pick = this.turn % 3;
      let how = null;

      if (pick === 0 && held.length) {              // SEIZE — strip the ground out from under them
        const place = held[0];
        const t = this.throughput[place] || {};
        delete t[lead.name];                        // the station is gone; whoever is next inherits
        this.controlOwner[place] = this.controlOf(place);
        how = { how: 'seize', place };
      } else if (pick === 1 && held.length && this.crisis) {
        this.addHeat(held[0], D.GREEN_SEIZE_HEAT, 'Anders assigns the blame');
        how = { how: 'blame', place: held[0] };     // BLAME — the trouble is booked to your ground
      } else {                                      // LEVY — the loan is called. Always available.
        const take = Math.min(lead.value, D.GREEN_LEVY);
        lead.value -= take;
        how = { how: 'levy', took: take };
      }
      lead.exposure += 1;                           // and it is on the record that Anders had to act
      this.andersStats = this.andersStats || { seize: 0, blame: 0, levy: 0 };
      this.andersStats[how.how]++;
      this.emit('anders', Object.assign({ player: lead.name, turn: this.turn }, how));
    }

    // CONSIGNED CARGO (model). Hand this seat a buyer that is NOT where it is standing —
    // a contract you are already sitting on is not a destination, it is a formality.
    _consign(p) {
      const MP = OilGame._mapFX();
      if (!MP.HQS || !MP.HQS.length) return;
      if (this.path && this.path.v2) {                 // THE PATH: the weighted draw (cluster / mega buyers)
        p.consignedTo = this._drawBuyer([p.at]);
      } else {
        const away = MP.HQS.filter(c => c !== p.at);
        p.consignedTo = away.length ? away[Math.floor(this.rng.random() * away.length)] : MP.HQS[0];
      }
      this.emit('consign', { player: p.name, to: p.consignedTo, from: p.at, turn: this.turn });
    }

    // ========================================================================
    // THE PATH (opts.path — docs/THE-PATH.md). The consign model, grown into the thing a
    // player actually does on the board: take a contract, sail it to the buyer, get paid —
    // and find out who holds the buyer. ALL CONCEPT; every number a MAP_DIALS dial.
    //   mode 'private' — each seat holds its own buyer (the 2026-09-24 model)
    //   mode 'market'  — MARKET_SIZE face-up buyers everybody chases; first to land takes it
    //   cluster  — a buyer's draw weight grows with the barrels already landed there
    //   toll     — whoever HOLDS a buyer (control) takes TOLL_PCT of every rival cargo landed
    //   points   — a landed contract is worth CONSIGN_POINTS extra ▰
    //   mega     — raised structures are places you can sell at, pay their builder a passage
    //              toll, and score MEGA_POINTS ▰ to the builder per contract landed at them
    // ========================================================================
    static pathRules(x) {
      const PRESETS = {
        private: { mode: 'private' },
        cluster: { mode: 'private', cluster: true },
        market:  { mode: 'market' },
        toll:    { mode: 'private', toll: true },
        // THE RECOMMENDED PATH (docs/THE-PATH.md): a shared face-up market dealt where nobody
        // stands, a landed contract counted as a cargo of record on the station meter (×2),
        // the tollbooth, megastructures as destinations — and a landed contract worth ▰1 more
        // than a dump, so the verdict can see the path. (cluster measured ~0 effect: left out.)
        // home + onshore: the two baseline bugs, fixed here only (docs/THE-PATH.md, findings 5–6).
        path:    { mode: 'market', toll: true, mega: true, home: true, onshore: true, dials: { CONSIGN_THROUGHPUT: 2, CONSIGN_POINTS: 1 } },
        // the same WITHOUT touching the score — if the verdict is not to move (Joe's call)
        quiet:   { mode: 'market', toll: true, mega: true, home: true, onshore: true, dials: { CONSIGN_THROUGHPUT: 2 } },
      };
      const base = typeof x === 'string' ? (PRESETS[x] || PRESETS.private) : (x === true ? PRESETS.private : Object.assign({}, x));
      const r = Object.assign({ mode: 'private', cluster: false, toll: false, mega: false, rounds: false, home: false, onshore: false, dials: {} }, base);
      if (r.mode !== 'market') r.mode = 'private';
      // v2 = anything beyond the original private model (which must stay exactly as measured)
      r.v2 = r.mode === 'market' || r.cluster || r.toll || r.mega || r.rounds || r.home || r.onshore || !!Object.keys(r.dials).length;
      return r;
    }
    // the buyers this seat is carrying toward right now
    buyersFor(p) {
      if (!this.consign) return [];
      let b = this.path && this.path.mode === 'market' ? this.market.slice() : (p.consignedTo ? [p.consignedTo] : []);
      // THE SPACE ELEVATOR (CONCEPT): "deliver without a route at all — the map stops applying
      // to you". Its builder's contract counts as landed at ANY place it can sell.
      if (this.path && this.path.mega && this.structureOwner.SPACE_ELEVATOR === p.name) {
        const MP = OilGame._mapFX();
        b = MP.CODES.filter(c => this.sellableAt(c));
      }
      return b;
    }
    // nearest buyer from `from`, by the CURRENT map (shut gates and all)
    nearestBuyer(p, from, state) {
      const MP = OilGame._mapFX();
      const r = MP.reach(from, 99, state || this.mapState);
      let best = null, bd;
      for (const b of this.buyersFor(p)) { const d = r.dist[b]; if (d !== undefined && (bd === undefined || d < bd)) { bd = d; best = b; } }
      return { to: best, dist: bd, reach: r };
    }
    // where a cargo can be landed: an HQ, or (with mega on) a raised megastructure's place
    sellableAt(code) {
      const MP = OilGame._mapFX(), pl = MP.BY && MP.BY[code];
      if (!pl) return false;
      if (pl.kind === 'hq') return true;
      return !!(this.path && this.path.mega && pl.kind === 'built' && MP.placeOpen(code, this.mapState));
    }
    // who holds a place: a built structure belongs to its builder; anywhere else it is CONTROL (§2)
    ownerOf(code) {
      const MP = OilGame._mapFX(), pl = MP.BY && MP.BY[code];
      if (pl && (pl.kind === 'built' || pl.kind === 'arctic') && this.path && this.path.mega) {
        const s = pl.kind === 'arctic' ? 'ARCTIC_DEV' : pl.requires;
        if (this.structureOwner[s]) return this.structureOwner[s];
      }
      return this.controlOf(code);
    }
    // THE PATH `onshore` rule: domestic ground can be WORKED (sold at). It is not a buyer — no
    // contract is ever dealt there — but it is not a dump either: nothing is shipped, so the
    // barrel sells at spot + ONSHORE_PCT, and the bill arrives as heat (HEAT_ONSHORE).
    domesticAt(code) {
      const MP = OilGame._mapFX(), pl = MP.BY && MP.BY[code];
      return !!(this.path && this.path.onshore && pl && pl.kind === 'onshore');
    }
    // anywhere this seat's cargo can come off the hull this turn
    canDeliverAt(code) { return this.path ? (this.sellableAt(code) || this.domesticAt(code)) : !!((OilGame._mapFX().BY || {})[code] && OilGame._mapFX().BY[code].kind === 'hq'); }
    pathDial(k) { return (this.path && this.path.dials && this.path.dials[k] !== undefined) ? this.path.dials[k] : this.mapDials[k]; }
    // a buyer, drawn: every sellable place except `exclude`; weighted by landed barrels if clustering
    _drawBuyer(exclude) {
      const MP = OilGame._mapFX();
      const pool = MP.CODES.filter(c => this.sellableAt(c) && (exclude || []).indexOf(c) < 0);
      if (!pool.length) return MP.HQS[0];
      const w = pool.map(c => {
        if (!(this.path && this.path.cluster)) return 1;
        const t = this.throughput[c] || {};
        return 1 + this.pathDial('CLUSTER_W') * Object.keys(t).reduce((a, n) => a + t[n], 0);
      });
      let r = this.rng.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    // THE PATH + mega: a structure belongs to whoever raised it, and a structure that RAISES a
    // place ("new strategic locations" — Sea City, the Antarctic Station, the Elevator) opens
    // with a contract on it: the grand opening is a buyer, face-up, for everybody.
    _raisedOnPath(p, key) {
      this.structureOwner[key] = p.name;
      if (!this.path.mega) return;
      const MP = OilGame._mapFX(), S = (MP.STRUCTURES || {})[key] || {};
      (S.raises || []).forEach(code => {
        if (!this.sellableAt(code)) return;
        if (this.path.mode === 'market') {
          if (this.market.indexOf(code) < 0) {
            this.market.push(code);
            if (this.market.length > Math.max(1, this.pathDial('MARKET_SIZE'))) this.market.shift();
            this.emit('contract', { to: code, turn: this.turn, opening: key });
          }
        }
      });
    }
    _fillMarket() {
      const n = Math.max(1, this.pathDial('MARKET_SIZE'));
      while (this.market.length < n) {
        // a contract is dealt where NOBODY is standing — a buyer you are already sitting on is a
        // formality, not a voyage (the same rule the private model's _consign keeps). Falls back
        // to any free buyer if every one is occupied.
        const here = this.players.map(q => q.at).filter(Boolean);
        const free = OilGame._mapFX().CODES.filter(c => this.sellableAt(c) && this.market.indexOf(c) < 0 && here.indexOf(c) < 0);
        const b = this._drawBuyer(free.length ? this.market.concat(here) : this.market);
        if (this.market.indexOf(b) >= 0) break;
        this.market.push(b);
        this.emit('contract', { to: b, turn: this.turn });
      }
    }
    // THE PATH, before the sail: is this seat's route to its buyer longer than it would be
    // with nothing shut? A per-TURN state read, so it sees a detour spread over several turns
    // (the per-move 'longway' flag structurally cannot — see f1e94e7).
    _voyageProbe(p) {
      if (!this.consign || p.barrels <= 0) return;
      const MP = OilGame._mapFX();
      const now = this.nearestBuyer(p, p.at);
      if (now.dist === undefined || now.dist === 0) return;
      this.pathStats.voyageTurns++;
      const open = this.nearestBuyer(p, p.at, { closed: {}, disabled: {}, built: this.mapState.built });
      if (open.dist !== undefined && now.dist > open.dist) {
        this.pathStats.detourTurns++; this.pathStats.detourSteps += now.dist - open.dist;
        this.emit('detour', { player: p.name, at: p.at, to: now.to, cost: now.dist, normally: open.dist });
      }
    }
    // THE PATH, on the sail: sailing through a structure somebody else raised costs you a passage
    _passageToll(p, path) {
      if (!(this.path && this.path.mega) || !path || path.length < 2) return;
      const MP = OilGame._mapFX(), fee = this.pathDial('PASSAGE_TOLL');
      for (let i = 1; i < path.length; i++) {
        const pl = MP.BY[path[i]]; if (!pl || (pl.kind !== 'built' && pl.kind !== 'arctic')) continue;
        const own = this.ownerOf(path[i]);
        const q = own && own !== p.name ? this.players.find(z => z.name === own) : null;
        if (!q) continue;
        const pay = Math.max(0, Math.min(p.value, fee));
        p.value -= pay; q.value += pay;
        this.pathStats.passages++; this.pathStats.passagePaid += pay;
        this.emit('passage', { player: p.name, to: q.name, place: path[i], name: pl.name, paid: pay });
      }
    }
    // THE PATH, on the landing: the contract is discharged. Who gets what — the one place
    // the whole ledger of a delivery is added up (and emitted, so the UI can show it).
    _landContract(p, del) {
      const P = this.path, D = this.mapDials;
      const ledger = { value: del.value, pct: del.pct, consigned: !!del.consigned, domestic: !!del.domestic, points: 1, toll: 0, tollTo: null,
        contractPoints: 0, megaTo: null };
      if (del.consigned) {
        this.pathStats.landed++;
        ledger.contractPoints = this.pathDial('CONSIGN_POINTS') || 0;
        if (ledger.contractPoints) { p.control += ledger.contractPoints; ledger.points += ledger.contractPoints; this.pathStats.contractPoints += ledger.contractPoints; }
      } else if (del.domestic) this.pathStats.domestic++;
      else this.pathStats.dumped++;
      // THE TOLLBOOTH (THE-CONTROL-LAYER §2: "a cut of every rival barrel moved through it")
      if (P.toll) {
        const own = this.ownerOf(p.at);
        const q = own && own !== p.name ? this.players.find(z => z.name === own) : null;
        if (q) {
          const toll = Math.round(del.value * this.pathDial('TOLL_PCT') / 100);
          p.value -= toll; q.value += toll;
          ledger.toll = toll; ledger.tollTo = q.name;
          this.pathStats.tolls++; this.pathStats.tollPaid += toll;
          this.emit('toll', { player: p.name, to: q.name, at: p.at, paid: toll });
        }
      }
      // MEGASTRUCTURE POINTS (CONCEPT): a contract landed AT a structure scores its builder
      const MP = OilGame._mapFX(), pl = MP.BY[p.at];
      if (P.mega && del.consigned && pl && pl.kind === 'built') {
        const own = this.ownerOf(p.at), q = own ? this.players.find(z => z.name === own) : null;
        const pts = this.pathDial('MEGA_POINTS') || 0;
        if (q && pts) { q.control += pts; ledger.megaTo = q.name; this.pathStats.megaPoints += pts; }
        this.pathStats.megaLandings++;
      }
      if (P.mega && del.consigned && pl && pl.kind !== 'built' && this.structureOwner.SPACE_ELEVATOR === p.name
          && this.market.indexOf(p.at) < 0 && p.consignedTo !== p.at) this.pathStats.bypass++;
      // the contract is discharged; the market refills / the seat takes its next
      if (P.mode === 'market') {
        if (del.consigned) {
          const i = this.market.indexOf(p.at);
          if (i >= 0) this.market.splice(i, 1);
          else if (this.market.length) this.market.shift();   // the Elevator's bypass takes the oldest
          this._fillMarket();
        }
      } else this._consign(p);
      this.emit('landed', Object.assign({ player: p.name, at: p.at }, ledger));
      return ledger;
    }
    // what a delivery HERE would pay this seat, itemised — for the human prompt (no side effects)
    previewDelivery(p) {
      const del = this._deliveryValue(p);
      const out = { value: del.value, pct: del.pct, consigned: !!del.consigned, domestic: !!del.domestic, points: 1, toll: 0, tollTo: null,
        contractPoints: 0, squeezed: del.squeezed, premium: del.premium, longWay: del.longWay, incursion: !!del.incursion };
      if (this.path) {
        if (del.consigned) { out.contractPoints = this.pathDial('CONSIGN_POINTS') || 0; out.points += out.contractPoints; }
        if (this.path.toll) { const own = this.ownerOf(p.at); if (own && own !== p.name) { out.toll = Math.round(del.value * this.pathDial('TOLL_PCT') / 100); out.tollTo = own; } }
      }
      return out;
    }

    _deliveryValue(p) {
      const MP = OilGame._mapFX(), D = this.mapDials;
      if (!this.map) return { value: this.price, pct: 100 };
      const t = MP.trafficAt(p.at, this.mapState);
      // THE TRANSFER. A shut gate makes freight scarce, so every cargo that can
      // still move is worth more (the premium) — while every route shut at YOUR
      // node cuts what you can move at all (the squeeze). The same closure pays
      // one seat and strangles another. That is the whole geography of the game.
      const shut = Math.min(D.FREIGHT_CAP, Object.keys(this.mapState.closed).length);
      const premium = shut * D.FREIGHT_PCT;
      let pct = 100 + premium - D.BLOCK_PCT * t.blocked;
      const squeezed = t.blocked > 0;
      if (p.longWay) pct += D.LONGWAY_PCT;
      pct = Math.max(D.BLOCK_FLOOR, pct);
      // you cannot ship out of a field that is on fire
      if (this.crisis && this.burningAt(p.at)) pct = Math.round(pct * this.crisisDials.FIRE_DELIVERY / 100);
      const place = MP.BY[p.at];
      // ONSHORE GROUND PAYS A LITTLE BETTER — it is domestic. Nothing is shipped, no freight is
      // bought, no strait can be shut on you. That is exactly why it is tempting, and exactly why
      // the harm lands on people instead of on cargo: the cheap barrel is the one pulled out from
      // under somebody's house. The bill arrives as HEAT on that place (crisisDials.HEAT_ONSHORE),
      // not as a worse price. See docs/THE-CONTROL-LAYER.md §4.
      if (place && place.kind === 'onshore') pct += D.ONSHORE_PCT;
      // CONSIGNED CARGO (model): the buyer is where the money is. Land it and you are paid for
      // the voyage; dump it anywhere else and you take what the spot market will give you. This
      // is the whole experiment — it turns 'sell' into 'arrive'.
      let consigned = null;
      const buyers = this.consign ? this.buyersFor(p) : [];
      const domestic = this.path ? this.domesticAt(p.at) : false;
      if (buyers.length) {
        consigned = buyers.indexOf(p.at) >= 0;
        if (consigned) pct = pct + D.CONSIGN_BONUS;
        else if (!domestic) pct = Math.round(pct * D.CONSIGN_DUMP / 100);   // domestic ground is not a dump
      }
      let incursion = null;
      if (place && place.kind === 'hq' && place.code !== this.hqOf(p)) {
        pct += D.INCURSION_BONUS;
        incursion = this.seatAtHQ(place.code, p);
      }
      return { value: Math.max(0, Math.round(this.price * pct / 100)), pct, squeezed, incursion,
        blocked: t.blocked, premium, longWay: !!p.longWay, consigned, domestic };
    }

    // ========================================================================
    // THE TABLE — negotiation / table politics (optional; opts.deals).
    // Deal SHAPES live in src/oil-deals.js (dials + verbs, like the card layer);
    // the RULES below are the engine's: what a deal may touch, how it lapses, what
    // betrayal costs, and how a grudge retargets the E.D.D. strike.
    // INVARIANTS (gated in scripts/oil-lab-check.js LAB 6 + oil-sweep.js PART 6):
    //   no deal touches this.oil, and no deal touches this.price.
    // ========================================================================
    dealBetween(a, b) { return this.standing.find(d => (d.a === a && d.b === b) || (d.a === b && d.b === a)) || null; }
    standingFor(p) { return this.standing.filter(d => d.a === p || d.b === p); }
    partnersOf(p) { return this.standingFor(p).map(d => (d.a === p ? d.b : d.a)); }
    // who wears it: the biggest operator at the table who is not one of the two parties.
    scapegoatFor(a, b) {
      const pool = this.players.filter(q => q !== a && q !== b);
      if (!pool.length) return null;
      return pool.reduce((x, y) => (x.control > y.control ? x : (y.control > x.control ? y : (x.holdings(this.price) >= y.holdings(this.price) ? x : y))));
    }

    // upkeep: standing deals pay out, then age. A deal that runs its life LAPSES
    // cleanly — no betrayal mark. Only walking away early is betrayal.
    _dealUpkeep(p) {
      const TY = OilGame._dealsFX().TYPES || {};
      for (const d of this.standingFor(p)) {
        const t = TY[d.type];
        if (t && t.tick) { t.tick(this, d); this.dealStats.ticks++; this.emit('deal_tick', { dealType: d.type, a: d.a.name, b: d.b.name }); }
        d.ticks--;
        if (d.ticks <= 0) {
          this.standing = this.standing.filter(x => x !== d);
          this.dealStats.lapsed++;
          this.emit('deal_end', { dealType: d.type, a: d.a.name, b: d.b.name, how: 'lapsed' });
        }
      }
    }

    _breakDeal(d, breaker) {
      const TY = OilGame._dealsFX().TYPES || {}, D = this.dealDials;
      const victim = breaker === d.a ? d.b : d.a;
      const t = TY[d.type];
      const spoils = (t && t.broke) ? (t.broke(this, d, breaker) || {}) : {};
      breaker.exposure += D.BETRAY_HEAT;                 // it is on the record
      if (!victim.grudges.includes(breaker.id)) victim.grudges.push(breaker.id);
      this.standing = this.standing.filter(x => x !== d);
      this.dealStats.broken++;
      this.emit('deal_break', Object.assign({ dealType: d.type, by: breaker.name, on: victim.name }, spoils));
    }

    // "Hobbesian" / any card that dissolves the table at once.
    breakAllDeals(cause) {
      if (!this.deals) return 0;
      const all = this.standing.slice();
      all.forEach(d => this._breakDeal(d, d.a));         // the offerer is the one who walks
      if (all.length) this.emit('deal_purge', { cause: cause || 'the war of all against all', n: all.length });
      return all.length;
    }

    // FOLD 3 (2026-09-01): the deck you draw from is WHERE YOU LANDED, not a rotation
    // keyed off the turn counter. The old rule had no fiction and could not be said in
    // a sentence; this one ties the cards to the map and explains itself:
    //   an HQ deals DEEDS · open water deals FREEDOM/MARKET · a gate deals COMPETITION
    _deckFor(p) {
      const ROT = ['DEEDS', 'FREEDOM-MARKET', 'COMPETITION'];
      if (!this.map) return ROT[(this.turn - 1) % 3];      // map off -> baseline untouched
      const kind = (OilGame._mapFX().BY[p.at] || {}).kind;
      if (kind === 'hq') return 'DEEDS';
      if (kind === 'gate') return 'COMPETITION';
      return 'FREEDOM-MARKET';
    }

    // THE TABLE — ONE action per turn (FOLD 4, 2026-09-01).
    // Cards and deals used to be two phases that both fired every single turn. They
    // are now one: you draw where you landed, then you either PLAY THE CARD or OPEN
    // NEGOTIATIONS — never both. That is not merely fewer prompts; it is a real
    // tension, because the card in your hand now competes with the deal on the table.
    async _tablePhase(p) {
      const REG = OilGame._dealsFX(), TY = REG.TYPES || {};

      // 1. upkeep and the draw — neither of these is a decision
      if (this.deals) { this._dealUpkeep(p); if (this.dealFreeze > 0) this.dealFreeze--; }
      if (this.cards) {
        const dk = this._deckFor(p);
        const drawn = this.drawCard(dk);
        if (drawn) { p.hand.push(drawn); this.emit('drawcard', { player: p.name, card: drawn, deck: dk }); }
        if (p.hand.length > 3) {
          const dropped = p.hand.shift();
          const FX = OilGame.CARD_FX || (typeof global !== 'undefined' && global.OIL_CARD_FX) || {};
          (this.discards[(FX[dropped] || {}).deck] || []).push(dropped);
        }
      }

      // 2. ONE menu, ONE decision
      const cards = this.cards ? p.hand.slice() : [];
      const moves = (this.deals && REG.dealMoves) ? REG.dealMoves(this, p) : [];
      if (!cards.length && !moves.length) return;
      const options = cards.concat(moves, ['pass']);
      const pick = await this.ask(p, 'table', options, { cards, moves });

      // 3. dispatch
      if (!pick || pick === 'pass') return;
      if (cards.indexOf(pick) >= 0) {                       // ...you played the card
        p.hand.splice(p.hand.indexOf(pick), 1);
        this.playCard(pick, p);
        return;
      }
      if (!this.deals || !REG.parseMove) return;
      const mv = REG.parseMove(this, pick);
      if (!mv) return;
      if (mv.breakUid !== undefined) {                      // ...you walked out
        const d = this.standing.find(x => String(x.uid) === mv.breakUid);
        if (d) this._breakDeal(d, p);
        return;
      }
      const b = mv.target, type = mv.type;                  // ...you made an offer
      if (!b || b === p || !TY[type] || !TY[type].ok(this, p, b)) return;
      const d = { uid: ++this._dealUid, type, a: p, b, ticks: this.dealDials.LIFE, paid: 0, carried: 0 };
      this.dealStats.offers++;
      this.emit('deal_offer', { dealType: type, a: p.name, b: b.name });
      const reply = await this.ask(b, 'dealoffer', ['accept', 'decline'], { deal: d });
      if (reply !== 'accept') { this.dealStats.declined++; this.emit('deal_declined', { dealType: type, a: p.name, b: b.name }); return; }
      TY[type].form && TY[type].form(this, d);
      if (TY[type].standing) this.standing.push(d);
      this.dealStats.formed++;
      this.emit('deal_formed', { dealType: type, a: p.name, b: b.name, standing: !!TY[type].standing, victim: d.victim || null });
    }

    // ---- one active turn = ONE 3-die roll, read on two layers ----------------
    async step() {
      if (this.done) return;
      const D = this.dials, p = this.players[this.idx];
      this._oilMark = this.oil;
      this.turn++;
      if (this.idx === 0) { this.round++; this._settleControl(); }

      // 1. roll the three core bodies (Supply / Weather / World) off the faces table
      let dice = [rollFace(this.rng, D.DIE_FACES), rollFace(this.rng, D.DIE_FACES), rollFace(this.rng, D.DIE_FACES)];
      this.lastDice = dice.slice();

      // 2. three-body read (shared market) — provisional shove
      this.lastShove = shoveOf(dice, D.SHOVE_W);

      // 3. personal layer: the active player may spend a pip to flip the shove sign.
      //    FOLD (2026-09-01): only when the roll is already CHAOTIC. You can only
      //    bend a market that is already moving — and it makes pips precious
      //    instead of a prompt you answer every single turn.
      if (p.pips > 0 && Math.abs(this.lastShove) >= D.T_CHAOS) {
        const choice = await this.ask(p, 'slingshot', ['flip', 'keep']);
        if (choice === 'flip') {
          p.pips--;
          // bump the median die by 1 toward the flip — one pip flips the sign (three_body.py)
          const fMin = Math.min.apply(null, D.DIE_FACES), fMax = Math.max.apply(null, D.DIE_FACES);
          const order = dice.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
          const midIdx = order[1][1];
          dice[midIdx] = this.lastShove >= 0 ? Math.min(fMax, dice[midIdx] + 1) : Math.max(fMin, dice[midIdx] - 1);
          this.lastDice = dice.slice();
          this.lastShove = shoveOf(dice, D.SHOVE_W);
          this.emit('slingshot', { player: p.name });
        }
      }
      if (this.turn % D.PIP_REGEN_EVERY === 0) p.pips = Math.min(DIALS.PIPS_START, p.pips + 1);

      // 4. apply shove to the shared price; add the scarcity premium; set the era.
      //    era reads VOLATILITY (|shove|) only — scarcity moves the LEVEL, not the era.
      let next = this.price + this.lastShove;
      this.scarcity = this.oil <= D.SCARCITY_BAND ? Math.ceil((D.SCARCITY_BAND - this.oil) / D.SCARCITY_DIV) : 0;
      next += this.scarcity;
      // (THE RATCHET was built here and REMOVED — see the RATCHET_* dials for why.)
      this.price = Math.max(D.PRICE_MIN, Math.min(D.PRICE_MAX, next));
      this.era = Math.abs(this.lastShove) >= D.T_CHAOS ? 'CHAOTIC' : 'STABLE';
      this.emit('market', { dice: this.lastDice, shove: this.lastShove, scarcity: this.scarcity, price: this.price, era: this.era });

      // 5. GREEN ANDERS die (expansion) — trigger-only override, no new meter.
      //    Trigger: a CHAOTIC era hidden-layer intervention. Overrides via the
      //    existing numbers (re-rolls the shove into the price; can deepen a swing).
      if (this.expansion && this.era === 'CHAOTIC') {
        const g = this.rng.d6();                    // the green die
        if (g >= D.GREEN_TRIGGER) {                 // default >=5 (~1/3): Anders intervenes
          const inj = (this.lastShove >= 0 ? 1 : -1) * Math.ceil(g / 2);
          this.price = Math.max(D.PRICE_MIN, Math.min(D.PRICE_MAX, this.price + inj));
          this.emit('green', { player: p.name, die: g, inject: inj, price: this.price });

          // ...and on the TOP FACE it does not merely shove the tape — it takes something, from
          // one named seat. Aimed at the leader by holdings: the house leans on whoever is winning.
          if (g >= D.GREEN_PUNITIVE_AT) this._andersPunish();
        }
      }

      // 5.4 FACTION POWER (optional asymmetry): the active player's once-per-turn
      //     passive. Law-safe (never adds oil); runs before E.D.D. arming so a
      //     faction's price/era nudge (e.g. Haddad steadying the tape) is read.
      this._factionPassive(p);

      // 5.45 THE MAP (optional): the same three bodies that moved the price also
      //      say how far the world moved. Sail, and find out what the sea is doing.
      if (this.map) await this._mapPhase(p);

      // 5.5 THE TABLE (optional): draw where you landed, then take ONE action —
      //     play the card, or open negotiations. Never both (FOLD 4). Neither cards
      //     nor deals ever add oil, so the collapse clock stays reachable.
      if (this.cards || this.deals) await this._tablePhase(p);

      // 6. movement / HQ pressure: act, or take the hold penalty (always move)
      //    With THE MAP on you can only sell where there is somebody to sell to —
      //    an HQ. Mid-ocean you are IN TRANSIT: no claim, and no idleness penalty,
      //    because a hull under way is not a hull sitting still. That is exactly
      //    what a shut canal costs you: turns, and turns are oil.
      if (this.map && !(this.atHQ(p) || (this.path && (this.sellableAt(p.at) || this.domesticAt(p.at))))) {
        this.mapStats.atSea++;
        this.emit('intransit', { player: p.name, at: p.at, place: (OilGame._mapFX().BY[p.at] || {}).name });
      } else {
        const acts = ['claim', 'hold'];
        if (this.canBuild(p)) acts.push('build');
        // IWS rides HERE, on the step that already asks a question — you pay
        // instead of selling. Never a new prompt (docs/THE-FOLDS.md budget).
        if (this.canCallIWS(p)) acts.push('iws');
        if (this.canRetain(p)) acts.push('retainer');
        const act = await this.ask(p, 'action', acts);
        if (act === 'iws' && this.canCallIWS(p)) { this.callIWS(p); }
        else if (act === 'retainer' && this.canRetain(p)) { this.buyRetainer(p); }
        else if (act === 'build' && this.canBuild(p)) {
          const opts = this.buildable();
          const pick = opts.length === 1 ? opts[0] : await this.ask(p, 'structure', opts);
          const raised = opts.indexOf(pick) >= 0 ? pick : opts[0];
          if (this.build(raised)) {
            p.control -= this.mapDials.BUILD_COST; p.exposure += this.mapDials.BUILD_HEAT;
            if (this.path) this._raisedOnPath(p, raised);   // THE PATH: you raised it, you own it
          }
        } else
        if (act === 'claim' && p.barrels >= D.CLAIM_COST) {
          const del = this._deliveryValue(p);
          p.barrels -= D.CLAIM_COST; p.control += 1;
          p.value += del.value;                      // sell a barrel into the market
          // ...and that sale is your claim on the ground. THE PATH: a landed contract is a cargo
          // of record, and may count for more on the station meter (CONSIGN_THROUGHPUT).
          this._addThroughput(p, p.at, (this.path && del.consigned) ? this.pathDial('CONSIGN_THROUGHPUT') : D.CLAIM_COST);
          if (this.path) {
            if (del.consigned) this.mapStats.consignHit = (this.mapStats.consignHit || 0) + 1;
            else if (del.domestic) this.mapStats.consignDomestic = (this.mapStats.consignDomestic || 0) + 1;
            else this.mapStats.consignDump = (this.mapStats.consignDump || 0) + 1;
            del.ledger = this._landContract(p, del);
          } else
          if (this.consign) {                          // the contract is discharged; take the next
            if (del.consigned) this.mapStats.consignHit = (this.mapStats.consignHit || 0) + 1;
            else this.mapStats.consignDump = (this.mapStats.consignDump || 0) + 1;
            this._consign(p);
          }

          // ...and if that ground is ONSHORE, working it is what poisons it. No gate has to shut
          // and no war has to start — this is the ordinary business of production doing the harm.
          const _MP = OilGame._mapFX();                 // step() has no MP of its own
          if (this.crisis && _MP.BY && (_MP.BY[p.at] || {}).kind === 'onshore') {
            this.addHeat(p.at, this.crisisDials.HEAT_ONSHORE, 'production on the ground');
            this.mapStats.onshoreWorked = (this.mapStats.onshoreWorked || 0) + 1;
          }
          if (this.map) {
            if (del.squeezed) this.mapStats.squeezed++;
            if (del.premium > 0) this.mapStats.premiums++;
            if (del.incursion) {
              this.mapStats.incursions++;
              p.exposure += this.mapDials.INCURSION_HEAT;
              del.incursion.exposure += this.mapDials.INCURSION_HIT;
              this.emit('incursion', { player: p.name, on: del.incursion.name, at: p.at });
              this.addHeat(p.at, this.crisisDials.HEAT_INCURSION, 'an incursion');
            }
            this.emit('deliver', { player: p.name, at: p.at, value: del.value, pct: del.pct,
              blocked: del.blocked, premium: !!p.longWay });
          }
        } else {
          // FOLD 1 (2026-09-01): ONE idleness rule. You are idle only if you neither
          // MOVED nor SOLD this turn — "move or sell". Before this, a seat that stayed
          // put and then held was billed twice for the same act of doing nothing
          // (it fired on ~10% of turns). "Always move or suffer" survives intact:
          // moving still exempts you, and moving still costs you the sale.
          if (!this.map || !p.moved) p.exposure += D.HOLD_PENALTY;
        }
      }

      // 7. DEPLETE the monotonic oil clock (this is what guarantees terminus)
      //    LIVE INVARIANTS for the map: nothing may ever ADD oil, and the 8 HQs
      //    must stay mutually reachable. Recorded, then gated in LAB 8 / PART 7.
      if (this.map) {
        if (this.oil > this._oilMark) this._oilAdded = (this._oilAdded || 0) + 1;
        const MP = OilGame._mapFX();
        if (MP.hqsConnected && !MP.hqsConnected(this.mapState)) this._hqSplit = (this._hqSplit || 0) + 1;
      }
      const fire = this._fireBurn();
      const burn = D.BURN_BASE + Math.floor(this.price / D.BURN_PER_PRICE) + fire;
      this.oil = Math.max(0, this.oil - burn);
      this.emit('deplete', { oil: this.oil, burn, fire });

      // 7.5 BENCHMARK rubber band (Charter L3): the control leader carries danger by
      //     rule — +1 exposure each turn. Off in classic. Leading is never free.
      if (this.rubberBand) {
        const lead = Math.max(...this.players.map(q => q.control));
        if (lead > 0) this.players.filter(q => q.control === lead).forEach(q => { q.exposure += 1; });
      }

      // 8. arm E.D.D.? (price+instability, OR oil backstop)
      const annihilation = this.crisis && this.totalHeat() >= this.crisisDials.ANNIHILATION_AT;
      if (!this.edd && (annihilation || (this.price >= D.EDD_PRICE && this.era === 'CHAOTIC') || this.oil <= D.EDD_OIL)) {
        this.edd = true;
        if (annihilation) this.crisisStats.annihilation++;
        this.end_reason = annihilation ? 'E.D.D. — too much of the world on fire'
          : this.oil <= D.EDD_OIL ? 'E.D.D. — the oil ran out' : 'E.D.D. — price + instability';
        this.emit('edd_begin', { reason: this.end_reason, price: this.price, oil: this.oil });
      }

      // 9. if E.D.D. is live, this player resolves a predatory roll
      if (this.edd) await this._resolveEDD(p);

      // 10. advance / end
      this.idx = (this.idx + 1) % this.players.length;
      if (this.oil <= 0 || this.turn >= this.maxTurns) this._end();
    }

    async _resolveEDD(p) {
      const D = this.dials, roll = this.rng.d6(), outcome = D.EDD_ROLL[roll];
      // player may steer toward EAT/DIVIDE/DESTROY within what the roll allows (kept simple)
      const choice = await this.ask(p, 'edd', [outcome]);
      const victims = this.players.filter(q => q !== p);
      // WHO GETS EATEN. Without the table, the protocol simply hits the biggest
      // holder. With THE TABLE on, the deals you made decide where it lands:
      //   1. a GRUDGE first — you strike the one who broke a deal with you, over
      //      the richest seat, and the grudge is spent (revenge taken once);
      //   2. otherwise your standing PARTNERS are SHIELDED — that shield is the
      //      whole reason to make a deal, and the whole reason the endgame is a
      //      defection cascade;
      //   3. if everyone left is a partner, the protocol finds nobody. The cartel
      //      walks out of the collapse together and the verdict decides it on
      //      control > exposure > holdings.
      let pool = victims, spared = false, revenge = false;
      if (this.deals && victims.length) {
        const grudged = victims.filter(q => p.grudges.includes(q.id));
        if (grudged.length) { pool = grudged; revenge = true; }
        else {
          const partners = this.partnersOf(p);
          pool = victims.filter(q => partners.indexOf(q) < 0);
          if (!pool.length) spared = true;
        }
      }
      const target = pool.length ? pool.reduce((a, b) => (a.holdings(this.price) > b.holdings(this.price) ? a : b)) : null;
      if (this.deals) {
        if (spared) { this.dealStats.spared++; this.emit('edd_spared', { player: p.name, partners: this.partnersOf(p).map(q => q.name) }); }
        if (revenge && target) { this.dealStats.revenge++; p.grudges = p.grudges.filter(id => id !== target.id); this.emit('edd_revenge', { player: p.name, on: target.name }); }
      }
      switch (choice) {
        case 'EAT':     if (target) { p.control += 1; p.value += target.barrels * this.price; target.barrels = 0; target.exposure += 3;
          // "acquire territory": you take their ground — they wash up at their own HQ.
          if (this.map && target.at !== p.at) { const MP = OilGame._mapFX(); const h = this.hqOf(target); target.at = (h && MP.BY[h]) ? h : target.at; }
        } break;
        case 'DIVIDE':  if (target) { const half = Math.floor(target.control / 2); target.control -= half; p.control += half; } break;
        case 'DESTROY': if (target) { target.control = Math.max(0, target.control - 1); target.exposure += 2; this.oil = Math.max(0, this.oil - 1); }
          // EDD_PROTOCOL's own word for DESTROY is "disable route": with the map on,
          // the protocol shuts the gate nearest the victim and the world gets longer.
          if (this.map && target) this._eddCloseNear(target);
          break;
      }
      if (this.crisis && target && target.at) this.addHeat(target.at, this.crisisDials.HEAT_EDD, 'the Protocol');
      this.eddLog.push({ by: p.name, roll, outcome: choice, on: target && target.name });
      this.emit('edd', { player: p.name, roll, outcome: choice, on: target && target.name, revenge: revenge || undefined, spared: spared || undefined });
    }


    // DESTROY "disable route": shut the gate that hurts this victim most — the
    // nearest one to where they stand. The map itself becomes a weapon.
    _eddCloseNear(victim) {
      const MP = OilGame._mapFX();
      if (!MP.reach || !victim.at) return;
      const r = MP.reach(victim.at, 99, this.mapState);
      const gates = MP.GATES.filter(gcode => r.dist[gcode] !== undefined && !this.mapState.closed[gcode]);
      if (!gates.length) return;
      gates.sort((a, b) => (r.dist[a] - r.dist[b]) || (a < b ? -1 : 1));
      for (const gcode of gates) if (this.closeGate(gcode, this.mapDials.CLOSE_TURNS)) return;
    }

    _end() {
      if (this.done) return;
      this.done = true;
      if (!this.edd) { this.edd = true; this.end_reason = this.end_reason || 'E.D.D. — the oil ran out'; this.emit('edd_begin', { reason: this.end_reason, price: this.price, oil: this.oil }); }
      // graded VERDICT (Charter G8/G9): most control, then least exposure, then holdings.
      const ranked = this.players.slice().sort((a, b) =>
        b.control - a.control || a.exposure - b.exposure || b.holdings(this.price) - a.holdings(this.price));
      this.winner = ranked[0];
      this.ranking = ranked;
      this.end_reason = this.end_reason || 'oil exhausted';
      this.emit('gameover', { winner: this.winner.name, reason: this.end_reason });
    }

    async run() { let guard = 0; while (!this.done && guard++ < this.maxTurns + 50) await this.step(); return this; }

    // a graded "Favor"-style score for the verdict screen
    favor(p) { return p.control * 5 - p.exposure + Math.floor(p.holdings(this.price) / 10); }
  }

  global.OilGame = OilGame;
  global.OIL_DIALS = DIALS;
  global.OIL_EDITIONS = EDITIONS;
  global.oilShove = shoveOf;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OilGame, makeRng, shoveOf, DIALS, EDITIONS, POLICIES };
})(typeof window !== 'undefined' ? window : globalThis);
